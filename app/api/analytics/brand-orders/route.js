import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/analytics/brand-orders?days=30
 *
 * Reads brand_coverage (JSON) from daily_reports and aggregates
 * how many SE-days each brand was ordered in the given period.
 *
 * Returns: [{ brand, count }] sorted descending
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 90);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  try {
    const { data: reports, error } = await supabase
      .from('daily_reports')
      .select('brand_coverage')
      .gte('report_date', sinceStr);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const brandCounts = {};
    for (const row of reports || []) {
      try {
        const coverage = typeof row.brand_coverage === 'string'
          ? JSON.parse(row.brand_coverage) : (row.brand_coverage || {});
        for (const [brand, ordered] of Object.entries(coverage)) {
          if (ordered && brand) {
            brandCounts[brand] = (brandCounts[brand] || 0) + 1;
          }
        }
      } catch {}
    }

    const result = Object.entries(brandCounts)
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
