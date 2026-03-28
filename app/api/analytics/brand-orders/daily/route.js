import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/analytics/brand-orders/daily?date=YYYY-MM-DD
 *
 * Returns the count of SEs who ordered each brand on a specific date.
 * Reads brand_coverage JSON from daily_reports for that day.
 * Also returns total SE count for that date.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || todayStr();

  const { data: reports, error } = await supabase
    .from('daily_reports')
    .select('se_name, brand_coverage')
    .eq('report_date', date);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!reports || reports.length === 0) {
    return NextResponse.json({ date, total_ses: 0, brands: [] });
  }

  // Aggregate coverage counts per brand
  const brandCounts = {};
  let totalSEs = 0;

  for (const report of reports) {
    let coverage = {};
    try { coverage = JSON.parse(report.brand_coverage || '{}'); } catch {}

    const hasCoverage = Object.keys(coverage).length > 0;
    if (hasCoverage) totalSEs++;

    for (const [brand, covered] of Object.entries(coverage)) {
      if (!brandCounts[brand]) brandCounts[brand] = 0;
      if (covered) brandCounts[brand]++;
    }
  }

  const brands = Object.entries(brandCounts)
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ date, total_ses: totalSEs, brands });
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
