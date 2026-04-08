import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Weekly Review Agent — Digital Performance Coach
 * Generates a personalised end-of-week review per SE.
 * Format: 6 sections (Performance Snapshot → Pattern → Win → Growth Area → Next Week Focus → Development Note)
 * Word count: 300–500 words total.
 */
export async function runWeeklyReviewAgent(apiKey, {
  seName,
  positionLabel,
  zone,
  weekDays,       // array of { report_date, total_score, stores_visited, resumption_time,
                  //   brands_ordered, brand_coverage, value_of_orders, debt_score,
                  //   coaching_message } — most recent first
  activeBrands,   // string[]
  recorderMemory, // agent_memory JSON (may be null)
  traitsText,     // SE traits profile (may be null)
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  if (!weekDays || weekDays.length === 0) {
    throw new Error('No data available for this week');
  }

  // Build day-by-day table
  const dayRows = weekDays.map(d => {
    let brandsHit = 0;
    try {
      const bc = JSON.parse(d.brand_coverage || '{}');
      brandsHit = activeBrands.filter(b => bc[b]).length;
    } catch {}
    return `${d.report_date} | Score:${d.total_score ?? '?'} | Stores:${d.stores_visited ?? '?'} | CheckIn:${d.resumption_time || '?'} | Brands:${brandsHit} out of ${activeBrands.length} | ₦${Number(d.value_of_orders || 0).toLocaleString()} | Debt:${d.debt_score ?? '?'}/30`;
  }).join('\n');

  // Summary stats
  const scores    = weekDays.map(d => Number(d.total_score) || 0).filter(s => s > 0);
  const avgScore  = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const highScore = scores.length ? Math.max(...scores) : 0;
  const lowScore  = scores.length ? Math.min(...scores) : 0;
  const avgStores = weekDays.length
    ? Math.round((weekDays.reduce((s, d) => s + (Number(d.stores_visited) || 0), 0) / weekDays.length) * 10) / 10
    : 0;

  const checkIns  = weekDays.map(d => d.resumption_time).filter(Boolean);
  const lateDays  = checkIns.filter(t => t > '09:30').length;

  const memoryBlock = recorderMemory
    ? `LONG-TERM MEMORY (from recorder agent):\n${JSON.stringify(recorderMemory, null, 2)}`
    : 'No prior memory available.';

  const traitsBlock = traitsText
    ? `SE TRAIT PROFILE:\n${traitsText}`
    : '';

  const prompt = `You are the Digital Performance Coach at Speckless — direct, specific, invested. Write an end-of-week review for ${seName}. Return JSON ONLY.

VOICE RULES:
- Direct, clear, economical. No filler. No hedging.
- NEVER: "Great job!", "Keep up the good work!", "You're doing amazing!", "you're a natural", vague motivational language
- ALWAYS: Name specific behaviors, metrics, dates with evidence. Interpret patterns — don't describe data back.
- State your conclusion before your reasoning. Every claim must be backed by specific evidence from the data.
- This is NOT a stats summary. This is a coaching judgment about what happened this week and what must change.

${traitsBlock}

${memoryBlock}

SE: ${seName} | Role: ${positionLabel} | Zone: ${zone}

WEEK SUMMARY STATS:
- Days on record this week: ${weekDays.length}
- Score range: ${lowScore} – ${highScore} | Weekly average: ${avgScore}
- Average stores per day: ${avgStores}
- Late check-ins (after 09:30): ${lateDays} of ${checkIns.length} days

DAY-BY-DAY BREAKDOWN (most recent first):
${dayRows}

INSTRUCTIONS:
- Total word count across all text fields combined: 300–500 words
- Follow the 6-section structure below (map to JSON keys)
- Be specific: cite dates, metrics, brand names, store counts from the data
- DO NOT just echo data — interpret it, judge the pattern, challenge the person
- Apply the voice rules above — every sentence must be unmistakably for ${seName.split(' ')[0]}

6-SECTION STRUCTURE:
1. PERFORMANCE SNAPSHOT (week_summary) — KPIs vs targets this week with trend direction. 2–3 sentences. What story do the numbers tell?
2. PATTERN (patterns_observed) — One or two behavioral patterns observed this week with frequency data. E.g. "Strong Monday–Wednesday, then drops Thursday–Friday in 3 of the last 4 weeks."
3. WIN (highlights) — One or two specific achievements with evidence. Name the day, the metric, the behavior. Not generic praise.
4. GROWTH AREA (improvement_areas) — One or two specific underperformances with evidence. Which days? Which metrics? What was the impact?
5. NEXT WEEK FOCUS (next_week_mission) — ONE specific, measurable commitment for next week tied directly to the biggest gap this week. Concrete. Achievable. Non-negotiable.
6. DEVELOPMENT NOTE (coach_note) — Personal note from coach to SE. 2–3 sentences. Honest, forward-looking. What this SE needs to hear — not just what's polite. Warm or direct depending on personality signals.

Return this exact JSON:
{
  "week_summary": "Performance Snapshot: 2–3 sentence narrative — the story of this week in terms of KPIs vs targets and trajectory",
  "highlights": ["Win: specific achievement with evidence — name the day, metric, behavior"],
  "improvement_areas": ["Growth Area: specific underperformance with evidence — which days, which metrics, what gap"],
  "patterns_observed": ["Pattern: behavioral pattern with frequency evidence"],
  "next_week_mission": "Next Week Focus: ONE specific, measurable commitment — not generic, tied to the biggest gap",
  "coach_note": "Development Note: 2–3 sentences. Personal. Honest. Forward-looking."
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();

  let reviewJson;
  try {
    reviewJson = JSON.parse(raw);
  } catch {
    throw new Error('Weekly review agent returned invalid JSON. Please try again.');
  }

  // Build readable narrative with section headings
  const reviewText = [
    '📊 PERFORMANCE SNAPSHOT',
    reviewJson.week_summary,
    '',
    reviewJson.highlights?.length
      ? '✓ WIN\n' + reviewJson.highlights.map(h => `• ${h}`).join('\n')
      : '',
    '',
    reviewJson.improvement_areas?.length
      ? '↑ GROWTH AREA\n' + reviewJson.improvement_areas.map(a => `• ${a}`).join('\n')
      : '',
    '',
    reviewJson.patterns_observed?.length
      ? '⟳ PATTERN\n' + reviewJson.patterns_observed.map(p => `• ${p}`).join('\n')
      : '',
    '',
    reviewJson.next_week_mission
      ? `🎯 NEXT WEEK FOCUS\n${reviewJson.next_week_mission}`
      : '',
    '',
    reviewJson.coach_note
      ? `💬 DEVELOPMENT NOTE\n${reviewJson.coach_note}`
      : '',
  ].filter(l => l !== undefined).join('\n').trim();

  return { reviewText, reviewJson, avgScore, highScore, lowScore, daysOnRecord: weekDays.length };
}
