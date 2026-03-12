export const ZONE_DEBT_BASELINE_PCT = 10;
export const ZONE_DEBT_MAX_PCT = 25;

export function buildZoneDebtTotals(latestDebtBySE, zoneBySE = {}) {
  return Object.entries(latestDebtBySE || {}).reduce((totals, [seName, debtAmount]) => {
    const zone = zoneBySE[seName] || 'Unassigned';
    totals[zone] = (totals[zone] || 0) + (Number(debtAmount) || 0);
    return totals;
  }, {});
}

export function calcZoneDebtScore(seName, latestDebtBySE, zoneBySE = {}) {
  const debtBySE = latestDebtBySE || {};
  const totalDebt = Object.values(debtBySE).reduce((sum, amount) => sum + (Number(amount) || 0), 0);

  if (totalDebt <= 0) return 30;

  const zone = zoneBySE[seName] || 'Unassigned';
  const zoneDebtTotals = buildZoneDebtTotals(debtBySE, zoneBySE);
  const zoneDebt = zoneDebtTotals[zone] || 0;

  if (zoneDebt <= 0) return 30;

  const zoneDebtPct = (zoneDebt / totalDebt) * 100;
  if (zoneDebtPct <= ZONE_DEBT_BASELINE_PCT) return 30;
  if (zoneDebtPct >= ZONE_DEBT_MAX_PCT) return 0;

  const progress =
    (zoneDebtPct - ZONE_DEBT_BASELINE_PCT) /
    (ZONE_DEBT_MAX_PCT - ZONE_DEBT_BASELINE_PCT);

  return Math.max(0, Math.round(30 * (1 - progress)));
}
