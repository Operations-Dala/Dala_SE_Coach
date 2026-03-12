import { NextResponse } from 'next/server';
import { supabase }     from '@/lib/supabase';

/**
 * GET /api/se-history?se=NAME&days=30
 * Returns up to `days` daily_report rows for the SE, ordered date ascending.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const seName = searchParams.get('se');
  const days   = Math.min(Math.max(parseInt(searchParams.get('days') || '30'), 1), 90);

  if (!seName) return NextResponse.json({ error: 'se param required' }, { status: 400 });

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_reports')
    .select('report_date, total_score, stores_visited, resumption_time, brands_ordered, value_of_orders, debt_score, time_score, visit_score, brand_score, efficiency_score')
    .eq('se_name', seName)
    .gte('report_date', fromStr)
    .order('report_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
