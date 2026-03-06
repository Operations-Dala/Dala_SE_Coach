import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Behaviour Agent
 * Studies SE personality, communication style, motivation drivers, and coaching response patterns.
 * Uses trait profile (.docx text) + recorder memory + coaching history.
 */
export async function runBehaviourAgent(apiKey, {
  se,
  traitsText,      // extracted text from SE's .docx profile (may be null)
  recorderMemory,  // recorder agent's persistent JSON memory for this SE (may be null)
  coachHistory,    // last 7 coaching_history rows
  positionKey,
  positionLabel,
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const historyText = (coachHistory || [])
    .map(h => `[${h.report_date}] Score: ${h.total_score ?? '?'} — ${h.coaching_message?.slice(0, 180) ?? ''}`)
    .join('\n');

  const memoryText = recorderMemory
    ? JSON.stringify(recorderMemory, null, 2)
    : 'No prior memory — first session or memory not yet established.';

  const prompt = `You are a behavioural analyst specializing in field sales team psychology for Speckless.
Study this SE's available profile and observed patterns, then return JSON ONLY.

SE: ${se.se_name} | Role: ${positionLabel} | Date: ${se.report_date}

PERSONALITY & TRAIT PROFILE:
${traitsText || 'No trait document uploaded. Infer behaviour from coaching history and memory below.'}

RECORDER AGENT MEMORY (long-term patterns):
${memoryText}

RECENT COACHING HISTORY (last 7 sessions):
${historyText || 'No coaching history available.'}

Return this exact JSON:
{
  "personality_type": "one concise sentence describing this SE's personality",
  "communication_style": "direct" | "nurturing" | "analytical" | "expressive" | "driver",
  "motivation_drivers": ["what genuinely motivates this SE based on evidence"],
  "response_patterns": ["how this SE tends to respond to coaching — observed or inferred"],
  "engagement_level": "high" | "medium" | "low" | "unknown",
  "coaching_resistance": "none" | "low" | "moderate" | "high",
  "recommended_tone": "specific tone description for the coach message",
  "avoid": ["specific things to avoid when messaging this SE"],
  "personalization_hooks": ["personal or role-specific angles to use in the message"],
  "behaviour_notes": "brief summary of the most important behavioural insight for the coach"
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(raw);
  } catch {
    return {
      personality_type: 'Unknown — insufficient data',
      communication_style: 'direct',
      motivation_drivers: [],
      response_patterns: [],
      engagement_level: 'unknown',
      coaching_resistance: 'low',
      recommended_tone: 'professional and direct',
      avoid: [],
      personalization_hooks: [],
      behaviour_notes: 'Insufficient data to form behavioural assessment.',
    };
  }
}
