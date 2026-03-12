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

  const behavioralPatterns = (performanceOutput.behavioral_patterns || []).join(', ') || 'None detected';

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
- Behavioral patterns detected: ${behavioralPatterns}
- Punctuality trend: ${performanceOutput.punctuality_trend || 'unknown'}
- Store visit trend: ${performanceOutput.store_visit_trend || 'unknown'}
- Engagement level: ${behaviourOutput.engagement_level}
- Debt status: ${debtOutput.debt_status}
- Coaching resistance: ${behaviourOutput.coaching_resistance}
- Coach message preview: ${coachMessage?.slice(0, 250) ?? ''}

Instructions:
- Preserve long-term patterns that appear across multiple sessions
- Update punctuality_pattern, store_visit_pattern, and brand_coverage_pattern based on repeated observations
- Track patterns precisely (e.g. "Late check-in 6 of last 8 sessions", "Stores below 8 for 3 consecutive weeks")
- Note improvements when they happen (e.g. "Was consistently late, now checking in before 09:00 this week")
- Keep arrays to max 8 items (remove oldest/least relevant)

Return updated memory:
{
  "behavioural_patterns": ["observed patterns over multiple sessions — precise counts e.g. 'Late 5 of last 7 days'"],
  "punctuality_pattern": "current punctuality description with frequency, e.g. 'Consistently late, checking in after 09:30 in most sessions'",
  "store_visit_pattern": "current store visit habit, e.g. 'Averaging 6 stores vs 8 target across last 10 sessions'",
  "brand_coverage_pattern": "brand coverage habit, e.g. 'Repeatedly misses AMAN Blessed and Atun Foods — present in 8 of last 10 missed lists'",
  "performance_trend": "current overall trajectory description",
  "coaching_response_history": ["how this SE tends to respond across sessions"],
  "recurring_gaps": ["gaps that repeatedly appear across sessions"],
  "strengths_confirmed": ["strengths consistently demonstrated over time"],
  "communication_notes": ["what communication approaches have worked or not worked"],
  "last_score": ${se.total_score},
  "last_rank": ${se.rank},
  "sessions_tracked": ${(existingMemory?.sessions_tracked || 0) + 1},
  "last_updated": "${se.report_date}",
  "summary": "one paragraph — what the coach must know about this SE: their habits, patterns, what's working, what isn't, and how to approach them"
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
