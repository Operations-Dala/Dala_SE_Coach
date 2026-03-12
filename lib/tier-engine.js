/**
 * Tier Engine — pure functions for tier assignment, expectation checking, and status evaluation.
 * No DB calls, no side effects. Safe to import in both server and client contexts.
 */

/**
 * Position values and the extra threshold added ON TOP of the base tier minimums.
 * A Senior SE ranked #5 (T2 Strong: minScore 65) must actually score ≥70.
 * A Corporate SE must score ≥75 at the same rank.
 */
export const POSITIONS = {
  corporate_se:    { label: 'Corporate SE',   scoreAdj: 10, brandAdj: 8,  storesAdj: 1  },
  senior_se:       { label: 'Senior SE',      scoreAdj: 5,  brandAdj: 5,  storesAdj: -5 },
  sales_executive: { label: 'Sales Executive',scoreAdj: 0,  brandAdj: 0,  storesAdj: 0  },
  junior_se:       { label: 'Junior SE',      scoreAdj: -5, brandAdj: -5, storesAdj: -1 },
  trial:           { label: 'Trial',          scoreAdj: 0,  brandAdj: 0,  storesAdj: 0, exempt: true },
};

export function getPosition(positionKey) {
  return POSITIONS[positionKey] || POSITIONS['sales_executive'];
}

export const DEFAULT_TIERS = [
  { tier: 1, label: 'Elite',      color: 'yellow',  rankRange: [1, 3],   minScore: 80, minBrandPct: 85, minStores: 11 },
  { tier: 2, label: 'Strong',     color: 'green',   rankRange: [4, 7],   minScore: 65, minBrandPct: 70, minStores: 10 },
  { tier: 3, label: 'Developing', color: 'blue',    rankRange: [8, 11],  minScore: 50, minBrandPct: 55, minStores: 9  },
  { tier: 4, label: 'At Risk',    color: 'red',     rankRange: [12, 15], minScore: 40, minBrandPct: 40, minStores: 8  },
];

/**
 * Parse tier config from settings value (JSON string or array).
 * Falls back to DEFAULT_TIERS if invalid.
 */
export function parseTierConfig(raw) {
  if (!raw) return DEFAULT_TIERS;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TIERS;
  } catch {
    return DEFAULT_TIERS;
  }
}

/**
 * Assign a tier to an SE based on their rank.
 * @param {number} rank - The SE's current rank (1-based)
 * @param {Array} tiers - Tier config array (from parseTierConfig)
 * @returns {Object} tier definition or a fallback
 */
export function assignTier(rank, tiers = DEFAULT_TIERS) {
  if (!rank) return { tier: 0, label: 'Unranked', color: 'slate', rankRange: [0, 0], minScore: 0, minBrandPct: 0, minStores: 0 };
  return tiers.find(t => rank >= t.rankRange[0] && rank <= t.rankRange[1])
    || tiers[tiers.length - 1];
}

/**
 * Calculate brand coverage percentage.
 * @param {string|Object} brandCoverage - JSON string or object mapping brand → boolean
 * @param {number} totalBrands - Total active brands
 * @returns {number} percentage 0-100
 */
export function calcBrandPct(brandCoverage, totalBrands) {
  if (!totalBrands) return 0;
  let coverage;
  try {
    coverage = typeof brandCoverage === 'string' ? JSON.parse(brandCoverage || '{}') : (brandCoverage || {});
  } catch {
    return 0;
  }
  const covered = Object.values(coverage).filter(Boolean).length;
  return (covered / totalBrands) * 100;
}

/**
 * Check whether an SE meets their tier's minimum expectations, adjusted for their position.
 * Senior SE and Corporate SE have higher thresholds than a regular Sales Executive at the same rank.
 * Trial SEs are always exempt.
 *
 * @param {Object} se - daily_report row
 * @param {Object} tierDef - tier definition from assignTier
 * @param {number} totalBrands - count of active brands
 * @param {string} positionKey - 'corporate_se' | 'senior_se' | 'sales_executive' | 'trial'
 * @returns {{ meetsAll, scoreOk, brandsOk, storesOk, brandPct, minScore, minBrandPct, minStores, exempt }}
 */
export function checkExpectations(se, tierDef, totalBrands, positionKey = 'sales_executive') {
  const pos = getPosition(positionKey);
  if (pos.exempt) {
    return { meetsAll: true, scoreOk: true, brandsOk: true, storesOk: true, brandPct: 0, exempt: true,
             minScore: 0, minBrandPct: 0, minStores: 0 };
  }
  const minScore    = tierDef.minScore    + pos.scoreAdj;
  const minBrandPct = tierDef.minBrandPct + pos.brandAdj;
  const minStores   = tierDef.minStores   + pos.storesAdj;
  const brandPct    = calcBrandPct(se.brand_coverage, totalBrands);
  const scoreOk     = (se.total_score    || 0) >= minScore;
  const brandsOk    = brandPct >= minBrandPct;
  const storesOk    = (se.stores_visited || 0) >= minStores;
  return { meetsAll: scoreOk && brandsOk && storesOk, scoreOk, brandsOk, storesOk, brandPct,
           minScore, minBrandPct, minStores, exempt: false };
}

