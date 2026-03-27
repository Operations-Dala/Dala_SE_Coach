import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const WEEKLY_BUDGET = { senior_se: 25000, corporate_se: 25000 };
const DEFAULT_BUDGET = 20000;
const DAILY_EXPENSE_LIMIT = 4000;
const FINANCIAL_LOOKBACK_DAYS = 30;
function getBudget(pos) { return WEEKLY_BUDGET[pos] || DEFAULT_BUDGET; }

const SENIOR_POSITIONS = new Set(['senior_se', 'corporate_se']);

/**
 * GET /api/manager/flags
 *
 * Returns three flag arrays for the manager view:
 * - expense_flags: SEs over weekly budget OR with a day-over-day spike (>50%)
 * - inflow_flags: Senior/Corp SEs with 2+ consecutive days of zero inflow
 * - inactive_ses: SEs with no data OR zero stores for 2+ consecutive days
 * - financial_rows: merged date + SE inflow/expense rows for recent monitoring
 */
export async function GET() {
  const today = new Date();

  // ── Shared: roster ─────────────────────────────────────────────────────────
  const { data: roster } = await supabase
    .from('team_roster')
    .select('se_name, position, zone')
    .eq('deleted', 0);

  // ── 1. Expense Flags ────────────────────────────────────────────────────────
  const { monday, sunday } = currentWeekRange();
  const { data: weekExpenses } = await supabase
    .from('expense_records')
    .select('record_date, se_name, amount')
    .gte('record_date', monday)
    .lte('record_date', sunday);

  // 7-day window for spike detection
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const { data: recentExpenses } = await supabase
    .from('expense_records')
    .select('record_date, se_name, amount')
    .gte('record_date', sevenDaysAgo.toISOString().split('T')[0]);

  const weeklyTotals = {};
  for (const row of (weekExpenses || [])) {
    weeklyTotals[row.se_name] = (weeklyTotals[row.se_name] || 0) + Number(row.amount);
  }

  // Build per-SE daily expense map for last 7 days
  const seDailyExpense = {};
  for (const row of (recentExpenses || [])) {
    if (!seDailyExpense[row.se_name]) seDailyExpense[row.se_name] = {};
    seDailyExpense[row.se_name][row.record_date] = Number(row.amount);
  }

  const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
  const twoDaysAgoStr = new Date(today.getTime() - 2 * 86400000).toISOString().split('T')[0];

  const expense_flags = [];
  for (const se of (roster || [])) {
    const budget = getBudget(se.position);
    const weekly_total = weeklyTotals[se.se_name] || 0;
    const daily = seDailyExpense[se.se_name] || {};

    // Over budget
    if (weekly_total > budget) {
      expense_flags.push({
        se_name:      se.se_name,
        position:     se.position,
        zone:         se.zone,
        reason:       'over_budget',
        detail:       `Weekly spend ₦${weekly_total.toLocaleString()} exceeds ₦${budget.toLocaleString()} budget`,
        weekly_total,
        budget,
      });
      continue;
    }

    const todayAmt = daily[yesterdayStr]  || 0;
    const prevAmt  = daily[twoDaysAgoStr] || 0;

    // Daily limit exceeded (>₦4,000 on any single day)
    if (todayAmt > DAILY_EXPENSE_LIMIT) {
      expense_flags.push({
        se_name:      se.se_name,
        position:     se.position,
        zone:         se.zone,
        reason:       'daily_limit',
        detail:       `Daily expense ₦${todayAmt.toLocaleString()} exceeds the ₦${DAILY_EXPENSE_LIMIT.toLocaleString()} daily limit`,
        weekly_total,
        budget,
        daily_amount: todayAmt,
        daily_date:   yesterdayStr,
      });
      continue;
    }

    // Day-over-day spike: yesterday > 1.5× previous day
    if (prevAmt > 0 && todayAmt > prevAmt * 1.5) {
      expense_flags.push({
        se_name:      se.se_name,
        position:     se.position,
        zone:         se.zone,
        reason:       'expense_spike',
        detail:       `Expense spiked from ₦${prevAmt.toLocaleString()} to ₦${todayAmt.toLocaleString()} (${Math.round((todayAmt / prevAmt - 1) * 100)}% increase)`,
        weekly_total,
        budget,
      });
    }
  }

  // ── 2. Inflow Flags ─────────────────────────────────────────────────────────
  const last2Dates = [1, 2].map(i => {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  });

  const { data: recentInflows } = await supabase
    .from('inflow_records')
    .select('record_date, se_name, amount')
    .in('record_date', last2Dates);

  const inflowMap = {};
  for (const row of (recentInflows || [])) {
    if (!inflowMap[row.se_name]) inflowMap[row.se_name] = {};
    inflowMap[row.se_name][row.record_date] = (inflowMap[row.se_name][row.record_date] || 0) + Number(row.amount);
  }

  const inflow_flags = [];
  for (const se of (roster || [])) {
    if (!SENIOR_POSITIONS.has(se.position)) continue;
    const seInflow = inflowMap[se.se_name] || {};
    const zeroCount = last2Dates.filter(d => !seInflow[d] || seInflow[d] === 0).length;
    if (zeroCount >= 2) {
      inflow_flags.push({
        se_name:  se.se_name,
        position: se.position,
        zone:     se.zone,
        detail:   `No inflow recorded for ${zeroCount} consecutive days`,
        days_zero: zeroCount,
      });
    }
  }

  // ── 3. Inactive SEs ─────────────────────────────────────────────────────────
  // An SE is inactive if for 2+ consecutive days: no row in daily_reports OR stores_visited = 0
  const last5Dates = [];
  for (let i = 1; i <= 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    last5Dates.push(d.toISOString().split('T')[0]);
  }

  const { data: recentReports } = await supabase
    .from('daily_reports')
    .select('report_date, se_name, stores_visited')
    .in('report_date', last5Dates);

  // Build active day map per SE
  const seActiveDays = {};
  for (const row of (recentReports || [])) {
    if (!seActiveDays[row.se_name]) seActiveDays[row.se_name] = {};
    seActiveDays[row.se_name][row.report_date] = Number(row.stores_visited) > 0;
  }

  const inactive_ses = [];
  for (const se of (roster || [])) {
    const activeDays = seActiveDays[se.se_name] || {};

    // Count consecutive inactive days starting from yesterday
    let consecutiveInactive = 0;
    for (const d of last5Dates) {
      const isActive = activeDays[d] === true;
      if (!isActive) {
        consecutiveInactive++;
      } else {
        break; // stop at first active day
      }
    }

    if (consecutiveInactive >= 2) {
      const lastActiveDate = last5Dates.find(d => activeDays[d] === true) || null;
      inactive_ses.push({
        se_name:           se.se_name,
        position:          se.position,
        zone:              se.zone,
        days_inactive:     consecutiveInactive,
        last_active_date:  lastActiveDate,
        detail:            `No activity for ${consecutiveInactive} consecutive day${consecutiveInactive !== 1 ? 's' : ''}`,
      });
    }
  }

  // —— 4. Recent Financial Tracking ———————————————————————————————————————————————
  const financialStart = new Date(today);
  financialStart.setDate(today.getDate() - FINANCIAL_LOOKBACK_DAYS + 1);
  const financialStartStr = financialStart.toISOString().split('T')[0];
  const financialEndStr = today.toISOString().split('T')[0];

  const [{ data: financialExpenses }, { data: financialInflows }] = await Promise.all([
    supabase
      .from('expense_records')
      .select('record_date, se_name, amount')
      .gte('record_date', financialStartStr)
      .order('record_date', { ascending: false }),
    supabase
      .from('inflow_records')
      .select('record_date, se_name, amount')
      .gte('record_date', financialStartStr)
      .order('record_date', { ascending: false }),
  ]);

  const financialMap = new Map();

  for (const row of (financialExpenses || [])) {
    const key = `${row.record_date}::${row.se_name}`;
    const existing = financialMap.get(key) || {
      record_date: row.record_date,
      se_name: row.se_name,
      inflow: 0,
      expenses: 0,
    };
    existing.expenses += Number(row.amount);
    financialMap.set(key, existing);
  }

  for (const row of (financialInflows || [])) {
    const key = `${row.record_date}::${row.se_name}`;
    const existing = financialMap.get(key) || {
      record_date: row.record_date,
      se_name: row.se_name,
      inflow: 0,
      expenses: 0,
    };
    existing.inflow += Number(row.amount);
    financialMap.set(key, existing);
  }

  const financial_rows = Array.from(financialMap.values())
    .map(row => ({
      ...row,
      inflow: Math.round(row.inflow * 100) / 100,
      expenses: Math.round(row.expenses * 100) / 100,
    }))
    .sort((a, b) =>
      b.record_date.localeCompare(a.record_date) ||
      a.se_name.localeCompare(b.se_name)
    );

  return NextResponse.json({
    expense_flags,
    inflow_flags,
    inactive_ses,
    financial_rows,
    financial_range: {
      start: financialStartStr,
      end: financialEndStr,
      days: FINANCIAL_LOOKBACK_DAYS,
    },
    generated_at: new Date().toISOString(),
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
