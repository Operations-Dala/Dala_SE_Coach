import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';

/**
 * Coach Agent (Self-Learning)
 * Synthesizes outputs from all specialist agents into a highly personalized coaching message.
 * After each run, updates its own learned patterns per SE (self-learning loop).
 */

export async function readCoachPatterns(seName) {
  const { data } = await supabase
    .from('coach_patterns')
    .select('patterns_json')
    .eq('se_name', seName)
    .maybeSingle();
  return data?.patterns_json || null;
}

export async function runCoachAgent(apiKey, {
  se,
  positionKey,
  positionLabel,
  zone,
  performanceOutput,
  behaviourOutput,
  debtOutput,
  resourceOutput,
  recorderMemory,
  coachPatterns,
  traitsText,
  feedbackData,
  activeBrands,
  totalSEs,
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const missedBrands = activeBrands.filter(b => {
    try { return !JSON.parse(se.brand_coverage || '{}')[b]; } catch { return true; }
  });

  const feedbackSection = buildFeedbackSection(feedbackData);

  // Build context blocks
  const traitsBlock = traitsText
    ? `SE TRAIT PROFILE:\n${traitsText}\n`
    : '';

  const patternsBlock = coachPatterns
    ? `WHAT HAS WORKED PREVIOUSLY FOR THIS SE (self-learned patterns):\n${JSON.stringify(coachPatterns, null, 2)}\n`
    : '';

  const memoryBlock = recorderMemory
    ? `RECORDER MEMORY (long-term knowledge of this SE):\n${JSON.stringify(recorderMemory, null, 2)}\n`
    : 'RECORDER MEMORY: First session — no prior history.\n';

  const resourceBlock = resourceOutput?.resources?.length
    ? `RESEARCH AGENT INSIGHTS:\n${resourceOutput.resources.map(r =>
        `• [${r.topic}] ${r.insight}\n  → Apply: ${r.application}`
      ).join('\n')}\n${resourceOutput.key_recommendation ? `Key recommendation: ${resourceOutput.key_recommendation}` : ''}\n`
    : '';

  const roleContext = buildRoleContext(positionKey);

  const prompt = `You are an expert, self-learning sales coach for Speckless. You receive intelligence from five specialized agents and must write a deeply personalized coaching message. Return the message text ONLY — no JSON, no labels.

${traitsBlock}
${patternsBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFORMANCE AGENT:
• Level: ${performanceOutput.performance_level} | Trend: ${performanceOutput.score_trend}
• Trajectory: ${performanceOutput.week_trajectory}
• Critical metric: ${performanceOutput.critical_metric}
• Gaps: ${(performanceOutput.key_gaps || []).join(' | ')}
• Strengths: ${(performanceOutput.key_strengths || []).join(' | ')}
• Zone position: ${performanceOutput.zone_position}
• Risk flags: ${(performanceOutput.risk_flags || []).join(', ') || 'None'}

BEHAVIOUR AGENT:
• Personality: ${behaviourOutput.personality_type}
• Communication style: ${behaviourOutput.communication_style}
• Recommended tone: ${behaviourOutput.recommended_tone}
• Motivation drivers: ${(behaviourOutput.motivation_drivers || []).join(', ')}
• Personalization hooks: ${(behaviourOutput.personalization_hooks || []).join(', ')}
• AVOID in message: ${(behaviourOutput.avoid || []).join(', ')}
• Behaviour notes: ${behaviourOutput.behaviour_notes}

DEBT AGENT:
• Status: ${debtOutput.debt_status} (${se.debt_score}/30) | Zone standing: ${debtOutput.zone_standing}
• Priority: ${debtOutput.priority}
• Coach angle: ${debtOutput.coach_message_angle}
• Suggested actions: ${(debtOutput.suggested_actions || []).join(' | ')}
${debtOutput.zone_debt_alert ? '⚠ ZONE DEBT ALERT: Systemic debt issue in this zone — escalate.' : ''}
${debtOutput.senior_zone_note ? `Senior note: ${debtOutput.senior_zone_note}` : ''}

${memoryBlock}
${resourceBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TODAY'S SNAPSHOT:
• SE: ${se.se_name} | Role: ${positionLabel} | Zone: ${zone}
• Score: ${se.total_score}/100 | Rank: #${se.rank} of ${totalSEs}
• Stores: ${se.stores_visited} | Brands: ${se.brands_ordered}/${activeBrands.length}
• Value: ₦${Number(se.value_of_orders).toLocaleString()} | Check-in: ${se.resumption_time || '—'}
• Missed brands: ${missedBrands.slice(0, 5).join(', ') || 'None — full coverage!'}
${feedbackSection ? `\nFIELD FEEDBACK FROM TODAY:\n${feedbackSection}` : ''}

ROLE COACHING ANGLE:
${roleContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WRITE THE COACHING MESSAGE for ${se.se_name}:
Requirements:
1. Use the ${behaviourOutput.communication_style} communication style and ${behaviourOutput.recommended_tone} tone
2. Open by addressing their role-specific priority (not generic metrics)
3. Acknowledge the specific strength the Performance Agent identified
4. Call out the critical metric with a concrete fix
${missedBrands.length > 0 ? '5. Name the top missed brands they must hit tomorrow' : '5. Affirm full brand coverage as a non-negotiable standard to maintain'}
${feedbackSection ? '6. Reference a specific field observation they submitted' : '6. (No field feedback to reference today)'}
7. Apply the debt agent angle where relevant
8. Use any applicable research insight from the Resource Agent
9. Draw on recorder memory for continuity ("last week you..." or "you've been consistently...")
10. Close with ONE clear, specific action for tomorrow
11. Do NOT use: ${(behaviourOutput.avoid || []).join(', ') || 'generic phrases'}

Length: 150–250 words. Write as if speaking directly to this person. No templates — this message must be unmistakably for ${se.se_name.split(' ')[0]}.`;

  const result = await model.generateContent(prompt);
  const message = result.response.text().trim();

  // Self-learning: update coach patterns asynchronously (non-blocking)
  updateCoachPatterns(apiKey, se.se_name, {
    behaviourOutput, performanceOutput, message, coachPatterns,
  }).catch(() => {});

  return message;
}

async function updateCoachPatterns(apiKey, seName, {
  behaviourOutput, performanceOutput, message, coachPatterns,
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `You are updating a self-learning pattern store for a coaching AI. Record what was used and learned this session. Return JSON ONLY.

SE: ${seName}
EXISTING PATTERNS:
${coachPatterns ? JSON.stringify(coachPatterns, null, 2) : 'None yet — create initial record.'}

THIS SESSION:
- Communication style applied: ${behaviourOutput.communication_style}
- Tone used: ${behaviourOutput.recommended_tone}
- Performance level: ${performanceOutput.performance_level}
- Critical metric addressed: ${performanceOutput.critical_metric}
- Message (first 300 chars): ${message.slice(0, 300)}

Update and return the patterns (keep arrays ≤ 8 items, remove least relevant if over limit):
{
  "effective_approaches": ["approaches and styles that have been applied for this SE"],
  "message_styles": ["message framing styles that fit this SE's communication style"],
  "recurring_themes": ["themes that keep appearing in this SE's coaching"],
  "coach_notes": "evolving coach notes — what to remember for next session",
  "sessions_count": ${(coachPatterns?.sessions_count || 0) + 1}
}`;

  const result    = await model.generateContent(prompt);
  const raw       = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();
  const newPatterns = JSON.parse(raw);

  await supabase
    .from('coach_patterns')
    .upsert(
      { se_name: seName, patterns_json: newPatterns, last_updated: new Date().toISOString() },
      { onConflict: 'se_name' }
    );
}

function buildRoleContext(positionKey) {
  const map = {
    corporate_se: 'Focus on brand partner introductions and corporate store listings. Do NOT coach on order counts.',
    senior_se:    'Coach on zone leadership, debt accountability, and brand spread across the zone. Flag junior SE underperformance if relevant.',
    junior_se:    'Core pillars: 7+ stores, first check-in before 9 AM, full brand pitch, survey filed. Be direct and practical.',
    trial:        'Emphasise onboarding consistency and habit-building. Be encouraging but set clear behavioural expectations.',
    sales_executive: 'Standard daily pillars: store count, brand coverage, time discipline, and order quality.',
  };
  return map[positionKey] || map.sales_executive;
}

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
