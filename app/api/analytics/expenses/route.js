import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Weekly budget thresholds by position
const WEEKLY_BUDGET = {
  senior_se:    25000,
  corporate_se: 25000,
};
const DEFAULT_BUDGET = 20000;

function getBudget(position) {
  return WEEKLY_BUDGET[position] || DEFAULT_BUDGET;
}

/**
 * GET /api/analytics/expenses?days=7
 *
 * Returns:
 * - daily: [{ date, total }] — team daily expense totals for the range
 * - per_se_weekly: [{ se_name, position, zone, weekly_total, budget, over_budget }]
 *   for the most recent week (Mon–Sun containing today)
 * - team_weekly_total: number
 * - over_budget_count: number
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '7', 10);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);
  const startStr = startDate.toISOString().split('T')[0];

  const { data: expenses, error } = await supabase
    .from('expense_records')
    .select('record_date, se_name, amount')
    .gte('record_date', startStr)
    .order('record_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build daily totals
  const dailyMap = {};
  for (const row of (expenses || [])) {
    if (!dailyMap[row.record_date]) dailyMap[row.record_date] = 0;
    dailyMap[row.record_date] += Number(row.amount);
  }

  // Fill missing dates with 0
  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    daily.push({ date: dateStr, total: dailyMap[dateStr] || 0 });
  }

  // Per-SE weekly totals (current week: Mon–Sun)
  const { monday, sunday } = currentWeekRange();

  const { data: weekExpenses } = await supabase
    .from('expense_records')
    .select('se_name, amount')
    .gte('record_date', monday)
    .lte('record_date', sunday);

  const { data: roster } = await supabase
    .from('team_roster')
    .select('se_name, position, zone')
    .eq('deleted', 0);

  const seTotals = {};
  for (const row of (weekExpenses || [])) {
    seTotals[row.se_name] = (seTotals[row.se_name] || 0) + Number(row.amount);
  }

  const per_se_weekly = (roster || []).map(se => {
    const weekly_total = seTotals[se.se_name] || 0;
    const budget = getBudget(se.position);
    return {
      se_name:      se.se_name,
      position:     se.position,
      zone:         se.zone,
      weekly_total,
      budget,
      over_budget:  weekly_total > budget,
    };
  });

  const team_weekly_total = per_se_weekly.reduce((s, r) => s + r.weekly_total, 0);
  const over_budget_count = per_se_weekly.filter(r => r.over_budget).length;

  return NextResponse.json({
    daily,
    per_se_weekly,
    team_weekly_total,
    over_budget_count,
    week_range: { monday, sunday },
  });
}

function currentWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
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
