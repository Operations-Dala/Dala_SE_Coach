import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';
import { parseTierConfig, assignTier, calcBrandPct, evaluateStatus, getPosition, POSITIONS } from '@/lib/tier-engine';

/**
 * GET /api/analytics?date=YYYY-MM-DD&days=7
 *
 * Returns manager-summary data for the given anchor date:
 * - KPI summary (team avg, at-risk count, etc.)
 * - Per-SE data with tier, status, rank history for sparklines
 */
export async function GET(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const days = Math.min(parseInt(searchParams.get('days') || '7', 10), 30);

    if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 });

    // Load tier config and active brands count in parallel
    const [{ data: settingsRows }, { data: brandsData }, { data: rosterData }] = await Promise.all([
      supabase.from('settings').select('key, value').in('key', ['tier_config']),
      supabase.from('brand_partners').select('brand_name').eq('active', 1).eq('deleted', 0),
      supabase.from('team_roster').select('se_name, status, position, zone').eq('deleted', 0),
    ]);

    const tierConfigRaw = settingsRows?.find(s => s.key === 'tier_config')?.value;
    const tiers = parseTierConfig(tierConfigRaw);
    const totalBrands = brandsData?.length || 24;
    const fullSENames = new Set((rosterData || []).filter(r => r.status === 'full').map(r => r.se_name));
    // Map se_name → position key and zone
    const positionMap = Object.fromEntries(
      (rosterData || []).map(r => [r.se_name, r.position || 'sales_executive'])
    );
    const zoneMap = Object.fromEntries(
      (rosterData || []).map(r => [r.se_name, r.zone || 'Unassigned'])
    );

    // Q1: Today's reports (anchor date)
    const { data: todayReports, error: todayErr } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('report_date', date)
      .order('rank', { ascending: true });

    if (todayErr) throw todayErr;
    if (!todayReports || todayReports.length === 0) {
      return NextResponse.json({ summary: null, ses: [], date });
    }

    // Q2: Get last N distinct dates (for rank history) up to and including anchor date
    const { data: dateRows } = await supabase
      .from('daily_reports')
      .select('report_date')
      .lte('report_date', date)
      .order('report_date', { ascending: false })
      .limit(days);

    const recentDates = [...new Set((dateRows || []).map(r => r.report_date))];

    // Q3: Rank + score history for all SEs across those dates
    let rankHistoryMap = {}; // { se_name: [{report_date, rank, total_score}] }
    if (recentDates.length > 0) {
      const { data: historyRows } = await supabase
        .from('daily_reports')
        .select('report_date, se_name, rank, total_score')
        .in('report_date', recentDates)
        .order('report_date', { ascending: true });

      (historyRows || []).forEach(r => {
        if (!rankHistoryMap[r.se_name]) rankHistoryMap[r.se_name] = [];
        rankHistoryMap[r.se_name].push({ report_date: r.report_date, rank: r.rank, total_score: r.total_score });
      });
    }

    // Q4a: Last known debt score per SE (most recent report per SE before or on anchor date)
    const { data: debtRows } = await supabase
      .from('daily_reports')
      .select('se_name, debt_score, report_date')
      .lte('report_date', date)
      .order('report_date', { ascending: false });
    const lastDebtScores = {};
    (debtRows || []).forEach(r => {
      if (!(r.se_name in lastDebtScores)) lastDebtScores[r.se_name] = r.debt_score;
    });

    // Q4b: Latest outstanding monetary debt from debt_records
    const { data: debtRecords } = await supabase
      .from('debt_records')
      .select('se_name, zone, debt_amount, week_date')
      .order('week_date', { ascending: false });
    const latestDebtBySE = {};
    (debtRecords || []).forEach(r => {
      if (!(r.se_name in latestDebtBySE)) latestDebtBySE[r.se_name] = r;
    });
    const outstandingDebtTotal = Object.values(latestDebtBySE)
      .reduce((s, r) => s + (Number(r.debt_amount) || 0), 0);
    const debtByZone = {};
    Object.values(latestDebtBySE).forEach(r => {
      const zone = r.zone || 'Unassigned';
      debtByZone[zone] = (debtByZone[zone] || 0) + (Number(r.debt_amount) || 0);
    });

    // Q4: Yesterday's ranks (for delta calculation)
    const yesterdayDate = recentDates.find(d => d < date);
    const { data: yesterdayReports } = yesterdayDate
      ? await supabase.from('daily_reports').select('se_name, rank, total_score').eq('report_date', yesterdayDate)
      : { data: [] };
    const yesterdayMap = Object.fromEntries((yesterdayReports || []).map(r => [r.se_name, r]));

    // Enrich each SE with tier, status, sparkline data
    const enrichedSEs = todayReports.map(se => {
      const rankHistory  = rankHistoryMap[se.se_name] || [];
      const tierDef      = assignTier(se.rank, tiers);
      const positionKey  = positionMap[se.se_name] || 'sales_executive';
      const positionMeta = getPosition(positionKey);
      const { status, rankTrend, tierDelta, expectations } = evaluateStatus(se, tierDef, rankHistory, tiers, totalBrands, positionKey);
      const brandPct = calcBrandPct(se.brand_coverage, totalBrands);

      const yesterdayRank = yesterdayMap[se.se_name]?.rank;
      const rankDeltaVsYesterday = yesterdayRank ? yesterdayRank - se.rank : 0; // positive = improved

      const scores = rankHistory.map(h => h.total_score).filter(s => s != null);
      const avgScore7d = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : se.total_score;

      return {
        ...se,
        rankHistory,
        avgScore7d: Math.round(avgScore7d * 10) / 10,
        brandPct: Math.round(brandPct * 10) / 10,
        tier: tierDef,
        status,
        rankTrend,
        tierDelta,
        expectations,
        rankDeltaVsYesterday,
        isFullSE: fullSENames.has(se.se_name),
        positionKey,
        positionLabel: positionMeta.label,
        zone: zoneMap[se.se_name] || 'Unassigned',
        debt_amount: latestDebtBySE[se.se_name]?.debt_amount || 0,
      };
    });

    // Compute summary KPIs (full SEs only for averages)
    const fullSEs = enrichedSEs.filter(s => s.isFullSE);
    const teamAvgScore = fullSEs.length
      ? Math.round((fullSEs.reduce((s, e) => s + (e.total_score || 0), 0) / fullSEs.length) * 10) / 10
      : 0;
    const teamAvgScoreYesterday = fullSEs.length && yesterdayDate
      ? Math.round(
          (fullSEs.reduce((s, e) => s + (yesterdayMap[e.se_name]?.total_score || 0), 0) / fullSEs.length) * 10
        ) / 10
      : null;
    const totalValue = enrichedSEs.reduce((s, e) => s + (e.value_of_orders || 0), 0);
    const atRiskCount     = enrichedSEs.filter(e => e.status === 'at_risk').length;
    const risingCount     = enrichedSEs.filter(e => e.status === 'rising').length;
    const decliningCount  = enrichedSEs.filter(e => e.status === 'watch' || e.status === 'below_expectation').length;

    return NextResponse.json({
      date,
      summary: {
        teamAvgScore,
        teamAvgScoreYesterday,
        reportingCount: enrichedSEs.length,
        totalValue,
        atRiskCount,
        risingCount,
        decliningCount,
        outstandingDebtTotal,
        debtByZone,
      },
      ses: enrichedSEs,
      tiers,
      lastDebtScores,
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
