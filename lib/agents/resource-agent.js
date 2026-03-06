import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Resource Agent
 * Uses Gemini with Google Search grounding to find current, relevant insights
 * on sales techniques, motivation methods, and FMCG field sales best practices
 * tailored to this SE's specific situation (gaps, communication style, debt level).
 */
export async function runResourceAgent(apiKey, {
  se,
  performanceOutput,
  behaviourOutput,
  debtOutput,
}) {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Attempt with Google Search grounding first
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} }],
    });

    const prompt = buildResourcePrompt(se, performanceOutput, behaviourOutput, debtOutput);
    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();

    const parsed = JSON.parse(raw);
    return { ...parsed, _source: 'web_search' };
  } catch {
    // Fallback: use Gemini's internal knowledge without grounding
    try {
      const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = buildResourcePrompt(se, performanceOutput, behaviourOutput, debtOutput);
      const result = await model.generateContent(prompt);
      const raw    = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();

      const parsed = JSON.parse(raw);
      return { ...parsed, _source: 'internal_knowledge' };
    } catch {
      return { resources: [], key_recommendation: '', _source: 'failed' };
    }
  }
}

function buildResourcePrompt(se, performanceOutput, behaviourOutput, debtOutput) {
  const topGaps = (performanceOutput.key_gaps || []).slice(0, 2).join(', ') || 'general performance';
  const commStyle = behaviourOutput.communication_style || 'direct';
  const debtHigh  = debtOutput.priority === 'high';

  return `You are a research agent for a sales coaching system supporting Speckless, an FMCG field sales company in Nigeria.

Find practical, evidence-based insights to help coach this field sales executive.

CONTEXT FOR THIS SE:
- Performance level: ${performanceOutput.performance_level}
- Key gaps to address: ${topGaps}
- Communication style: ${commStyle}
- Score trend: ${performanceOutput.score_trend}
- Debt concern: ${debtHigh ? 'Yes — debt collection is a priority' : 'No'}

Research these 3 areas:
1. Sales technique to address: "${topGaps}"
2. Motivation approach that works for ${commStyle}-style salespeople
${debtHigh ? '3. Effective debt collection conversations for field sales reps' : '3. Brand coverage maximization strategies for FMCG field sales'}

Return JSON ONLY — no markdown, no citations:
{
  "resources": [
    {
      "topic": "short label",
      "insight": "specific, actionable insight (2-3 sentences)",
      "application": "exactly how the coach should apply this in this SE's message (1 sentence)"
    }
  ],
  "key_recommendation": "the single most valuable insight from all research for this SE's coaching today"
}

Limit to 3 resources. Be specific and practical — no generic advice.`;
}
