import { NextResponse } from 'next/server';
import { supabase }     from '@/lib/supabase';

/**
 * GET /api/trends?days=30
 *
 * Returns:
 *  - daily[]  : { date, total_orders, total_value, reporting_count } — from daily_reports
 *  - debt[]   : { week_date, total_debt, by_zone: {zone: amount} }   — from debt_records
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 90);

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const [{ data: reportRows }, { data: debtRows }] = await Promise.all([
      supabase
        .from('daily_reports')
        .select('report_date, orders_generated, value_of_orders, se_name')
        .gte('report_date', sinceStr)
        .order('report_date', { ascending: true }),

      supabase
        .from('debt_records')
        .select('week_date, se_name, zone, debt_amount')
        .gte('week_date', sinceStr)
        .order('week_date', { ascending: true }),
    ]);

    // Aggregate daily reports by date
    const dailyMap = {};
    for (const r of reportRows || []) {
      if (!dailyMap[r.report_date]) {
        dailyMap[r.report_date] = { date: r.report_date, orders_generated: 0, value_of_orders: 0, reporting_count: 0 };
      }
      dailyMap[r.report_date].orders_generated += Number(r.orders_generated) || 0;
      dailyMap[r.report_date].value_of_orders  += Number(r.value_of_orders)  || 0;
      dailyMap[r.report_date].reporting_count  += 1;
    }
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate debt records by week
    const debtMap = {};
    for (const r of debtRows || []) {
      if (!debtMap[r.week_date]) {
        debtMap[r.week_date] = { week_date: r.week_date, total_debt: 0, by_zone: {} };
      }
      debtMap[r.week_date].total_debt += Number(r.debt_amount) || 0;
      const zone = r.zone || 'Unassigned';
      debtMap[r.week_date].by_zone[zone] = (debtMap[r.week_date].by_zone[zone] || 0) + Number(r.debt_amount);
    }
    const debt = Object.values(debtMap).sort((a, b) => a.week_date.localeCompare(b.week_date));

    return NextResponse.json({ daily, debt });
  } catch (err) {
    console.error('Trends error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
