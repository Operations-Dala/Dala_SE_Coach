import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

let _cachedKB = null;
function loadKnowledgeBase() {
  if (_cachedKB !== null) return _cachedKB;
  try {
    const kbPath = path.join(process.cwd(), 'lib', 'coaching-knowledge-base.md');
    const content = fs.readFileSync(kbPath, 'utf8');
    _cachedKB = content.includes('not yet populated') ? '' : content;
  } catch {
    _cachedKB = '';
  }
  return _cachedKB;
}

/**
 * Two-step Gemini coaching pipeline for a single SE.
 *
 * Step 1 — Analyst Agent: produces structured JSON analysis
 * Step 2 — Coach Agent: uses analysis + traits to write personalized message
 *
 * @returns {{ analysis: Object, message: string }}
 */
export async function generateCoaching(apiKey, {
  se,             // daily_report row
  history,        // last 7 coaching_history rows for this SE
  teamAvg,        // { stores_visited, brands_ordered, value_of_orders, total_score }
  totalSEs,       // total full SEs for rank display
  traitsText,     // SE traits profile text (may be null)
  activeBrands,   // string[] of all active brand names
  feedbackData,   // { store_name → { brand_name → [{question, answer}] } } (may be null)
  positionKey,    // 'corporate_se' | 'senior_se' | 'sales_executive' | 'junior_se' | 'trial'
  positionLabel,  // human-readable label
  zone,           // zone name
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const brandCoverage = parseBrandCoverage(se.brand_coverage);
  const missedBrands  = activeBrands.filter(b => !brandCoverage[b]);
  const coveredBrands = activeBrands.filter(b => brandCoverage[b]);

  const metricsSummary  = buildMetricsSummary(se, teamAvg, totalSEs, activeBrands);
  const historyText     = buildHistoryText(history);
  const feedbackSection = buildFeedbackSection(feedbackData);
  const roleContext     = buildRoleContext(positionKey, positionLabel, zone);

  // ── Step 1: Analyst Agent ──────────────────────────────────────────────────
  const analystPrompt = `You are a field sales performance analyst for Speckless.

Analyze the following sales executive's daily performance data and return a JSON object ONLY (no markdown, no explanation).

SALESMAN: ${se.se_name}
ROLE: ${positionLabel || 'Sales Executive'} | ZONE: ${zone || 'Unknown'}
DATE: ${se.report_date}

ROLE-SPECIFIC KPIs FOR THIS POSITION:
${roleContext.kpis}

TODAY'S METRICS:
${metricsSummary}

BRANDS COVERED (${coveredBrands.length}/${activeBrands.length}): ${coveredBrands.join(', ') || 'None'}
BRANDS MISSED: ${missedBrands.join(', ') || 'None'}

${feedbackSection ? `FIELD FEEDBACK FROM TODAY:\n${feedbackSection}\n` : ''}
COACHING HISTORY (last 7 days):
${historyText || 'No previous history'}

Evaluate ${se.se_name} against their role's specific KPIs, not generic targets. ${roleContext.analystInstruction}

Return this exact JSON shape:
{
  "gaps": ["string", "string"],
  "strengths": ["string"],
  "trend": "improving" | "declining" | "flat",
  "priority_action": "one specific action for tomorrow aligned to their role",
  "risk_level": "low" | "medium" | "high",
  "role_specific_note": "one sentence about how they are performing against their role unique expectations"
}`;

  const analystResult = await model.generateContent(analystPrompt);
  const analystRaw    = analystResult.response.text().trim();

  let analysis;
  try {
    const json = analystRaw.replace(/^```json?\n?/, '').replace(/```$/, '').trim();
    analysis = JSON.parse(json);
  } catch {
    analysis = { gaps: [], strengths: [], trend: 'flat', priority_action: analystRaw, risk_level: 'medium', role_specific_note: '' };
  }

  // ── Step 2: Coach Agent ────────────────────────────────────────────────────
  const traitsSection = traitsText
    ? `WHAT YOU KNOW ABOUT THIS SE:\n${traitsText}\n\n`
    : '';

  const kb = loadKnowledgeBase();
  const kbSection = kb
    ? `COACHING KNOWLEDGE BASE (use frameworks appropriate to this SE's risk level and trend):\n${kb}\n\n`
    : '';

  // Select KB guidance based on analyst output
  const frameworkHint = buildFrameworkHint(analysis.risk_level, analysis.trend);

  const coachPrompt = `You are a direct, results-focused sales coach for Speckless.
${kbSection}
${traitsSection}
ANALYST REPORT FOR ${se.se_name} (${positionLabel || 'Sales Executive'} | ${zone || 'Unknown Zone'}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gaps:             ${analysis.gaps.join('; ')}
Strengths:        ${analysis.strengths.join('; ')}
Trend:            ${analysis.trend}
Risk Level:       ${analysis.risk_level}
Role Assessment:  ${analysis.role_specific_note || '—'}
Priority Action:  ${analysis.priority_action}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TODAY'S SCORE: ${se.total_score}/100 (Rank #${se.rank})
MISSED BRANDS: ${missedBrands.join(', ') || 'None — full coverage!'}
${feedbackSection ? `\nKEY FIELD NOTES FROM TODAY:\n${feedbackSection}\n` : ''}
ROLE-SPECIFIC COACHING ANGLE:
${roleContext.coachInstruction}

FRAMEWORK GUIDANCE FOR THIS MESSAGE:
${frameworkHint}

Write a coaching message for ${se.se_name} that is DRIVEN by the analyst findings above. The analyst report is your primary guide — do not ignore gaps or override the risk level with generic positivity.

Your message must:
1. Open by addressing their role-specific KPIs (not generic sales metrics)
2. Acknowledge the specific strength identified by the analyst
3. Call out the most critical gap with a concrete, role-appropriate fix
4. ${missedBrands.length > 0 ? `Name the top missed brands they must prioritise tomorrow` : 'Reinforce full brand coverage as a standard to protect'}
5. If field feedback exists, reference a specific obstacle or observation they submitted
6. Close with the analyst's priority action stated clearly and directly

Length: 150–250 words. Tone: direct, professional, encouraging. No generic advice. Speak to this person's specific role and zone.`;

  const coachResult = await model.generateContent(coachPrompt);
  const message     = coachResult.response.text().trim();

  return { analysis, message };
}

/**
 * Run coaching for all SEs in parallel (Promise.all).
 */
export async function generateTeamCoaching(apiKey, seDataArray) {
  return Promise.all(
    seDataArray.map(seData =>
      generateCoaching(apiKey, seData).catch(err => ({
        analysis: null,
        message: `Error generating coaching: ${err.message}`,
      }))
    )
  );
}

function parseBrandCoverage(json) {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}

function buildMetricsSummary(se, teamAvg, totalSEs, activeBrands = []) {
  return `
Resumption Time:  ${se.resumption_time || 'Unknown'}
Stores Visited:   ${se.stores_visited} (team avg: ${teamAvg.stores_visited?.toFixed(1)})
Brands Ordered:   ${se.brands_ordered} out of ${activeBrands.length} brands (team avg: ${teamAvg.brands_ordered?.toFixed(1)})
Orders Generated: ${se.orders_generated}
Value of Orders:  ₦${Number(se.value_of_orders).toLocaleString()} (team avg: ₦${Number(teamAvg.value_of_orders || 0).toLocaleString()})
Complete Reports: ${se.complete_report}
Score Breakdown:
  Time:       ${se.time_score}/5
  Visits:     ${se.visit_score}/10
  Brands:     ${se.brand_score}/40
  Efficiency: ${se.efficiency_score}/15
  Debt:       ${se.debt_score}/30
  TOTAL:      ${se.total_score}/100  (Rank #${se.rank} of ${totalSEs})
`.trim();
}

function buildHistoryText(history) {
  if (!history || history.length === 0) return '';
  return history
    .map(h => `[${h.report_date}] Score: ${h.total_score || '?'} — ${h.coaching_message?.slice(0, 120)}...`)
    .join('\n');
}

/**
 * Build role-specific context injected into both analyst and coach prompts.
 * Derived from the Speckless SE metrics document (March 6, 2026).
 */
function buildRoleContext(positionKey, positionLabel, zone) {
  const contexts = {
    corporate_se: {
      kpis: `- Number of brand partners introduced into corporate supermarkets (PRIMARY metric)
- Weekly brand partner status tracking: introduced / listed / confident to list / no interest
- Number of corporate store chains where brand partners are actively stocked
- Corporate survey completion (product visibility, stock, store status)
- NOT evaluated on daily order count or daily visit volume`,
      analystInstruction: `Focus on brand partner pipeline depth and corporate store penetration, not order volume.`,
      coachInstruction: `This is a Corporate SE. Do NOT coach on order counts. Focus on brand partner introductions, corporate store listings, and follow-up pipeline. Her success multiplies across entire retail chains.`,
    },
    senior_se: {
      kpis: `- Zone aggregate performance (their juniors' results reflect on them)
- Brand spread across zone orders (brand coverage quality, not just quantity)
- Debt collection progress this week
- Maximum ~5 store visits per day (oversight role, not high-volume coverage)
- Timely order resumption across the zone
- Quality of junior SE supervision and mentoring`,
      analystInstruction: `Evaluate zone oversight quality, debt collection, and brand spread. Note that 5 store visits is the expected ceiling for this role, not a gap.`,
      coachInstruction: `This is a Senior SE. Coaching must address zone leadership and debt accountability. If juniors in their zone are underperforming, flag it. Brand spread across zone orders is more important than individual store count.`,
    },
    junior_se: {
      kpis: `- Minimum 7 store visits per day (hard floor)
- First store check-in before 9:00 AM
- Order raising to prevent out-of-stock situations
- Merchandising quality (shelf visibility, cleanliness, stock monitoring)
- Survey report completion
- Market intelligence: reporting slow-moving products, competitive pricing`,
      analystInstruction: `7 stores is the hard minimum. A 9 AM first check-in is non-negotiable. Flag any shortfall in either as a critical gap.`,
      coachInstruction: `This is a Junior SE. Core expectations are: 7+ stores, first check-in before 9 AM, full brand pitch at every store, survey filed. Coach directly and practically against these four pillars.`,
    },
    trial: {
      kpis: `- Onboarding progress: learning product catalog, survey system, and store routes
- If operating as junior: 7 store minimum, 9 AM first check-in, surveys
- Evaluated flexibly based on actual role during trial period`,
      analystInstruction: `Evaluate based on their actual field role during the trial. Note whether they are operating at junior or senior level.`,
      coachInstruction: `This is a Trial SE. Coaching emphasis is onboarding consistency and building good habits. Be encouraging but set clear behavioral expectations for the trial period.`,
    },
    sales_executive: {
      kpis: `- Minimum 8 store visits per day
- First check-in before 9:00 AM preferred, 9:00 AM hard target
- Brand coverage across all 24 active brand partners
- Order value and complete report submission
- Survey and feedback report completion`,
      analystInstruction: `Evaluate against standard SE KPIs: stores, timing, brand coverage, and order value.`,
      coachInstruction: `This is a Sales Executive. Coach on the standard daily pillars: store count, brand coverage, time discipline, and order quality.`,
    },
  };

  return contexts[positionKey] || contexts.sales_executive;
}

/**
 * Select KB framework guidance based on analyst risk level and trend.
 * This ensures the coach uses the RIGHT psychology tool for the SE's situation.
 */
function buildFrameworkHint(riskLevel, trend) {
  if (riskLevel === 'high' || trend === 'declining') {
    return `This SE is at elevated risk or declining. Prioritize:
- SBI Feedback Model: be specific about what happened, the impact, and avoid generic judgment
- Reattribution Technique: gently redirect external blame to controllable actions
- Implementation Intentions: end with a specific if-then commitment for tomorrow
- Rebuilding confidence phrases from the High-Impact Coaching Phrases section`;
  }
  if (riskLevel === 'medium') {
    return `This SE is plateauing or showing mixed signals. Prioritize:
- GROW Model: use Reality + Options stages to surface what they could do differently
- Locke & Latham: set one specific, measurable target for tomorrow
- Peer comparison framing: show the gap to the next rank clearly and specifically`;
  }
  // low risk / improving
  return `This SE is performing well or improving. Prioritize:
- Growth Mindset: praise process over outcome; build conscious competence
- Stretch goal framing: raise the bar with "what would it take to get to X?"
- Autonomy trigger: invite their strategy rather than assigning actions
- Recognition phrases from the High-Impact Coaching Phrases section`;
}

/**
 * Build a concise feedback section for the AI prompt.
 * Only includes non-empty answers. Capped at 10 entries to avoid token bloat.
 */
function buildFeedbackSection(feedbackData) {
  if (!feedbackData || Object.keys(feedbackData).length === 0) return '';

  const lines = [];
  for (const [store, brands] of Object.entries(feedbackData)) {
    for (const [brand, qaList] of Object.entries(brands)) {
      for (const { question, answer } of qaList) {
        if (answer?.trim()) {
          lines.push(`[${store} / ${brand}] ${question}: "${answer}"`);
          if (lines.length >= 10) break;
        }
      }
      if (lines.length >= 10) break;
    }
    if (lines.length >= 10) break;
  }

  return lines.join('\n');
}
