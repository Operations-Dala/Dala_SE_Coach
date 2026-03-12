/**
 * Score each SE's daily performance out of 100.
 *
 * Weights (configurable, loaded from DB settings):
 *   time_score:       5
 *   visit_score:     10
 *   brand_score:     40
 *   efficiency_score: 15
 *   debt_score:      30  (manual input)
 *
 * @param {Object} metrics  - output row from data-engine
 * @param {Object} config   - settings from DB
 * @param {number} totalActiveBrands - count of active brand partners
 * @param {number} debtScore - manual input (0–30), default 30
 */
export function scoreMetrics(metrics, config, totalActiveBrands, debtScore = 30) {
  const maxTime       = Number(config.score_time       || 5);
  const maxVisits     = Number(config.score_visits      || 10);
  const maxBrands     = Number(config.score_brands      || 40);
  const maxEfficiency = Number(config.score_efficiency  || 15);

  const minStore      = Number(config.min_store_target      || 8);
  const advStore      = Number(config.advanced_store_target || 10);
  const surveysTarget = Number(config.surveys_target        || 15);

  // --- Time Score (5 pts) ---
  // ≤ 08:50 → full · ≤ 09:00 → partial · later → 0
  let timeScore = 0;
  if (metrics.resumption_time) {
    const [h, m] = metrics.resumption_time.split(':').map(Number);
    const totalMins = h * 60 + m;
    if (totalMins <= 8 * 60 + 50) {
      timeScore = maxTime;              // full points
    } else if (totalMins <= 9 * 60) {
      timeScore = maxTime * 0.6;        // 3 out of 5
    } else {
      timeScore = 0;
    }
  }

  // --- Visit Score (10 pts) ---
  // 0 if < minStore · proportional between min and advanced
  let visitScore = 0;
  const sv = metrics.stores_visited || 0;
  if (sv >= advStore) {
    visitScore = maxVisits;
  } else if (sv >= minStore) {
    visitScore = maxVisits * 0.5 + (maxVisits * 0.5) * ((sv - minStore) / (advStore - minStore));
  } else if (sv > 0) {
    visitScore = maxVisits * 0.5 * (sv / minStore);
  }

  // --- Brand Score (40 pts) ---
  // Proportion of active brand partners covered
  let brandScore = 0;
  if (totalActiveBrands > 0) {
    brandScore = (metrics.brands_ordered / totalActiveBrands) * maxBrands;
  }

  // --- Efficiency Score (15 pts) ---
  // Based on complete reports vs surveys target
  let efficiencyScore = 0;
  if (surveysTarget > 0) {
    efficiencyScore = Math.min(
      (metrics.complete_report / surveysTarget) * maxEfficiency,
      maxEfficiency
    );
  }

  // --- Debt Score (30 pts) ---
  // Manual — passed in directly, clamped to valid range
  const clampedDebt = Math.max(0, Math.min(debtScore, 30));

  const totalScore =
    timeScore + visitScore + brandScore + efficiencyScore + clampedDebt;

  return {
    time_score:       Math.round(timeScore * 100) / 100,
    visit_score:      Math.round(visitScore * 100) / 100,
    brand_score:      Math.round(brandScore * 100) / 100,
    efficiency_score: Math.round(efficiencyScore * 100) / 100,
    debt_score:       clampedDebt,
    total_score:      Math.round(totalScore * 100) / 100,
  };
}

/**
 * Rank an array of scored SE rows (mutates in place, adds .rank field).
 * Full-status SEs are ranked separately from trial SEs.
 */
export function assignRanks(rows) {
  const full  = rows.filter(r => r.status !== 'trial').sort((a, b) => b.total_score - a.total_score);
  const trial = rows.filter(r => r.status === 'trial').sort((a, b) => b.total_score - a.total_score);

  full.forEach((r, i)  => { r.rank = i + 1; r.rank_group = 'full'; });
  trial.forEach((r, i) => { r.rank = i + 1; r.rank_group = 'trial'; });

  return rows;
}
