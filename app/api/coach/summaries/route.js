import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/coach/summaries
 *
 * Returns per-SE coaching summaries including latest coaching message, analysis
 * fields, latest score, and urgency state from coach_patterns.
 */
export async function GET(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  try {
    const [
      { data: roster,      error: rosterErr },
      { data: coachRows,   error: coachErr  },
      { data: patternRows },
    ] = await Promise.all([
      supabase.from('team_roster').select('se_name, status, zone, position').eq('deleted', 0).order('se_name'),
      supabase.from('coaching_history').select('se_name, report_date, coaching_message, analysis_json').order('report_date', { ascending: false }),
      supabase.from('coach_patterns').select('se_name, patterns_json'),
    ]);

    if (rosterErr) return NextResponse.json({ error: rosterErr.message }, { status: 500 });
    if (coachErr)  return NextResponse.json({ error: coachErr.message  }, { status: 500 });

    // Index coaching entries by se_name + date; track latest
    const coachByDate    = {};
    const latestCoachMap = {};
    for (const row of coachRows || []) {
      if (!coachByDate[row.se_name]) coachByDate[row.se_name] = {};
      coachByDate[row.se_name][row.report_date] = row;
      if (!(row.se_name in latestCoachMap)) latestCoachMap[row.se_name] = row;
    }

    // Index urgency/pattern data by se_name
    const patternMap = {};
    for (const row of patternRows || []) {
      patternMap[row.se_name] = row.patterns_json || {};
    }

    // Latest score per SE
    const { data: scoreRows } = await supabase
      .from('daily_reports')
      .select('se_name, total_score, report_date')
      .order('report_date', { ascending: false });
    const latestScoreMap = {};
    for (const row of scoreRows || []) {
      if (!(row.se_name in latestScoreMap)) latestScoreMap[row.se_name] = { score: row.total_score, date: row.report_date };
    }

    const result = (roster || []).map(se => {
      const latestScoreDate = latestScoreMap[se.se_name]?.date;
      const coach = (latestScoreDate && coachByDate[se.se_name]?.[latestScoreDate])
        || latestCoachMap[se.se_name]
        || null;

      let analysis = null;
      if (coach?.analysis_json) {
        try {
          analysis = typeof coach.analysis_json === 'string'
            ? JSON.parse(coach.analysis_json) : coach.analysis_json;
        } catch {}
      }

      const patterns = patternMap[se.se_name] || {};

      return {
        se_name:             se.se_name,
        zone:                se.zone,
        position:            se.position,
        status:              se.status,
        latest_coach_date:   coach?.report_date || null,
        coaching_message:    coach?.coaching_message || null,
        performance_level:   analysis?.performance?.performance_level || null,
        score_trend:         analysis?.performance?.score_trend || null,
        debt_status:         analysis?.debt?.debt_status || null,
        behaviour_risk:      analysis?.behaviour?.behaviour_risk || null,
        key_strengths:       analysis?.performance?.key_strengths || [],
        key_gaps:            analysis?.performance?.key_gaps || [],
        behavioral_patterns: analysis?.performance?.behavioral_patterns || [],
        latest_score:        latestScoreMap[se.se_name]?.score || null,
        latest_score_date:   latestScoreMap[se.se_name]?.date || null,
        // Urgency state (from analysis if fresh, otherwise from persisted coach_patterns)
        urgency_level:       analysis?.urgency?.level     || patterns.urgency_level    || null,
        urgency_sessions:    patterns.urgency_sessions    || null,
        urgency_started:     patterns.urgency_started     || null,
        urgency_history:     patterns.urgency_history     || [],
        urgency_escalated:   analysis?.urgency?.escalated || false,
        // Tone axes from latest coaching run
        tone_directness:     analysis?.urgency?.directness || null,
        tone_warmth:         analysis?.urgency?.warmth     || null,
        // Performance state
        performance_state:   analysis?.performance?.performance_state || null,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
