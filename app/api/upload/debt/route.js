import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

import { allocateRegionMatchedDebt, normaliseDebtRegion } from '@/lib/debt-import';

/**
 * POST /api/upload/debt
 *
 * Accepts two formats:
 *
 * FORMAT A - legacy: single sheet with columns: SE Name | Debt Amount | (optional) Week Date
 *
 * FORMAT B - multi-sheet workbook (auto-detected by "Data" sheet):
 *   Sheet "Data": S/N | Retail outlet | Region | Zone code | Debit
 *
 *   Each debt row is allocated across all matching SEs in that zone/region.
 *   This prevents zone totals from being inflated when multiple SEs share coverage.
 *
 * Upserts into debt_records keyed on (se_name, week_date).
 */

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('debt_file');
    const weekDate = formData.get('week_date') || nearestMonday();

    if (!file) {
      return NextResponse.json({ error: 'debt_file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const { data: rosterRows } = await supabase
      .from('team_roster')
      .select('se_name, zone, region')
      .eq('deleted', 0);

    const dataSheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'data');
    const isNewFormat = Boolean(dataSheetName);

    let records = [];
    let skipped = [];

    if (isNewFormat) {
      const dataSheet = workbook.Sheets[dataSheetName];
      const rows = XLSX.utils.sheet_to_json(dataSheet, { header: 1, defval: '' });

      const debtByRegionAndZone = {};
      let totalCorpDebt = 0;

      for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        const rawRegion = String(row[2] || '').trim();
        const rawZone = String(row[3] || '').trim();
        const rawDebit = row[4];

        if (!rawRegion || !rawZone || rawDebit === '' || rawDebit === null) continue;

        const amount = Number.parseFloat(String(rawDebit).replace(/[₦,\s]/g, ''));
        if (Number.isNaN(amount) || amount <= 0) continue;

        const normRegion = normaliseDebtRegion(rawRegion);
        if (!normRegion) continue;

        const normZone = rawZone.toUpperCase();

        if (/^Z[1-4]\.CORP$/.test(normZone)) {
          totalCorpDebt += amount;
          continue;
        }

        if (!/^Z[1-4]\.(RTL|DLR)$/.test(normZone)) continue;

        if (!debtByRegionAndZone[normRegion]) debtByRegionAndZone[normRegion] = {};
        debtByRegionAndZone[normRegion][normZone] =
          (debtByRegionAndZone[normRegion][normZone] || 0) + amount;
      }

      ({ records, skipped } = allocateRegionMatchedDebt({
        rosterRows,
        debtByRegionAndZone,
        totalCorpDebt,
        weekDate,
      }));
    } else {
      const rosterMap = Object.fromEntries((rosterRows || []).map(row => [row.se_name.toLowerCase(), row]));
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        const rawName = String(row[0] || '').trim();
        const rawAmount = row[1];
        const rowDate = row[2] ? formatDate(row[2]) : weekDate;

        if (!rawName || rawAmount === '' || rawAmount === null) continue;

        const amount = Number.parseFloat(String(rawAmount).replace(/[₦,\s]/g, ''));
        if (Number.isNaN(amount)) continue;

        const matched = rosterMap[rawName.toLowerCase()];
        if (!matched) {
          skipped.push(rawName);
          continue;
        }

        records.push({
          se_name: matched.se_name,
          zone: matched.zone || '',
          debt_amount: amount,
          week_date: rowDate,
        });
      }
    }

    if (records.length === 0) {
      return NextResponse.json(
        { error: 'No valid records to import.', skipped },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('debt_records')
      .upsert(records, { onConflict: 'se_name,week_date' });
    if (error) throw error;

    return NextResponse.json({
      success: true,
      format: isNewFormat ? 'region-matched' : 'per-se',
      week: weekDate,
      imported: records.length,
      skipped: skipped.length,
      skipped_names: skipped,
      total_debt: records.reduce((sum, record) => sum + record.debt_amount, 0),
    });
  } catch (err) {
    console.error('Debt upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function nearestMonday() {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().split('T')[0];
}

function formatDate(val) {
  if (!val) return nearestMonday();

  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }

  const value = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  if (/^\d{2}-\d{2}-\d{2}$/.test(value)) {
    const [day, month, year] = value.split('-');
    return `20${year}-${month}-${day}`;
  }

  return nearestMonday();
}
