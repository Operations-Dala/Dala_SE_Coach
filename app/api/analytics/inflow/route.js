import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Positions that should trigger a 2-day inflow alert
const SENIOR_POSITIONS = new Set(['senior_se', 'corporate_se']);

/**
 * GET /api/analytics/inflow?days=7
 *
 * Returns:
 * - daily: [{ date, total }] — team daily inflow totals for the range
 * - per_se_weekly: [{ se_name, position, zone, weekly_total }]
 * - team_weekly_total: number
 * - inflow_alerts: [{ se_name, position, zone, days_zero }] — senior/corp SEs with 2+ days zero inflow
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '7', 10);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);
  const startStr = startDate.toISOString().split('T')[0];

  const { data: inflows, error } = await supabase
    .from('inflow_records')
    .select('record_date, se_name, amount')
    .gte('record_date', startStr)
    .order('record_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Daily totals
  const dailyMap = {};
  for (const row of (inflows || [])) {
    if (!dailyMap[row.record_date]) dailyMap[row.record_date] = 0;
    dailyMap[row.record_date] += Number(row.amount);
  }

  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    daily.push({ date: dateStr, total: dailyMap[dateStr] || 0 });
  }

  // Per-SE weekly totals
  const { monday, sunday } = currentWeekRange();
  const { data: weekInflows } = await supabase
    .from('inflow_records')
    .select('se_name, amount')
    .gte('record_date', monday)
    .lte('record_date', sunday);

  const seTotals = {};
  for (const row of (weekInflows || [])) {
    seTotals[row.se_name] = (seTotals[row.se_name] || 0) + Number(row.amount);
  }

  const { data: roster } = await supabase
    .from('team_roster')
    .select('se_name, position, zone')
    .eq('deleted', 0);

  const per_se_weekly = (roster || []).map(se => ({
    se_name:      se.se_name,
    position:     se.position,
    zone:         se.zone,
    weekly_total: seTotals[se.se_name] || 0,
  }));

  const team_weekly_total = per_se_weekly.reduce((s, r) => s + r.weekly_total, 0);

  // Inflow alerts: Senior/Corp SEs with 2 consecutive days of zero inflow
  const today = new Date();
  const last2 = [];
  for (let i = 1; i <= 2; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    last2.push(d.toISOString().split('T')[0]);
  }

  const { data: recentInflows } = await supabase
    .from('inflow_records')
    .select('record_date, se_name, amount')
    .in('record_date', last2);

  // Build map of se → date → amount for the last 2 days
  const recentMap = {};
  for (const row of (recentInflows || [])) {
    if (!recentMap[row.se_name]) recentMap[row.se_name] = {};
    recentMap[row.se_name][row.record_date] = (recentMap[row.se_name][row.record_date] || 0) + Number(row.amount);
  }

  const inflow_alerts = [];
  for (const se of (roster || [])) {
    if (!SENIOR_POSITIONS.has(se.position)) continue;

    const seData = recentMap[se.se_name] || {};
    const zeroCount = last2.filter(d => !seData[d] || seData[d] === 0).length;

    if (zeroCount >= 2) {
      inflow_alerts.push({
        se_name:   se.se_name,
        position:  se.position,
        zone:      se.zone,
        days_zero: zeroCount,
        dates_checked: last2,
      });
    }
  }

  return NextResponse.json({
    daily,
    per_se_weekly,
    team_weekly_total,
    inflow_alerts,
    week_range: { monday, sunday },
  });
}

function currentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    monday: monday.toISOString().split('T')[0],
    sunday: sunday.toISOString().split('T')[0],
  };
}
