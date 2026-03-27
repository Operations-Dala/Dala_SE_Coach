import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { parseExpenseUploadRows, today } from '@/lib/financial-import';

/**
 * POST /api/upload/expenses
 *
 * Accepts either:
 * - PepUp expense export with Salesman Name / Allowance Date / Total Amount columns
 * - Legacy 3-column sheet: Date | SE Name | Amount
 *
 * Upserts into expense_records keyed on (record_date, se_name).
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('expense_file');
    const fallbackDate = formData.get('record_date') || today();

    if (!file) {
      return NextResponse.json({ error: 'expense_file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const { data: rosterRows } = await supabase
      .from('team_roster')
      .select('se_name')
      .eq('deleted', 0);

    const { records, skipped, format } = parseExpenseUploadRows(rows, rosterRows || [], fallbackDate);

    if (records.length === 0) {
      return NextResponse.json(
        { error: 'No valid records found.', skipped },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('expense_records')
      .upsert(records, { onConflict: 'record_date,se_name' });
    if (error) throw error;

    return NextResponse.json({
      success: true,
      format,
      imported: records.length,
      skipped: skipped.length,
      skipped_names: skipped,
      total_amount: records.reduce((sum, record) => sum + record.amount, 0),
    });
  } catch (err) {
    console.error('Expense upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
