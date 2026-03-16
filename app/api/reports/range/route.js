import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/reports/range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Aggregates daily_reports across a date range per SE.
 * Returns cumulative totals and averages for each SE.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate   = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const [{ data: reports, error }, { data: rosterData }, { data: debtRecords }] = await Promise.all([
      supabase.from('daily_reports').select('*')
        .gte('report_date', startDate)
        .lte('report_date', endDate)
        .order('report_date', { ascending: true }),
      supabase.from('team_roster').select('se_name, status, position, zone').eq('deleted', 0),
      supabase.from('debt_records').select('se_name, debt_amount, week_date')
        .order('week_date', { ascending: false }),
    ]);

    if (error) throw error;

    const zoneMap     = Object.fromEntries((rosterData || []).map(r => [r.se_name, r.zone     || 'Unassigned']));
    const positionMap = Object.fromEntries((rosterData || []).map(r => [r.se_name, r.position || 'sales_executive']));
    const statusMap   = Object.fromEntries((rosterData || []).map(r => [r.se_name, r.status   || 'full']));

    // Latest debt per SE
    const latestDebtBySE = {};
    (debtRecords || []).forEach(r => {
      if (!(r.se_name in latestDebtBySE)) latestDebtBySE[r.se_name] = Number(r.debt_amount) || 0;
    });

    // Count distinct reporting dates
    const allDates = [...new Set((reports || []).map(r => r.report_date))];
    const totalDays = allDates.length;

    // Aggregate per SE
    const seMap = {};
    for (const r of (reports || [])) {
      if (!seMap[r.se_name]) {
        seMap[r.se_name] = {
          se_name:              r.se_name,
          days_reported:        0,
          total_value:          0,
          total_orders:         0,
          total_stores:         0,
          total_brands:         0,
          score_sum:            0,
          score_count:          0,
          total_complete_report: 0,
          efficiency_sum:       0,
          efficiency_count:     0,
          latest_rank:          null,
          latest_date:          null,
        };
      }
      const s = seMap[r.se_name];
      s.days_reported         += 1;
      s.total_value           += Number(r.value_of_orders)   || 0;
      s.total_orders          += Number(r.orders_generated)  || 0;
      s.total_stores          += Number(r.stores_visited)    || 0;
      s.total_brands          += Number(r.brands_ordered)    || 0;
      s.total_complete_report += Number(r.complete_report)   || 0;
      if (r.efficiency_score != null) { s.efficiency_sum += r.efficiency_score; s.efficiency_count += 1; }
      if (r.total_score != null) { s.score_sum += r.total_score; s.score_count += 1; }
      if (!s.latest_date || r.report_date > s.latest_date) {
        s.latest_date = r.report_date;
        s.latest_rank = r.rank;
      }
    }

    const aggregated = Object.values(seMap)
      .map((s, i) => ({
        se_name:           s.se_name,
        days_reported:     s.days_reported,
        attendance_rate:   totalDays > 0 ? Math.round((s.days_reported / totalDays) * 100) : 0,
        total_value:       Math.round(s.total_value),
        total_orders:      s.total_orders,
        total_stores:      s.total_stores,
        avg_brands_per_day: s.days_reported > 0 ? Math.round((s.total_brands / s.days_reported) * 10) / 10 : 0,
        avg_score:         s.score_count > 0 ? Math.round((s.score_sum / s.score_count) * 10) / 10 : 0,
        avg_value_per_day: s.days_reported > 0 ? Math.round(s.total_value / s.days_reported) : 0,
        avg_value_per_store:    s.total_stores > 0 ? Math.round(s.total_value / s.total_stores) : 0,
        total_complete_report:  s.total_complete_report,
        avg_efficiency_score:   s.efficiency_count > 0 ? Math.round((s.efficiency_sum / s.efficiency_count) * 10) / 10 : 0,
        latest_rank:            s.latest_rank,
        zone:              zoneMap[s.se_name]     || 'Unassigned',
        positionKey:       positionMap[s.se_name] || 'sales_executive',
        rosterStatus:      statusMap[s.se_name]   || 'full',
        debt_amount:       latestDebtBySE[s.se_name] || 0,
      }))
      .sort((a, b) => b.total_value - a.total_value)
      .map((s, i) => ({ ...s, range_rank: i + 1 }));

    // Summary KPIs
    const fullSEs = aggregated.filter(s => s.rosterStatus === 'full');
    const teamAvgScore   = fullSEs.length
      ? Math.round(fullSEs.reduce((s, e) => s + e.avg_score, 0) / fullSEs.length * 10) / 10
      : 0;
    const totalValue     = aggregated.reduce((s, e) => s + e.total_value,  0);
    const totalOrders    = aggregated.reduce((s, e) => s + e.total_orders, 0);
    const avgAttendance  = aggregated.length
      ? Math.round(aggregated.reduce((s, e) => s + e.attendance_rate, 0) / aggregated.length)
      : 0;

    return NextResponse.json({
      startDate,
      endDate,
      totalDays,
      summary: {
        teamAvgScore,
        totalValue,
        totalOrders,
        seCount:       aggregated.length,
        avgAttendance,
      },
      ses: aggregated,
    });
  } catch (err) {
    console.error('Range report error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
