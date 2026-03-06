import { NextResponse } from 'next/server';
import { supabase }     from '@/lib/supabase';
import { runTeamPipeline } from '@/lib/agents/orchestrator';

export async function POST(request) {
  try {
    const body       = await request.json();
    const reportDate = body.date    || yesterdayDate();
    const targetSE   = body.se_name || null;

    // ── API key ───────────────────────────────────────────────────────────────
    const { data: keyRow } = await supabase
      .from('settings').select('value').eq('key', 'gemini_api_key').maybeSingle();
    const apiKey = keyRow?.value;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured. Go to Settings to add it.' },
        { status: 400 }
      );
    }

    // ── Load reports ──────────────────────────────────────────────────────────
    let reportsQuery = supabase.from('daily_reports').select('*').eq('report_date', reportDate);
    if (targetSE) reportsQuery = reportsQuery.eq('se_name', targetSE);
    const { data: reports, error: repErr } = await reportsQuery;
    if (repErr) throw repErr;

    if (!reports || reports.length === 0) {
      return NextResponse.json(
        { error: `No reports found for ${reportDate}. Upload files first.` },
        { status: 404 }
      );
    }

    // ── Team averages (full SEs only) ─────────────────────────────────────────
    const fullReports = reports.filter(r => r.status !== 'trial');
    const avg = (rows, f) =>
      rows.length ? rows.reduce((s, r) => s + (Number(r[f]) || 0), 0) / rows.length : 0;
    const teamAvg = {
      stores_visited:   avg(fullReports, 'stores_visited'),
      brands_ordered:   avg(fullReports, 'brands_ordered'),
      orders_generated: avg(fullReports, 'orders_generated'),
      value_of_orders:  avg(fullReports, 'value_of_orders'),
      total_score:      avg(fullReports, 'total_score'),
    };
    const totalSEs = fullReports.length;

    // ── Shared data (brands + roster) ─────────────────────────────────────────
    const [{ data: brandRows }, { data: rosterRows }] = await Promise.all([
      supabase.from('brand_partners').select('brand_name').eq('active', 1).eq('deleted', 0),
      supabase.from('team_roster').select('se_name, position, zone, region').eq('deleted', 0),
    ]);
    const activeBrands = (brandRows  || []).map(r => r.brand_name);
    const rosterMap    = Object.fromEntries((rosterRows || []).map(r => [r.se_name, r]));

    // All reports indexed by zone for zone-level context
    const reportsByZone = {};
    for (const r of reports) {
      const z = rosterMap[r.se_name]?.zone || 'Unknown';
      if (!reportsByZone[z]) reportsByZone[z] = [];
      reportsByZone[z].push(r);
    }

    // ── Build per-SE pipeline data ─────────────────────────────────────────────
    const seDataArray = await Promise.all(reports.map(async se => {
      // Coaching history (last 7 days with scores)
      const { data: coachHistory } = await supabase
        .from('coaching_history')
        .select('report_date, coaching_message')
        .eq('se_name', se.se_name)
        .lt('report_date', reportDate)
        .order('report_date', { ascending: false })
        .limit(7);

      const history = await Promise.all((coachHistory || []).map(async h => {
        const { data: dr } = await supabase
          .from('daily_reports')
          .select('total_score')
          .eq('report_date', h.report_date)
          .eq('se_name', se.se_name)
          .maybeSingle();
        return { ...h, total_score: dr?.total_score };
      }));

      // SE trait profile
      const { data: profile } = await supabase
        .from('se_profiles').select('traits_text').eq('se_name', se.se_name).maybeSingle();

      // Feedback Q&A for today
      const { data: fbRows } = await supabase
        .from('feedback_details')
        .select('store_name, brand_name, question, answer')
        .eq('report_date', reportDate)
        .eq('se_name', se.se_name);

      const feedbackData = {};
      for (const row of fbRows || []) {
        if (!feedbackData[row.store_name])              feedbackData[row.store_name] = {};
        if (!feedbackData[row.store_name][row.brand_name]) feedbackData[row.store_name][row.brand_name] = [];
        if (row.answer?.trim()) {
          feedbackData[row.store_name][row.brand_name].push({ question: row.question, answer: row.answer });
        }
      }

      const rosterEntry  = rosterMap[se.se_name] || {};
      const positionKey  = rosterEntry.position  || 'sales_executive';
      const positionLabel = {
        corporate_se:    'Corporate SE',
        senior_se:       'Senior SE',
        sales_executive: 'Sales Executive',
        junior_se:       'Junior SE',
        trial:           'Trial',
      }[positionKey] || 'Sales Executive';
      const zone   = rosterEntry.zone   || 'Unknown';
      const region = rosterEntry.region || '';

      // Zone-level daily reports (for zone comparison in Performance & Debt agents)
      const zoneData = reportsByZone[zone] || [];

      return {
        se, history, teamAvg, totalSEs,
        zoneData, allDebtData: reports,
        traitsText: profile?.traits_text || null,
        activeBrands, feedbackData,
        positionKey, positionLabel, zone, region,
      };
    }));

    // ── Run A2A pipeline for all SEs in parallel ───────────────────────────────
    const results = await runTeamPipeline(apiKey, seDataArray);

    // ── Persist coaching results ───────────────────────────────────────────────
    const coachRows = results.map((r, i) => ({
      report_date:      reportDate,
      se_name:          reports[i].se_name,
      analysis_json:    JSON.stringify(r.analysis),
      coaching_message: r.message,
    }));

    const { error: coachErr } = await supabase
      .from('coaching_history')
      .upsert(coachRows, { onConflict: 'report_date,se_name' });
    if (coachErr) throw coachErr;

    return NextResponse.json({
      success: true,
      date:    reportDate,
      count:   results.length,
      agents:  ['performance', 'behaviour', 'debt', 'resource', 'recorder', 'coach'],
      results: results.map((r, i) => ({
        se_name:          reports[i].se_name,
        performance_level: r.analysis?.performance?.performance_level,
        score_trend:      r.analysis?.performance?.score_trend,
        debt_status:      r.analysis?.debt?.debt_status,
        preview:          r.message?.slice(0, 100) + '...',
      })),
    });

  } catch (err) {
    console.error('A2A Coach pipeline error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function yesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
