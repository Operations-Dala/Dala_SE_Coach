import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { parseInflowUploadRows, today } from '@/lib/financial-import';

/**
 * POST /api/upload/inflow
 *
 * Accepts either:
 * - Region-summary inflow export (Reg 1a / Reg 10c / CORP Reg 5a, etc.)
 * - Legacy 3-column sheet: Date | SE Name | Amount
 *
 * Upserts into inflow_records keyed on (record_date, se_name).
 */
export async function POST(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  try {
    const formData = await request.formData();
    const file = formData.get('inflow_file');
    const fallbackDate = formData.get('record_date') || today();

    if (!file) {
      return NextResponse.json({ error: 'inflow_file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const { data: rosterRows } = await supabase
      .from('team_roster')
      .select('se_name, position, zone, region')
      .eq('deleted', 0);

    const { records, skipped, format } = parseInflowUploadRows(rows, rosterRows || [], fallbackDate);

    if (records.length === 0) {
      return NextResponse.json(
        { error: 'No valid records found.', skipped },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('inflow_records')
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
    console.error('Inflow upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
