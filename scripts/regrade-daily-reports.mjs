import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { calcZoneDebtScore } from '../lib/debt-score.js';
import { scoreMetrics, assignRanks } from '../lib/scorer.js';

loadEnvFile(path.resolve(process.cwd(), '.env.local'));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const onlyDateArg = process.argv.find(arg => arg.startsWith('--date='));
const onlyDate = onlyDateArg ? onlyDateArg.slice('--date='.length) : null;

const [{ data: settingsRows, error: settingsError }, { data: brandRows, error: brandsError }, { data: rosterRows, error: rosterError }, { data: reportRows, error: reportsError }, { data: debtRows, error: debtError }] = await Promise.all([
  supabase.from('settings').select('key, value'),
  supabase.from('brand_partners').select('brand_name').eq('active', 1).eq('deleted', 0),
  supabase.from('team_roster').select('se_name, status, zone').eq('deleted', 0),
  supabase.from('daily_reports')
    .select('report_date, se_name, resumption_time, stores_visited, brands_ordered, complete_report, value_of_orders, avg_value_per_bp, avg_value_per_store, orders_generated, brand_coverage')
    .order('report_date')
    .order('se_name'),
  supabase.from('debt_records')
    .select('se_name, debt_amount, week_date')
    .order('week_date'),
]);

if (settingsError) throw settingsError;
if (brandsError) throw brandsError;
if (rosterError) throw rosterError;
if (reportsError) throw reportsError;
if (debtError) throw debtError;

const config = Object.fromEntries((settingsRows || []).map(row => [row.key, row.value]));
const activeBrandCount = (brandRows || []).length;
const statusMap = Object.fromEntries((rosterRows || []).map(row => [row.se_name, row.status || 'full']));
const zoneMap = Object.fromEntries((rosterRows || []).map(row => [row.se_name, row.zone || 'Unassigned']));

const debtSnapshots = buildDebtSnapshots(debtRows || []);
const reportGroups = groupBy((reportRows || []).filter(row => !onlyDate || row.report_date === onlyDate), row => row.report_date);

const updates = [];

for (const [reportDate, rows] of Object.entries(reportGroups).sort(([a], [b]) => a.localeCompare(b))) {
  const applicableDebt = getDebtSnapshotForDate(reportDate, debtSnapshots);

  const scoredRows = rows.map(row => {
    const debtScore = applicableDebt ? calcZoneDebtScore(row.se_name, applicableDebt, zoneMap) : 30;
    const scores = scoreMetrics(
      {
        resumption_time: row.resumption_time,
        stores_visited: Number(row.stores_visited) || 0,
        brands_ordered: Number(row.brands_ordered) || 0,
        complete_report: Number(row.complete_report) || 0,
      },
      config,
      activeBrandCount,
      debtScore
    );

    return {
      ...row,
      ...scores,
      status: statusMap[row.se_name] || 'full',
      at_risk_debt: debtScore < 30 ? 1 : 0,
    };
  });

  assignRanks(scoredRows);

  updates.push(
    ...scoredRows.map(row => ({
      report_date: row.report_date,
      se_name: row.se_name,
      time_score: row.time_score,
      visit_score: row.visit_score,
      brand_score: row.brand_score,
      efficiency_score: row.efficiency_score,
      debt_score: row.debt_score,
      total_score: row.total_score,
      at_risk_debt: row.at_risk_debt,
      rank: row.rank,
    }))
  );
}

if (updates.length === 0) {
  console.log(onlyDate ? `No daily_reports found for ${onlyDate}.` : 'No daily_reports found.');
  process.exit(0);
}

for (let index = 0; index < updates.length; index += 500) {
  const batch = updates.slice(index, index + 500);
  const { error } = await supabase.from('daily_reports').upsert(batch, {
    onConflict: 'report_date,se_name',
  });
  if (error) throw error;
}

console.log(
  JSON.stringify(
    {
      success: true,
      updated_rows: updates.length,
      updated_dates: Object.keys(reportGroups).length,
      date_filter: onlyDate,
    },
    null,
    2
  )
);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function buildDebtSnapshots(rows) {
  const grouped = groupBy(rows, row => row.week_date);

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekDate, weekRows]) => ({
      weekDate,
      debtBySE: Object.fromEntries(
        weekRows.map(row => [row.se_name, Number(row.debt_amount) || 0])
      ),
    }));
}

function getDebtSnapshotForDate(reportDate, snapshots) {
  let selected = null;

  for (const snapshot of snapshots) {
    if (snapshot.weekDate <= reportDate) selected = snapshot;
    if (snapshot.weekDate > reportDate) break;
  }

  return selected?.debtBySE || null;
}

function groupBy(rows, getKey) {
  return rows.reduce((groups, row) => {
    const key = getKey(row);
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
    return groups;
  }, {});
}
