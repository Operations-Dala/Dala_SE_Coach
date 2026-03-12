import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Performance Agent
 * Analyses scores, trends, zone comparisons, brand coverage gaps, and risk flags.
 * Includes behavioral pattern detection across 7-day history.
 * Returns structured JSON for the Coach Agent to consume.
 */
export async function runPerformanceAgent(apiKey, {
  se,           // daily_report row
  history,      // last 7 daily_report rows (with full metrics + coaching_message)
  teamAvg,      // { stores_visited, brands_ordered, value_of_orders, total_score }
  totalSEs,
  zoneData,     // daily_report rows for SEs in the same zone
  activeBrands, // string[]
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const brandCoverage  = parseBrandCoverage(se.brand_coverage);
  const missedBrands   = activeBrands.filter(b => !brandCoverage[b]);
  const coveredBrands  = activeBrands.filter(b => brandCoverage[b]);
  const brandPct       = Math.round((coveredBrands.length / activeBrands.length) * 100);

  const zoneOthers     = zoneData.filter(z => z.se_name !== se.se_name);
  const zoneAvgScore   = zoneOthers.length
    ? zoneOthers.reduce((s, z) => s + (Number(z.total_score) || 0), 0) / zoneOthers.length
    : null;

  const metricHistoryRows = (history || []).map(h => {
    const bp = parseBrandCoverage(h.brand_coverage);
    const brandsHit = activeBrands.filter(b => bp[b]).length;
    const bPct = activeBrands.length > 0 ? Math.round((brandsHit / activeBrands.length) * 100) : 0;
    return `${h.report_date} | Score:${h.total_score ?? '?'} | Stores:${h.stores_visited ?? '?'} | CheckIn:${h.resumption_time || '?'} | Brands:${brandsHit}/${activeBrands.length}(${bPct}%) | ₦${Number(h.value_of_orders || 0).toLocaleString()} | Debt:${h.debt_score ?? '?'}/30`;
  });
  const metricHistoryText = metricHistoryRows.join('\n') || 'No history available';

  const historyCount = (history || []).length;

  const prompt = `You are a field sales performance analyst for Speckless. Analyse this SE's daily data and return JSON ONLY.

SE: ${se.se_name} | Date: ${se.report_date}

TODAY'S SCORE BREAKDOWN:
- Total: ${se.total_score}/100 (Rank #${se.rank} of ${totalSEs})
- Time: ${se.time_score}/5 | First Check-in: ${se.resumption_time || 'Unknown'}
- Visits: ${se.visit_score}/10 | Stores: ${se.stores_visited} (team avg: ${teamAvg.stores_visited?.toFixed(1)}, zone avg: ${zoneAvgScore?.toFixed(1) ?? 'N/A'})
- Brands: ${se.brand_score}/40 | Coverage: ${coveredBrands.length}/${activeBrands.length} (${brandPct}%)
- Efficiency: ${se.efficiency_score}/15 | Complete Reports: ${se.complete_report}
- Debt: ${se.debt_score}/30
VALUE: ₦${Number(se.value_of_orders).toLocaleString()} (team avg: ₦${Number(teamAvg.value_of_orders || 0).toLocaleString()})
ORDERS: ${se.orders_generated}

BRANDS COVERED: ${coveredBrands.join(', ') || 'None'}
BRANDS MISSED: ${missedBrands.join(', ') || 'None'}

7-DAY BEHAVIORAL HISTORY (most recent first):
${metricHistoryText}
History entries available: ${historyCount}

Study the PATTERNS in the 7-day history above. Look for:
- Punctuality: Is check-in consistently after 09:00? After 09:30? Improving or worsening?
- Store visits: Is the SE consistently below target? Declining over time? Improving?
- Brand coverage: Same brands being missed repeatedly across multiple days?
- Score trajectory: Steady drop, recovery, volatile swings?
- Value/Order trends: Growing or shrinking?

PERFORMANCE STATE CLASSIFICATION — classify into one of these six states:
- "high_accelerating": elite/strong performance + clearly improving trend across 3+ recent sessions
- "high_plateauing": elite/strong performance but flat trend across 3+ sessions — meeting targets but not growing
- "solid_consistent": average/strong + stable trend — reliable, on-target execution
- "underperforming_declining": below_average + declining trend visible in 2+ consecutive periods
- "underperforming_critical": critical performance level OR SE has been declining with no recovery across multiple sessions
- "new_hire_onboarding": fewer than 3 history entries — insufficient data to classify pattern

URGENCY SUGGESTION — based on performance state and trajectory:
- "developmental": high_accelerating or high_plateauing — light touch, stretch goals
- "coaching": solid_consistent or single-period gap — identify the gap, suggest adjustments
- "corrective": underperforming_declining — name the decline explicitly, 2-week checkpoint mindset
- "intervention": underperforming_critical — formal, hard deadlines, escalation required

Return this exact JSON:
{
  "performance_level": "elite" | "strong" | "average" | "below_average" | "critical",
  "score_trend": "improving" | "declining" | "flat" | "volatile",
  "week_trajectory": "one sentence describing the 7-day pattern with specifics",
  "key_gaps": ["gap with evidence from history, e.g. 'Store visits below 8 in 5 of 7 sessions (avg 5.8)'"],
  "key_strengths": ["strength with evidence, e.g. 'Debt discipline: perfect 30/30 held across all 7 sessions'"],
  "zone_position": "above_zone_avg" | "at_zone_avg" | "below_zone_avg",
  "critical_metric": "the single most important metric to address today",
  "missed_brands_priority": ["top 3 missed brands to prioritize tomorrow"],
  "risk_flags": ["specific risk flags with data backing, e.g. 'Score dropped 3 consecutive days'"],
  "score_vs_yesterday": "improved" | "declined" | "same" | "unknown",
  "behavioral_patterns": ["precise habit description with count, e.g. 'Late check-in (after 09:30) in 6 of 7 sessions'"],
  "punctuality_trend": "consistently_late" | "consistently_early" | "improving" | "declining" | "variable",
  "store_visit_trend": "consistently_low" | "consistently_high" | "improving" | "declining" | "stable",
  "performance_state": "high_accelerating" | "high_plateauing" | "solid_consistent" | "underperforming_declining" | "underperforming_critical" | "new_hire_onboarding",
  "urgency_suggestion": "developmental" | "coaching" | "corrective" | "intervention"
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(raw);
  } catch {
    return {
      performance_level: 'average', score_trend: 'flat', week_trajectory: 'insufficient data',
      key_gaps: [], key_strengths: [], zone_position: 'at_zone_avg',
      critical_metric: 'overall performance', missed_brands_priority: missedBrands.slice(0, 3),
      risk_flags: [], score_vs_yesterday: 'unknown',
      behavioral_patterns: [], punctuality_trend: 'variable', store_visit_trend: 'stable',
      performance_state: 'solid_consistent', urgency_suggestion: 'coaching',
    };
  }
}

function parseBrandCoverage(json) {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}