/**
 * Build a 7-entry sparkline array (null-padded at the start if fewer days available).
 * Lower rank number = better performance = higher on chart (caller inverts Y axis).
 * @param {Array} rankHistory - [{ report_date, rank }, ...] sorted date ASC
 * @param {number} maxDays
 * @returns {(number|null)[]} rank positions, length = maxDays
 */
export function buildRankSparkline(rankHistory = [], maxDays = 7) {
  const slots = Array(maxDays).fill(null);
  const recent = rankHistory.slice(-maxDays);
  recent.forEach((h, i) => {
    slots[maxDays - recent.length + i] = h.rank;
  });
  return slots;
}

/**
 * Evaluate SE status based on tier, expectations, and rank history.
 *
 * Priority order:
 *  1. Rising  — improved ≥1 tier vs 7-day-ago rank
 *  2. At Risk — dropped ≥1 tier AND below tier min metrics
 *  3. Below Expectation — within same tier but failing one or more KPIs
 *  4. Watch   — meets KPIs but rank trending down
 *  5. On Track — everything good
 *
 * @param {Object} se - daily_report row (current day)
 * @param {Object} tierDef - current tier from assignTier
 * @param {Array} rankHistory - sorted ASC [{report_date, rank}]
 * @param {Array} tiers - full tier config
 * @param {number} totalBrands
 * @returns {{ status: string, rankTrend: 'improving'|'declining'|'stable', expectations: Object }}
 */
export function evaluateStatus(se, tierDef, rankHistory = [], tiers = DEFAULT_TIERS, totalBrands = 24, positionKey = 'sales_executive') {
  const expectations = checkExpectations(se, tierDef, totalBrands, positionKey);

  // Compute rank trend using first-half vs second-half averages
  const validHistory = rankHistory.filter(h => h.rank != null);
  let rankTrend = 'stable';
  let tierDelta = 0;

  if (validHistory.length >= 2) {
    const mid = Math.ceil(validHistory.length / 2);
    const firstHalf = validHistory.slice(0, mid);
    const secondHalf = validHistory.slice(mid);
    const avgFirst = firstHalf.reduce((s, h) => s + h.rank, 0) / firstHalf.length;
    const avgLast  = secondHalf.reduce((s, h) => s + h.rank, 0) / secondHalf.length;

    if (avgLast < avgFirst - 0.5) rankTrend = 'improving';   // rank number going down = better
    else if (avgLast > avgFirst + 0.5) rankTrend = 'declining';

    // Compare tier from 7-day-ago rank vs current tier
    const oldRank = validHistory[0]?.rank;
    if (oldRank) {
      const oldTier = assignTier(oldRank, tiers);
      tierDelta = oldTier.tier - tierDef.tier; // positive = improved (moved to lower tier number)
    }
  }

  let status;
  if (tierDelta >= 1) {
    status = 'rising';
  } else if (tierDelta <= -1 && !expectations.meetsAll) {
    status = 'at_risk';
  } else if (!expectations.meetsAll) {
    status = 'below_expectation';
  } else if (rankTrend === 'declining') {
    status = 'watch';
  } else {
    status = 'on_track';
  }

  return { status, rankTrend, tierDelta, expectations };
}

/** Map status key to display label and badge colors (Tailwind classes) */
export const STATUS_META = {
  on_track:          { label: 'On Track',          bg: 'bg-slate-700',    text: 'text-slate-200',  dot: 'bg-slate-400' },
  watch:             { label: 'Watch',              bg: 'bg-yellow-900/60',text: 'text-yellow-300', dot: 'bg-yellow-400' },
  below_expectation: { label: 'Below Expectation',  bg: 'bg-orange-900/60',text: 'text-orange-300', dot: 'bg-orange-400' },
  at_risk:           { label: 'At Risk',            bg: 'bg-red-900/60',   text: 'text-red-300',    dot: 'bg-red-400' },
  rising:            { label: 'Rising',             bg: 'bg-green-900/60', text: 'text-green-300',  dot: 'bg-green-400' },
};

/** Map tier number to badge colors */
export const TIER_META = {
  1: { bg: 'bg-yellow-900/60', text: 'text-yellow-300', border: 'border-yellow-700' },
  2: { bg: 'bg-green-900/60',  text: 'text-green-300',  border: 'border-green-700' },
  3: { bg: 'bg-blue-900/60',   text: 'text-blue-300',   border: 'border-blue-700' },
  4: { bg: 'bg-red-900/60',    text: 'text-red-300',    border: 'border-red-700' },
  0: { bg: 'bg-slate-800',     text: 'text-slate-400',  border: 'border-slate-600' },
};
