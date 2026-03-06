import { runPerformanceAgent } from './performance-agent.js';
import { runBehaviourAgent }   from './behaviour-agent.js';
import { runDebtAgent }        from './debt-agent.js';
import { runResourceAgent }    from './resource-agent.js';
import { readMemory, writeMemory, logAgentOutput } from './recorder-agent.js';
import { runCoachAgent, readCoachPatterns }         from './coach-agent.js';

/**
 * Orchestrator
 * Runs the full A2A pipeline for a single SE across 4 phases:
 *
 * Phase 1 (parallel): Performance Agent + Behaviour Agent + Debt Agent + Recorder read
 * Phase 2:            Resource Agent (uses Phase 1 outputs to search web)
 * Phase 3:            Coach Agent (synthesizes everything)
 * Phase 4 (async):    Recorder write (updates long-term memory, non-blocking)
 *
 * @returns {{ analysis: Object, message: string }}
 */
export async function runSEPipeline(apiKey, {
  se,
  history,       // last 7 coaching history rows (with total_score)
  teamAvg,
  totalSEs,
  zoneData,      // all daily_report rows for SEs in the same zone
  allDebtData,   // all daily_report rows across the team (for cross-zone debt context)
  traitsText,
  activeBrands,
  feedbackData,
  positionKey,
  positionLabel,
  zone,
  region,
}) {
  const seName = se.se_name;
  const date   = se.report_date;

  // ── Phase 1: All specialist agents + recorder read (fully parallel) ───────
  const [
    performanceOutput,
    behaviourOutput,
    debtOutput,
    recorderMemory,
    coachPatterns,
  ] = await Promise.all([
    runPerformanceAgent(apiKey, { se, history, teamAvg, totalSEs, zoneData, activeBrands })
      .then(out => { logAgentOutput(seName, date, 'performance', out); return out; })
      .catch(err => fallback('performance', err)),

    runBehaviourAgent(apiKey, { se, traitsText, recorderMemory: null, coachHistory: history, positionKey, positionLabel })
      .then(out => { logAgentOutput(seName, date, 'behaviour', out); return out; })
      .catch(err => fallback('behaviour', err)),

    runDebtAgent(apiKey, { se, zoneDebtData: zoneData, allDebtData, positionKey, zone, region })
      .then(out => { logAgentOutput(seName, date, 'debt', out); return out; })
      .catch(err => fallback('debt', err)),

    readMemory(seName).catch(() => null),
    readCoachPatterns(seName).catch(() => null),
  ]);

  // ── Phase 2: Resource Agent (informed by Phase 1 outputs) ─────────────────
  const resourceOutput = await runResourceAgent(apiKey, {
    se, performanceOutput, behaviourOutput, debtOutput,
  })
    .then(out => { logAgentOutput(seName, date, 'resource', out); return out; })
    .catch(() => ({ resources: [], key_recommendation: '', _source: 'failed' }));

  // ── Phase 3: Coach Agent (synthesizes all inputs) ─────────────────────────
  const coachMessage = await runCoachAgent(apiKey, {
    se, positionKey, positionLabel, zone,
    performanceOutput, behaviourOutput, debtOutput, resourceOutput,
    recorderMemory, coachPatterns, traitsText, feedbackData,
    activeBrands, totalSEs,
  });

  // ── Phase 4: Recorder write (async, non-blocking) ─────────────────────────
  writeMemory(apiKey, {
    se, performanceOutput, behaviourOutput, debtOutput,
    coachMessage, existingMemory: recorderMemory,
  }).catch(() => {});

  return {
    analysis: {
      performance: performanceOutput,
      behaviour:   behaviourOutput,
      debt:        debtOutput,
      resource:    resourceOutput,
    },
    message: coachMessage,
  };
}

/**
 * Run the full A2A pipeline for all SEs in parallel.
 * Each SE's pipeline is independent — failures are isolated.
 */
export async function runTeamPipeline(apiKey, seDataArray) {
  return Promise.all(
    seDataArray.map(data =>
      runSEPipeline(apiKey, data).catch(err => ({
        analysis: null,
        message:  `A2A pipeline error: ${err.message}`,
      }))
    )
  );
}

// Default fallback values when an agent fails
function fallback(agentName, err) {
  console.error(`[${agentName} agent] failed:`, err.message);
  const defaults = {
    performance: {
      performance_level: 'average', score_trend: 'flat', week_trajectory: 'unknown',
      key_gaps: [], key_strengths: [], zone_position: 'at_zone_avg',
      critical_metric: 'overall performance', missed_brands_priority: [],
      risk_flags: [], score_vs_yesterday: 'unknown',
    },
    behaviour: {
      personality_type: 'Unknown', communication_style: 'direct',
      motivation_drivers: [], response_patterns: [], engagement_level: 'unknown',
      coaching_resistance: 'low', recommended_tone: 'professional',
      avoid: [], personalization_hooks: [], behaviour_notes: '',
    },
    debt: {
      debt_status: 'good', zone_standing: 'at_zone_avg', zone_debt_alert: false,
      debt_risk_level: 'low', suggested_actions: [],
      coach_message_angle: '', senior_zone_note: '', priority: 'low',
    },
  };
  return defaults[agentName] || {};
}
