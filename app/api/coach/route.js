import { NextResponse } from 'next/server';
import { supabase }     from '@/lib/supabase';
import { runTeamPipeline } from '@/lib/agents/orchestrator';
import { AppError, resolveError } from '@/lib/errors';

export async function POST(request) {
  try {
    const body       = await request.json();
    const reportDate = body.date    || yesterdayDate();
    const targetSE   = body.se_name || null;

    // ── API key ───────────────────────────────────────────────────────────────
    const { data: keyRow } = await supabase
      .from('settings').select('value').eq('key', 'gemini_api_key').maybeSingle();
    const apiKey = process.env.GEMINI_API_KEY || keyRow?.value;
    if (!apiKey) {
      throw new AppError('Gemini API key not configured. Set GEMINI_API_KEY or save it in Settings.', 400);
    }

    // ── Load reports ──────────────────────────────────────────────────────────
    let reportsQuery = supabase.from('daily_reports').select('*').eq('report_date', reportDate);
    if (targetSE) reportsQuery = reportsQuery.eq('se_name', targetSE);
    const { data: reports, error: repErr } = await reportsQuery;
    if (repErr) throw repErr;

    if (!reports || reports.length === 0) {
      throw new AppError(`No reports found for ${reportDate}. Upload files first.`, 404);
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

    // ── Shared data (brands + roster + 14-day feedback trends) ───────────────
    const twoWeeksAgo    = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];

    const [{ data: brandRows }, { data: rosterRows }, { data: historicalFB }, { data: expenseRows }] = await Promise.all([
      supabase.from('brand_partners').select('brand_name').eq('active', 1).eq('deleted', 0),
      supabase.from('team_roster').select('se_name, position, zone, region').eq('deleted', 0),
      supabase.from('feedback_details')
        .select('report_date, se_name, brand_name, answer')
        .gte('report_date', twoWeeksAgoStr)
        .lt('report_date', reportDate),
      supabase.from('expense_records').select('se_name, amount').eq('record_date', reportDate),
    ]);

    // Build expense lookup: se_name → daily amount for the report date
    const expenseMap = {};
    for (const row of (expenseRows || [])) {
      expenseMap[row.se_name] = (expenseMap[row.se_name] || 0) + Number(row.amount);
    }
    const DAILY_EXPENSE_LIMIT = 4000;

    // Aggregate brand-level patterns: how many days & SEs reported each brand, with sample answers
    const brandTrendMap = {};
    for (const row of historicalFB || []) {
      if (!row.answer?.trim()) continue;
      const key = row.brand_name;
      if (!brandTrendMap[key]) brandTrendMap[key] = { brand_name: key, dates: new Set(), ses: new Set(), samples: [] };
      brandTrendMap[key].dates.add(row.report_date);
      brandTrendMap[key].ses.add(row.se_name);
      if (brandTrendMap[key].samples.length < 5) brandTrendMap[key].samples.push(row.answer.slice(0, 120));
    }
    const historicalTrends = Object.values(brandTrendMap).map(t => ({
      brand_name: t.brand_name,
      days_seen:  t.dates.size,
      se_count:   t.ses.size,
      summary:    t.samples.join(' | '),
    }));

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
      // 7-day metric history — single query with all behavioral metrics (replaces N+1 pattern)
      const [{ data: historyReports }, { data: coachHistory }] = await Promise.all([
        supabase
          .from('daily_reports')
          .select('report_date, total_score, stores_visited, resumption_time, brands_ordered, brand_coverage, value_of_orders, debt_score, time_score, visit_score, brand_score')
          .eq('se_name', se.se_name)
          .lt('report_date', reportDate)
          .order('report_date', { ascending: false })
          .limit(7),
        supabase
          .from('coaching_history')
          .select('report_date, coaching_message')
          .eq('se_name', se.se_name)
          .lt('report_date', reportDate)
          .order('report_date', { ascending: false })
          .limit(7),
      ]);

      const coachMsgMap = Object.fromEntries((coachHistory || []).map(h => [h.report_date, h.coaching_message]));
      const history = (historyReports || []).map(h => ({
        ...h,
        coaching_message: coachMsgMap[h.report_date] || null,
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

      const dailyExpense = expenseMap[se.se_name] || 0;

      return {
        se, history, teamAvg, totalSEs,
        zoneData, allDebtData: reports,
        traitsText: profile?.traits_text || null,
        activeBrands, feedbackData,
        feedbackRows: fbRows || [],
        historicalTrends,
        positionKey, positionLabel, zone, region,
        dailyExpense,
        dailyExpenseLimit: DAILY_EXPENSE_LIMIT,
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
      agents:  ['performance', 'behaviour', 'debt', 'feedback', 'resource', 'recorder', 'coach'],
      results: results.map((r, i) => ({
        se_name:          reports[i].se_name,
        performance_level: r.analysis?.performance?.performance_level,
        score_trend:      r.analysis?.performance?.score_trend,
        debt_status:      r.analysis?.debt?.debt_status,
        preview:          r.message?.slice(0, 100) + '...',
      })),
    });

  } catch (err) {
    const { message, status } = resolveError(err, 'coach');
    return NextResponse.json({ error: message }, { status });
  }
}

function yesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
