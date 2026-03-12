import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { processReports } from '@/lib/data-engine';
import { calcZoneDebtScore } from '@/lib/debt-score';
import { scoreMetrics, assignRanks } from '@/lib/scorer';
import { AppError, resolveError } from '@/lib/errors';

export async function POST(request) {
  try {
    const formData = await request.formData();

    const checkinFile = formData.get('checkin');
    const productFile = formData.get('product');
    const feedbackFile = formData.get('feedback');
    const reportDate = formData.get('date') || yesterdayDate();
    if (!checkinFile || !productFile || !feedbackFile) {
      throw new AppError('All 3 files are required: checkin, product, feedback', 400);
    }

    const checkinBuffer = Buffer.from(await checkinFile.arrayBuffer());
    const productBuffer = Buffer.from(await productFile.arrayBuffer());
    const feedbackBuffer = Buffer.from(await feedbackFile.arrayBuffer());

    const { data: rosterRows, error: rosterErr } = await supabase
      .from('team_roster').select('se_name, status, zone').eq('deleted', 0);
    if (rosterErr) throw rosterErr;

    const { data: brandRows, error: brandsErr } = await supabase
      .from('brand_partners').select('brand_name').eq('active', 1).eq('deleted', 0);
    if (brandsErr) throw brandsErr;

    const { data: settingsRows, error: settingsErr } = await supabase
      .from('settings').select('key, value');
    if (settingsErr) throw settingsErr;

    const seNames = rosterRows.map(r => r.se_name);
    const statusMap = Object.fromEntries(rosterRows.map(r => [r.se_name, r.status]));
    const zoneMap = Object.fromEntries(rosterRows.map(r => [r.se_name, r.zone || 'Unassigned']));
    const brands = brandRows.map(r => r.brand_name);
    const config = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

    // Auto-compute debt scores from latest weekly debt_records using zone totals.
    // Rules:
    //   Zone debt <= 10% of team total -> full score (30)
    //   Zone debt >= 25% of team total -> score 0
    //   Between 10% and 25% -> linear scale from 30 to 0
    const { data: debtRecords } = await supabase
      .from('debt_records')
      .select('se_name, debt_amount, week_date')
      .order('week_date', { ascending: false });

    const latestWeek = debtRecords?.[0]?.week_date || null;
    const latestDebtBySE = {};
    (debtRecords || []).forEach(r => {
      if (r.week_date === latestWeek && !(r.se_name in latestDebtBySE)) {
        latestDebtBySE[r.se_name] = Number(r.debt_amount) || 0;
      }
    });

    const { seMetrics, feedbackRows } = processReports(
      checkinBuffer,
      productBuffer,
      feedbackBuffer,
      seNames,
      brands
    );

    const scored = seMetrics.map(m => {
      const debtScore = latestWeek ? calcZoneDebtScore(m.se_name, latestDebtBySE, zoneMap) : 30;
      const scores = scoreMetrics(m, config, brands.length, debtScore);
      return {
        ...m,
        ...scores,
        status: statusMap[m.se_name] || 'full',
        report_date: reportDate,
        at_risk_debt: debtScore < 30 ? 1 : 0,
      };
    });

    assignRanks(scored);

    const reportRows = scored.map(s => ({
      report_date: s.report_date,
      se_name: s.se_name,
      resumption_time: s.resumption_time,
      stores_visited: s.stores_visited,
      brands_ordered: s.brands_ordered,
      orders_generated: s.orders_generated,
      value_of_orders: s.value_of_orders,
      complete_report: s.complete_report,
      avg_value_per_bp: s.avg_value_per_bp,
      avg_value_per_store: s.avg_value_per_store,
      at_risk_debt: s.at_risk_debt,
      time_score: s.time_score,
      visit_score: s.visit_score,
      brand_score: s.brand_score,
      efficiency_score: s.efficiency_score,
      debt_score: s.debt_score,
      total_score: s.total_score,
      rank: s.rank,
      brand_coverage: s.brand_coverage,
    }));

    const { error: upsertErr } = await supabase
      .from('daily_reports')
      .upsert(reportRows, { onConflict: 'report_date,se_name' });
    if (upsertErr) throw upsertErr;

    if (feedbackRows.length > 0) {
      await supabase.from('feedback_details').delete().eq('report_date', reportDate);
      const fbRows = feedbackRows.map(r => ({ ...r, report_date: reportDate }));
      for (let i = 0; i < fbRows.length; i += 500) {
        const { error: fbErr } = await supabase
          .from('feedback_details').insert(fbRows.slice(i, i + 500));
        if (fbErr) throw fbErr;
      }
    }

    return NextResponse.json({
      success: true,
      date: reportDate,
      processed: scored.length,
      feedback_rows: feedbackRows.length,
      results: scored.map(s => ({
        se_name: s.se_name,
        total_score: s.total_score,
        rank: s.rank,
        status: s.status,
      })),
    });
  } catch (err) {
    const { message, status } = resolveError(err, 'upload');
    return NextResponse.json({ error: message }, { status });
  }
}

function yesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
