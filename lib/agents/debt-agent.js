import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Debt Agent
 * Analyses an SE's debt score in the context of their zone and region.
 * For Senior SEs, evaluates zone-wide debt accountability.
 * Suggests specific actions for the coach to embed in the coaching message.
 */
export async function runDebtAgent(apiKey, {
  se,
  zoneDebtData,   // daily_report rows for SEs in same zone (includes debt_score)
  allDebtData,    // all SEs' daily_report rows (for cross-zone comparison)
  positionKey,
  zone,
  region,
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const zoneOthers = (zoneDebtData || []).filter(z => z.se_name !== se.se_name);
  const zoneAvgDebt = zoneOthers.length
    ? zoneOthers.reduce((s, z) => s + (Number(z.debt_score) || 0), 0) / zoneOthers.length
    : null;

  const zoneSummary = (zoneDebtData || [])
    .map(z => `${z.se_name.split(' ')[0]}: ${z.debt_score}/30`)
    .join(', ');

  const worstInZone = [...(zoneDebtData || [])]
    .sort((a, b) => (a.debt_score || 0) - (b.debt_score || 0))
    .slice(0, 3)
    .map(z => `${z.se_name.split(' ')[0]}: ${z.debt_score}/30`)
    .join(', ');

  const teamAvgDebt = (allDebtData || []).length
    ? (allDebtData || []).reduce((s, z) => s + (Number(z.debt_score) || 0), 0) / allDebtData.length
    : null;

  const debtLabel = se.debt_score >= 27 ? 'Excellent' : se.debt_score >= 22 ? 'Good' : se.debt_score >= 15 ? 'Moderate concern' : 'High risk';
  const isSenior  = positionKey === 'senior_se';

  const prompt = `You are a debt and collections performance analyst for Speckless field sales. Return JSON ONLY.

SE: ${se.se_name} | Role: ${positionKey} | Zone: ${zone} | Region: ${region || 'N/A'} | Date: ${se.report_date}

THIS SE'S DEBT:
- Debt Score: ${se.debt_score}/30 (${debtLabel})
- Points below maximum: ${30 - se.debt_score}

ZONE DEBT CONTEXT (${zone}):
- Zone members: ${zoneSummary || 'N/A'}
- Zone avg debt score: ${zoneAvgDebt?.toFixed(1) ?? 'N/A'}/30
- Lowest (most at-risk) in zone: ${worstInZone || 'N/A'}

TEAM-WIDE CONTEXT:
- Team avg debt score: ${teamAvgDebt?.toFixed(1) ?? 'N/A'}/30

${isSenior ? 'IMPORTANT: This is a Senior SE. They are accountable for debt management across their entire zone, not just their personal debt score. Zone debt performance reflects directly on their leadership.' : ''}

Return this exact JSON:
{
  "debt_status": "excellent" | "good" | "concern" | "critical",
  "zone_standing": "best_in_zone" | "above_zone_avg" | "at_zone_avg" | "below_zone_avg" | "worst_in_zone",
  "zone_debt_alert": true | false,
  "debt_risk_level": "low" | "medium" | "high",
  "suggested_actions": ["specific, actionable debt-related steps the coach should recommend"],
  "coach_message_angle": "exactly how the coach should frame debt in this SE's message (1-2 sentences)",
  "senior_zone_note": "${isSenior ? 'zone accountability note for senior SE' : ''}",
  "priority": "high" | "medium" | "low"
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(raw);
  } catch {
    return {
      debt_status: 'good', zone_standing: 'at_zone_avg', zone_debt_alert: false,
      debt_risk_level: 'low', suggested_actions: [],
      coach_message_angle: '', senior_zone_note: '', priority: 'low',
    };
  }
}
