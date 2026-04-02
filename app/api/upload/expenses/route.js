import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
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
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

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
      const headerRow = rows.find(r => Array.isArray(r) && r.some(c => String(c || '').trim()));
      const sampleHeaders = headerRow ? headerRow.map(c => String(c || '').trim()).filter(Boolean) : [];
      const sampleRows = rows.slice(1, 4).map(r => (r || []).slice(0, 4).map(c => String(c ?? '')));
      return NextResponse.json(
        {
          error: 'No valid records found.',
          skipped,
          debug: {
            format_detected: format || 'none',
            total_rows: rows.length,
            detected_headers: sampleHeaders,
            sample_data: sampleRows,
            roster_count: (rosterRows || []).length,
          },
        },
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
