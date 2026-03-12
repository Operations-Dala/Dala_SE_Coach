/**
 * Agent Output Cache — Supabase-backed, no extra dependencies.
 *
 * Caches the structured JSON output of the three deterministic agents
 * (performance, behaviour, debt) per SE per report date.  The final
 * coach message is intentionally NOT cached — it must always be
 * personalised with fresh context.
 *
 * Cache table (run once in Supabase SQL editor):
 *
 *   CREATE TABLE IF NOT EXISTS agent_cache (
 *     se_name     TEXT        NOT NULL,
 *     report_date DATE        NOT NULL,
 *     agent_name  TEXT        NOT NULL,
 *     output_json JSONB       NOT NULL,
 *     cached_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     PRIMARY KEY (se_name, report_date, agent_name)
 *   );
 *
 * Cacheable agents: 'performance' | 'behaviour' | 'debt'
 * TTL is implicit — the PRIMARY KEY includes report_date, so yesterday's
 * cache entries are naturally ignored when tomorrow's date is used.
 */

import { supabase } from '@/lib/supabase';

/**
 * Retrieve a cached agent output.
 * @param {string} seName
 * @param {string} reportDate  - 'YYYY-MM-DD'
 * @param {string} agentName   - 'performance' | 'behaviour' | 'debt'
 * @returns {Promise<Object|null>}
 */
export async function getCachedOutput(seName, reportDate, agentName) {
  try {
    const { data } = await supabase
      .from('agent_cache')
      .select('output_json')
      .eq('se_name',     seName)
      .eq('report_date', reportDate)
      .eq('agent_name',  agentName)
      .maybeSingle();

    if (data?.output_json) {
      console.log(`[cache] HIT  ${agentName} for ${seName} on ${reportDate}`);
      return data.output_json;
    }
  } catch (err) {
    // Cache read failure must never break the pipeline
    console.warn(`[cache] read error (${agentName}/${seName}):`, err.message);
  }
  return null;
}

/**
 * Store an agent output in the cache.
 * Silently swallows errors — a write failure must not block coaching.
 * @param {string} seName
 * @param {string} reportDate
 * @param {string} agentName
 * @param {Object} output
 */
export async function setCachedOutput(seName, reportDate, agentName, output) {
  try {
    await supabase.from('agent_cache').upsert(
      {
        se_name:     seName,
        report_date: reportDate,
        agent_name:  agentName,
        output_json: output,
        cached_at:   new Date().toISOString(),
      },
      { onConflict: 'se_name,report_date,agent_name' }
    );
    console.log(`[cache] SET  ${agentName} for ${seName} on ${reportDate}`);
  } catch (err) {
    console.warn(`[cache] write error (${agentName}/${seName}):`, err.message);
  }
}

/**
 * Convenience wrapper: return cached output or run the agent fn and cache its result.
 *
 * @param {string}   seName
 * @param {string}   reportDate
 * @param {string}   agentName
 * @param {Function} agentFn    - async () => outputObject
 * @returns {Promise<Object>}
 */
export async function withCache(seName, reportDate, agentName, agentFn) {
  const cached = await getCachedOutput(seName, reportDate, agentName);
  if (cached) return cached;

  const output = await agentFn();
  // Fire-and-forget the cache write so it doesn't add latency
  setCachedOutput(seName, reportDate, agentName, output).catch(() => {});
  return output;
}
