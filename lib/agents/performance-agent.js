import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Performance Agent
 * Analyses scores, trends, zone comparisons, brand coverage gaps, and risk flags.
 * Returns structured JSON for the Coach Agent to consume.
 */
export async function runPerformanceAgent(apiKey, {
  se,           // daily_report row
  history,      // last 7 coaching_history rows (with total_score)
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

  const scoreHistory = (history || []).map(h => `${h.report_date}: ${h.total_score ?? '?'}`).join(' | ');

  const prompt = `You are a field sales performance analyst for Speckless. Analyse this SE's daily data and return JSON ONLY.

SE: ${se.se_name} | Date: ${se.report_date}

SCORE BREAKDOWN:
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

7-DAY SCORE HISTORY: ${scoreHistory || 'No history'}

Return this exact JSON:
{
  "performance_level": "elite" | "strong" | "average" | "below_average" | "critical",
  "score_trend": "improving" | "declining" | "flat" | "volatile",
  "week_trajectory": "one sentence describing the 7-day pattern",
  "key_gaps": ["specific gap with data point"],
  "key_strengths": ["specific strength with data point"],
  "zone_position": "above_zone_avg" | "at_zone_avg" | "below_zone_avg",
  "critical_metric": "the single most important metric to address today",
  "missed_brands_priority": ["top 3 missed brands to prioritize tomorrow"],
  "risk_flags": ["any specific risk flags worth escalating"],
  "score_vs_yesterday": "improved" | "declined" | "same" | "unknown"
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
    };
  }
}

function parseBrandCoverage(json) {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}
