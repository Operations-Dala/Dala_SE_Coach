import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';

/**
 * Recorder Agent
 * Maintains long-term per-SE memory across coaching sessions.
 * - read()  → fetches existing memory from agent_memory table
 * - write() → synthesizes new session data + existing memory → updates DB
 * - log()   → writes individual agent outputs to agent_run_log for audit trail
 */

export async function readMemory(seName) {
  const { data } = await supabase
    .from('agent_memory')
    .select('memory_json')
    .eq('se_name', seName)
    .maybeSingle();
  return data?.memory_json || null;
}

export async function writeMemory(apiKey, {
  se,
  performanceOutput,
  behaviourOutput,
  debtOutput,
  coachMessage,
  existingMemory,
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const existingText = existingMemory
    ? JSON.stringify(existingMemory, null, 2)
    : 'No existing memory — create the initial record.';

  const prompt = `You are a recorder agent maintaining a persistent behavioural and performance memory for a field sales executive at Speckless. Return JSON ONLY.

UPDATE THE MEMORY RECORD for: ${se.se_name}

EXISTING MEMORY:
${existingText}

TODAY'S SESSION DATA (${se.report_date}):
- Score: ${se.total_score}/100 | Rank: #${se.rank}
- Performance level: ${performanceOutput.performance_level}
- Score trend: ${performanceOutput.score_trend}
- Key gaps: ${(performanceOutput.key_gaps || []).join(', ')}
- Key strengths: ${(performanceOutput.key_strengths || []).join(', ')}
- Engagement level: ${behaviourOutput.engagement_level}
- Debt status: ${debtOutput.debt_status}
- Coaching resistance: ${behaviourOutput.coaching_resistance}
- Coach message preview: ${coachMessage?.slice(0, 250) ?? ''}

Instructions: Preserve important long-term patterns. Update trends based on new data. Note any significant changes from previous sessions. Keep arrays to max 8 items (remove oldest/least relevant). Return updated memory:
{
  "behavioural_patterns": ["observed patterns over multiple sessions"],
  "performance_trend": "current overall trajectory description",
  "coaching_response_history": ["how this SE tends to respond across sessions"],
  "recurring_gaps": ["gaps that repeatedly appear"],
  "strengths_confirmed": ["strengths consistently demonstrated"],
  "communication_notes": ["what communication approaches have worked or not worked"],
  "last_score": ${se.total_score},
  "last_rank": ${se.rank},
  "sessions_tracked": ${(existingMemory?.sessions_tracked || 0) + 1},
  "last_updated": "${se.report_date}",
  "summary": "one paragraph summary of this SE's overall trajectory and what the coach should keep in mind"
}`;

  const result = await model.generateContent(prompt);
  const raw    = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();

  let newMemory;
  try {
    newMemory = JSON.parse(raw);
  } catch {
    newMemory = {
      ...(existingMemory || {}),
      last_score: se.total_score,
      last_rank: se.rank,
      sessions_tracked: (existingMemory?.sessions_tracked || 0) + 1,
      last_updated: se.report_date,
    };
  }

  await supabase
    .from('agent_memory')
    .upsert(
      { se_name: se.se_name, memory_json: newMemory, last_updated: new Date().toISOString() },
      { onConflict: 'se_name' }
    );

  return newMemory;
}

export async function logAgentOutput(seName, reportDate, agentName, output) {
  try {
    await supabase.from('agent_run_log').insert({
      se_name: seName,
      report_date: reportDate,
      agent_name: agentName,
      output_json: output,
    });
  } catch {
    // Non-critical — don't fail the pipeline if logging fails
  }
}
