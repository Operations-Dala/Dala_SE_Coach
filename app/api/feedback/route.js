import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/feedback?date=YYYY-MM-DD&se=SE+Name
 *
 * Returns feedback Q&A rows grouped by SE → store → brand.
 * If ?se= is provided, returns only that SE's data.
 */
export async function GET(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const { searchParams } = new URL(request.url);
  const date   = searchParams.get('date');
  const seName = searchParams.get('se');

  if (!date) {
    return NextResponse.json({ error: 'date param is required' }, { status: 400 });
  }

  let query = supabase
    .from('feedback_details')
    .select('se_name, store_name, brand_name, survey_name, question, answer')
    .eq('report_date', date)
    .order('se_name')
    .order('store_name')
    .order('brand_name');

  if (seName) query = query.eq('se_name', seName);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group: { se_name → { store_name → { brand_name → [{question, answer}] } } }
  const grouped = {};
  for (const row of data || []) {
    if (!grouped[row.se_name]) grouped[row.se_name] = {};
    if (!grouped[row.se_name][row.store_name]) grouped[row.se_name][row.store_name] = {};
    if (!grouped[row.se_name][row.store_name][row.brand_name]) {
      grouped[row.se_name][row.store_name][row.brand_name] = [];
    }
    grouped[row.se_name][row.store_name][row.brand_name].push({
      question: row.question,
      answer:   row.answer,
    });
  }

  return NextResponse.json({ date, grouped, total: (data || []).length });
}
