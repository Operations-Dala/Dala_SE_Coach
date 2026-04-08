import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/alerts/dormant-brands
 *
 * Returns active brands that had zero orders across ALL SEs in the last 3 days.
 * Also returns brands with zero orders in the last 2 days (for orange warning).
 */
export async function GET(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const today = new Date();
  const dates = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Get active brands
  const { data: brandRows } = await supabase
    .from('brand_partners')
    .select('brand_name')
    .eq('active', 1)
    .eq('deleted', 0);

  const activeBrands = (brandRows || []).map(b => b.brand_name);
  if (activeBrands.length === 0) return NextResponse.json([]);

  // Get daily reports for the last 3 days
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('report_date, brand_coverage')
    .in('report_date', dates);

  // Build coverage map: brand → Set of dates it was ordered
  const coveredDates = {};
  for (const brand of activeBrands) coveredDates[brand] = new Set();

  for (const report of (reports || [])) {
    let coverage = {};
    try { coverage = JSON.parse(report.brand_coverage || '{}'); } catch {}
    for (const [brand, covered] of Object.entries(coverage)) {
      if (covered && coveredDates[brand]) {
        coveredDates[brand].add(report.report_date);
      }
    }
  }

  // Find last ordered date from all historical data (for display)
  const { data: allReports } = await supabase
    .from('daily_reports')
    .select('report_date, brand_coverage')
    .order('report_date', { ascending: false })
    .limit(300);

  const lastOrderedDate = {};
  for (const report of (allReports || [])) {
    let coverage = {};
    try { coverage = JSON.parse(report.brand_coverage || '{}'); } catch {}
    for (const [brand, covered] of Object.entries(coverage)) {
      if (covered && !lastOrderedDate[brand]) {
        lastOrderedDate[brand] = report.report_date;
      }
    }
  }

  const dormant = [];
  for (const brand of activeBrands) {
    const orderedDays = coveredDates[brand].size;
    if (orderedDays === 0) {
      // Check if zero in 2 days or 3 days
      const daysMissed = dates.length; // up to 3
      dormant.push({
        brand,
        days_missed: daysMissed,
        last_ordered: lastOrderedDate[brand] || null,
        severity: 'red', // 3 days
      });
    } else if (orderedDays === 1 && !coveredDates[brand].has(dates[0]) && !coveredDates[brand].has(dates[1])) {
      // Only ordered on day 3, nothing in last 2 days
      dormant.push({
        brand,
        days_missed: 2,
        last_ordered: lastOrderedDate[brand] || null,
        severity: 'orange',
      });
    }
  }

  dormant.sort((a, b) => b.days_missed - a.days_missed);
  return NextResponse.json(dormant);
}
