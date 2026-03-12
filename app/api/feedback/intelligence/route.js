import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/feedback/intelligence?days=14
 *
 * Aggregates field intelligence from:
 *   1. feedback_details   — raw Q&A rows (always available)
 *   2. coaching_history   — AI-extracted product mentions with fault_attribution
 *
 * Returns:
 *   - accountability breakdown (SE fault vs Supply/Dala fault vs Market)
 *   - top brands by complaint frequency
 *   - recent raw field observations
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get('days') || '14', 10), 60);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  try {
    const [{ data: feedbackRows }, { data: coachingRows }] = await Promise.all([
      supabase
        .from('feedback_details')
        .select('report_date, se_name, brand_name, store_name, question, answer')
        .gte('report_date', sinceStr)
        .order('report_date', { ascending: false }),

      supabase
        .from('coaching_history')
        .select('report_date, se_name, analysis_json')
        .gte('report_date', sinceStr)
        .order('report_date', { ascending: false }),
    ]);

    // ── Extract AI product mentions from coaching_history ─────────────────────
    const productMentions = [];
    const accountabilityTotals = { se: 0, supply: 0, market: 0, shared: 0 };

    for (const row of coachingRows || []) {
      try {
        const analysis = typeof row.analysis_json === 'string'
          ? JSON.parse(row.analysis_json) : row.analysis_json;
        const mentions = analysis?.feedback?.product_mentions || [];
        for (const m of mentions) {
          productMentions.push({ ...m, report_date: row.report_date, se_name: row.se_name });
          const attr = m.fault_attribution;
          if (attr && attr in accountabilityTotals) accountabilityTotals[attr]++;
        }
      } catch {}
    }

    const totalAttributed = Object.values(accountabilityTotals).reduce((a, b) => a + b, 0);
    const pct = (n) => totalAttributed ? Math.round((n / totalAttributed) * 100) : 0;

    // ── Aggregate AI mentions by brand ────────────────────────────────────────
    const brandMentionMap = {};
    for (const m of productMentions) {
      const key = m.brand || 'Unknown';
      if (!brandMentionMap[key]) {
        brandMentionMap[key] = { brand: key, count: 0, issue_types: {}, fault_attrs: {}, examples: [] };
      }
      brandMentionMap[key].count++;
      if (m.type) brandMentionMap[key].issue_types[m.type] = (brandMentionMap[key].issue_types[m.type] || 0) + 1;
      if (m.fault_attribution) {
        brandMentionMap[key].fault_attrs[m.fault_attribution] =
          (brandMentionMap[key].fault_attrs[m.fault_attribution] || 0) + 1;
      }
      if (brandMentionMap[key].examples.length < 10 && m.issue) {
        brandMentionMap[key].examples.push({
          store: m.store, issue: m.issue, severity: m.severity,
          fault: m.fault_attribution, date: m.report_date,
        });
      }
    }
    const brandSummary = Object.values(brandMentionMap).sort((a, b) => b.count - a.count);

    // ── Raw feedback aggregation (for context when no AI analysis yet) ────────
    const rawBrandMap = {};
    for (const row of feedbackRows || []) {
      if (!row.answer?.trim() || row.answer.length < 10) continue;
      if (!rawBrandMap[row.brand_name]) {
        rawBrandMap[row.brand_name] = { brand: row.brand_name, raw_count: 0, recent: [] };
      }
      rawBrandMap[row.brand_name].raw_count++;
      if (rawBrandMap[row.brand_name].recent.length < 3) {
        rawBrandMap[row.brand_name].recent.push({
          se: row.se_name, store: row.store_name,
          note: row.answer.slice(0, 150), date: row.report_date,
        });
      }
    }
    const rawBrandSummary = Object.values(rawBrandMap)
      .sort((a, b) => b.raw_count - a.raw_count)
      .slice(0, 25);

    // ── Recent raw complaints list ─────────────────────────────────────────────
    const recentComplaints = (feedbackRows || [])
      .filter(r => r.answer?.trim() && r.answer.length > 20)
      .slice(0, 50)
      .map(r => ({
        date: r.report_date, se: r.se_name,
        brand: r.brand_name, store: r.store_name,
        note: r.answer.slice(0, 300),
      }));

    return NextResponse.json({
      days,
      since: sinceStr,
      has_ai_analysis: productMentions.length > 0,
      accountability: {
        totals: accountabilityTotals,
        total: totalAttributed,
        se_pct:     pct(accountabilityTotals.se),
        supply_pct: pct(accountabilityTotals.supply + accountabilityTotals.shared),
        market_pct: pct(accountabilityTotals.market),
      },
      brand_summary:     brandSummary,
      raw_brand_summary: rawBrandSummary,
      recent_complaints: recentComplaints,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
