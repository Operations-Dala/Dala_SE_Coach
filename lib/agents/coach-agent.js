import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';

/**
 * Coach Agent — Digital Performance Coach
 * Synthesizes outputs from all specialist agents into a highly personalized coaching message.
 * Self-determines tone (3 axes: Directness × Urgency × Warmth) from behavioral data.
 * Infers Big Five personality proxies from observed patterns — no explicit assessment needed.
 * Tracks urgency level over time and auto-escalates when no improvement is detected.
 *
 * Returns: { message, urgency_level, directness, warmth, urgency_escalated }
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
  feedbackOutput,
  recorderMemory,
  coachPatterns,
  traitsText,
  feedbackData,
  activeBrands,
  totalSEs,
  dailyExpense = 0,
  dailyExpenseLimit = 4000,
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const missedBrands = activeBrands.filter(b => {
    try { return !JSON.parse(se.brand_coverage || '{}')[b]; } catch { return true; }
  });

  const feedbackSection = buildFeedbackIntelligenceBlock(feedbackOutput, feedbackData);

  const traitsBlock = traitsText
    ? `SE TRAIT PROFILE:\n${traitsText}\n`
    : '';

  const patternsBlock = coachPatterns
    ? `SELF-LEARNED PATTERNS FOR THIS SE:\n${JSON.stringify(coachPatterns, null, 2)}\n`
    : '';

  const memoryBlock = recorderMemory
    ? `RECORDER MEMORY (long-term knowledge of this SE):\n${JSON.stringify(recorderMemory, null, 2)}\n`
    : 'RECORDER MEMORY: First session — no prior history.\n';

  const resourceBlock = resourceOutput?.resources?.length
    ? `RESEARCH INSIGHTS:\n${resourceOutput.resources.map(r =>
        `• [${r.topic}] ${r.insight}\n  → Apply: ${r.application}`
      ).join('\n')}\n`
    : '';

  const roleContext = buildRoleContext(positionKey);

  const behavioralPatternsBlock = (performanceOutput.behavioral_patterns || []).length > 0
    ? `BEHAVIORAL PATTERNS (across recent sessions):\n${(performanceOutput.behavioral_patterns || []).map(p => `• ${p}`).join('\n')}\n`
    : '';

  const memoryPatternsBlock = recorderMemory
    ? [
        recorderMemory.punctuality_pattern ? `• Punctuality: ${recorderMemory.punctuality_pattern}` : '',
        recorderMemory.store_visit_pattern ? `• Store visits: ${recorderMemory.store_visit_pattern}` : '',
        recorderMemory.brand_coverage_pattern ? `• Brand coverage: ${recorderMemory.brand_coverage_pattern}` : '',
      ].filter(Boolean).join('\n')
    : '';

  // Current urgency state for escalation logic
  const currentUrgency   = coachPatterns?.urgency_level   || null;
  const urgencySessions  = coachPatterns?.urgency_sessions || 0;
  const performanceState = performanceOutput.performance_state || 'solid_consistent';
  const urgencySuggestion = performanceOutput.urgency_suggestion || 'coaching';

  const urgencyBlock = currentUrgency
    ? `CURRENT URGENCY STATE: ${currentUrgency} (sessions at this level: ${urgencySessions})
PERFORMANCE AGENT URGENCY SUGGESTION: ${urgencySuggestion}
ESCALATION RULE: If this SE has been at "${currentUrgency}" for 2+ sessions with no measurable improvement in score trend or critical metric, escalate to the next level (developmental → coaching → corrective → intervention). Set urgency_escalated: true if you escalate.`
    : `CURRENT URGENCY STATE: not yet set — establish initial level based on performance data.
PERFORMANCE AGENT URGENCY SUGGESTION: ${urgencySuggestion}`;

  const prompt = `You are the Digital Performance Coach — a structured accountability and development engine built to scale leadership clarity and elevate individual performance at Speckless.

You are NOT a chatbot. You are NOT a reporting tool. You are NOT a motivational speaker. You translate performance data into clear judgment, personalized coaching, and concrete action. You exist to do what the best leaders do when they are in the room — and to do it consistently when they are not.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
URGENCY & STATE:
${urgencyBlock}
PERFORMANCE STATE: ${performanceState}
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

${behavioralPatternsBlock}
${memoryPatternsBlock ? `LONG-TERM HABIT TRACKING:\n${memoryPatternsBlock}\n` : ''}
BEHAVIOUR AGENT:
• Personality: ${behaviourOutput.personality_type}
• Communication style: ${behaviourOutput.communication_style}
• Recommended tone: ${behaviourOutput.recommended_tone}
• Motivation drivers: ${(behaviourOutput.motivation_drivers || []).join(', ')}
• Engagement level: ${behaviourOutput.engagement_level}
• Coaching resistance: ${behaviourOutput.coaching_resistance}
• Avoid: ${(behaviourOutput.avoid || []).join(', ')}
• Behaviour notes: ${behaviourOutput.behaviour_notes}

DEBT AGENT:
• Status: ${debtOutput.debt_status} | Zone standing: ${debtOutput.zone_standing}
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
• Rank: #${se.rank} of ${totalSEs} | Check-in: ${se.resumption_time || '—'}
• Stores: ${se.stores_visited} | Brands: ${se.brands_ordered}/${activeBrands.length}
• Value: ₦${Number(se.value_of_orders).toLocaleString()}
• Missed brands: ${missedBrands.slice(0, 5).join(', ') || 'None — full coverage!'}
${dailyExpense > 0 ? `• Daily Expense: ₦${Number(dailyExpense).toLocaleString()}${dailyExpense > dailyExpenseLimit ? ` ⚠ EXCEEDS daily limit of ₦${Number(dailyExpenseLimit).toLocaleString()} — FLAG THIS in the coaching message. Call it out directly and ask for justification.` : ''}` : ''}
${feedbackSection ? `\nFIELD INTELLIGENCE:\n${feedbackSection}` : ''}

ROLE COACHING ANGLE:
${roleContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK: Analyze all data above. Determine tone axes. Write the coaching message. Return JSON ONLY.

{
  "directness": "diplomatic|balanced|direct|blunt",
  "warmth": "formal|professional|warm|relational",
  "urgency_level": "developmental|coaching|corrective|intervention",
  "urgency_escalated": true|false,
  "message": "THE COACHING MESSAGE"
}

── TONE AXIS 1 — DIRECTNESS ──────────────────────────────────────────────────
Infer emotional stability and agreeableness from behavioral signals:
• Conscientiousness proxy: consistency of check-ins, brand coverage, survey completion
• Emotional stability proxy: score volatility, coaching_resistance ("high" = low stability)
• Agreeableness proxy: engagement level, whether prior coaching was acted on (from memory/patterns)

Rules:
- High agreeableness + low stability (volatile scores + compliant) → "diplomatic"
- Moderate on both axes → "balanced" (default for most SEs)
- Low agreeableness + moderate stability → "direct"
- Low agreeableness + high stability (consistent, resistant) → "blunt"
- Senior roles → minimum "direct", never "diplomatic"

── TONE AXIS 2 — URGENCY ─────────────────────────────────────────────────────
Based on performance state, trajectory, and escalation rules above:
- "developmental": high_accelerating or high_plateauing — light touch, stretch goals, leadership development
- "coaching": solid_consistent or single-period gap — identify gap, suggest adjustments, increase attention
- "corrective": underperforming_declining — name the decline explicitly, set a 2-week improvement frame
- "intervention": underperforming_critical — formal, hard deadlines, do not soften

── TONE AXIS 3 — WARMTH ──────────────────────────────────────────────────────
Infer from engagement level, coaching response history, consistency signals:
- Disengaged or highly resistant → "formal"
- New or insufficient data → "professional"
- Consistent and responsive to coaching → "warm"
- High engagement, team-oriented, strong relational signals → "relational"

── COACHING MESSAGE — REQUIREMENTS ──────────────────────────────────────────
Length: 100–200 words. No exceptions. Every word must earn its place.

Structure (5 parts):
1. GREETING — one sentence, calibrated to warmth axis. Use first name only.
2. HIGHLIGHT — one specific behavioral strength from TODAY's data using SBI format: "When you [specific behavior], it [specific impact]." Not a score — a behavior.
3. FOCUS — the single most critical gap. Name it directly. Reference the recurring pattern from history if applicable ("Third time this week...", "Same three brands missing again...").
4. ACTIONS — 1–2 concrete steps for today/tomorrow. Name specific brands, stores, times.
5. CLOSER — ONE implementation intention: "Tomorrow: [specific action with context]. That's the one thing."

── LANGUAGE RULES (override everything) ─────────────────────────────────────
❌ NEVER echo their score or rating: never write "your 85/100" or "your debt score of 30"
❌ NEVER use: "Great job!", "Keep up the good work!", "You're doing amazing!", "you're a natural"
❌ NEVER write anything that could apply to any SE at any company — every sentence must be unmistakably for ${se.se_name.split(' ')[0]}
❌ NEVER use vague language: "try harder", "do better", "improve your performance"

✅ Reference specific brands, stores, check-in times, and dates from the data
✅ If urgency is "corrective": be direct, name the decline explicitly, no softening
✅ If urgency is "intervention": formal tone, state consequences, hard deadline
✅ If urgency is "developmental": challenge beyond current ceiling, stretch goal language
✅ Apply the debt coaching angle in a way that connects to daily habits, not their score
✅ Draw on recorder memory: name patterns explicitly ("You've been...", "Three sessions running...")
✅ If missed brands exist, name the top 2 by name with a specific approach instruction`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim()
    .replace(/^```json?\n?/, '').replace(/```$/, '').trim();

  let coachResult;
  try {
    coachResult = JSON.parse(raw);
  } catch {
    // Fallback: treat entire response as the message
    coachResult = {
      directness: 'balanced',
      warmth: 'professional',
      urgency_level: currentUrgency || urgencySuggestion || 'coaching',
      urgency_escalated: false,
      message: raw,
    };
  }

  // Self-learning: update coach patterns asynchronously (non-blocking)
  updateCoachPatterns(apiKey, se.se_name, {
    behaviourOutput, performanceOutput, coachResult, coachPatterns, reportDate: se.report_date,
  }).catch(() => {});

  return coachResult;
}

async function updateCoachPatterns(apiKey, seName, {
  behaviourOutput, performanceOutput, coachResult, coachPatterns, reportDate,
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Track urgency state transitions
  const prevUrgency  = coachPatterns?.urgency_level   || null;
  const prevSessions = coachPatterns?.urgency_sessions || 0;
  const newUrgency   = coachResult.urgency_level;
  const urgencyChanged = prevUrgency && prevUrgency !== newUrgency;

  const urgencyHistory = [...(coachPatterns?.urgency_history || [])];
  if (urgencyChanged && prevUrgency) {
    urgencyHistory.push({ level: prevUrgency, ended: reportDate, sessions: prevSessions });
    if (urgencyHistory.length > 6) urgencyHistory.shift();
  }

  const urgencyFields = {
    urgency_level:    newUrgency,
    urgency_sessions: urgencyChanged ? 1 : prevSessions + 1,
    urgency_started:  urgencyChanged ? reportDate : (coachPatterns?.urgency_started || reportDate),
    urgency_history:  urgencyHistory,
  };

  const prompt = `You are updating a self-learning pattern store for the Digital Performance Coach. Return JSON ONLY.

SE: ${seName}
EXISTING PATTERNS:
${coachPatterns ? JSON.stringify(coachPatterns, null, 2) : 'None yet — create initial record.'}

THIS SESSION:
- Communication style applied: ${behaviourOutput.communication_style}
- Tone axes used: directness=${coachResult.directness}, warmth=${coachResult.warmth}
- Urgency level: ${coachResult.urgency_level}${coachResult.urgency_escalated ? ' (ESCALATED this session)' : ''}
- Performance level: ${performanceOutput.performance_level}
- Performance state: ${performanceOutput.performance_state || 'unknown'}
- Critical metric addressed: ${performanceOutput.critical_metric}
- Message preview: ${coachResult.message?.slice(0, 300) || ''}

Update and return (keep arrays ≤ 8 items, remove least relevant if over limit):
{
  "effective_approaches": ["approaches and styles that have been applied for this SE"],
  "message_styles": ["message framing styles that fit this SE's personality"],
  "recurring_themes": ["themes that keep appearing in this SE's coaching"],
  "coach_notes": "evolving coach notes — what to remember for next session",
  "sessions_count": ${(coachPatterns?.sessions_count || 0) + 1}
}`;

  const result     = await model.generateContent(prompt);
  const pRaw       = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();
  const newPatterns = JSON.parse(pRaw);

  await supabase
    .from('coach_patterns')
    .upsert(
      {
        se_name:      seName,
        patterns_json: { ...newPatterns, ...urgencyFields },
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'se_name' }
    );
}

function buildRoleContext(positionKey) {
  const map = {
    corporate_se:    'Focus on brand partner introductions and corporate store listings. Do NOT coach on order counts.',
    senior_se:       'Coach on zone leadership, debt accountability, and brand spread across the zone. Flag junior SE underperformance if relevant.',
    junior_se:       'Core pillars: 7+ stores, first check-in before 9 AM, full brand pitch, survey filed. Be direct and practical.',
    trial:           'Emphasise onboarding consistency and habit-building. Be encouraging but set clear behavioural expectations.',
    sales_executive: 'Standard daily pillars: store count, brand coverage, time discipline, and order quality.',
  };
  return map[positionKey] || map.sales_executive;
}

function buildFeedbackIntelligenceBlock(feedbackOutput, feedbackData) {
  if (feedbackOutput?.has_data) {
    const lines = [];

    if (feedbackOutput.key_findings?.length) {
      lines.push('KEY FINDINGS:');
      feedbackOutput.key_findings.forEach(f => lines.push(`  • ${f}`));
    }

    const highSeverity = (feedbackOutput.product_mentions || []).filter(p => p.severity === 'high');
    if (highSeverity.length) {
      lines.push('HIGH-PRIORITY PRODUCT ISSUES:');
      highSeverity.forEach(p =>
        lines.push(`  • [${p.brand} / ${p.product}] at ${p.store} — ${p.issue} (${p.type})`)
      );
    }

    const alerts = (feedbackOutput.recurring_patterns || []).filter(p => p.alert);
    if (alerts.length) {
      lines.push('RECURRING PATTERN ALERTS:');
      alerts.forEach(p =>
        lines.push(`  ⚠ ${p.subject}: ${p.pattern} → ${p.recommended_escalation}`)
      );
    }

    if (feedbackOutput.coaching_hooks?.length) {
      lines.push('COACHING HOOKS (reference these directly):');
      feedbackOutput.coaching_hooks.forEach(h => lines.push(`  → ${h}`));
    }

    return lines.length ? lines.join('\n') : '';
  }

  if (!feedbackData || Object.keys(feedbackData).length === 0) return '';
  const lines = [];
  for (const [store, brands] of Object.entries(feedbackData)) {
    for (const [brand, qaList] of Object.entries(brands)) {
      for (const { question, answer } of qaList) {
        if (answer?.trim()) {
          lines.push(`[${store} / ${brand}] ${question}: "${answer}"`);
          if (lines.length >= 8) break;
        }
      }
      if (lines.length >= 8) break;
    }
    if (lines.length >= 8) break;
  }
  return lines.join('\n');
}
