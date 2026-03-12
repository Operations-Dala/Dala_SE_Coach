export function zoneCodeMatchesSE(rawZoneCode, teamZone) {
  const zoneCode = String(rawZoneCode || '').trim().toUpperCase();

  switch (teamZone) {
    case 'Zone 1':
      return /^Z1\.(RTL)$/.test(zoneCode);
    case 'Zone 2':
      return /^Z2\.(RTL)$/.test(zoneCode);
    case 'Zone 3':
      return /^Z3\.(RTL)$/.test(zoneCode);
    case 'Zone 4':
      return /^Z4\.(RTL|DLR)$/.test(zoneCode);
    case 'All Corporate':
      return /^Z[1-4]\.CORP$/.test(zoneCode);
    default:
      return false;
  }
}

export function parseSeRegions(regionStr) {
  if (!regionStr || regionStr.trim().toLowerCase() === 'all corporate') return null;
  return regionStr.split(',').map(token => token.trim().toLowerCase()).filter(Boolean);
}

export function normaliseDebtRegion(raw) {
  const region = String(raw || '').trim().toLowerCase().replace(/^reg\s+/, '');
  if (!region || region === 'oos' || region === 'bp') return null;
  return region;
}

function parseRegionKey(key) {
  const match = String(key || '').match(/^(\d+)([a-z]?)$/);
  if (!match) return null;
  return { num: Number.parseInt(match[1], 10), letter: match[2] || null };
}

export function tokenMatchesRegionKey(seToken, debtKey) {
  const seRegion = parseRegionKey(seToken);
  const debtRegion = parseRegionKey(debtKey);

  if (!seRegion || !debtRegion) return false;
  if (seRegion.num !== debtRegion.num) return false;
  if (!seRegion.letter) return true;
  return seRegion.letter === debtRegion.letter;
}

function toCents(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

function fromCents(cents) {
  return cents / 100;
}

function splitAmountEvenly(amount, count) {
  if (count <= 0) return [];

  const totalCents = toCents(amount);
  const baseShare = Math.floor(totalCents / count);
  const remainder = totalCents % count;

  return Array.from({ length: count }, (_, index) => fromCents(baseShare + (index < remainder ? 1 : 0)));
}

export function allocateRegionMatchedDebt({ rosterRows, debtByRegionAndZone, totalCorpDebt = 0, weekDate }) {
  const roster = (rosterRows || []).map(row => ({
    ...row,
    teamZone: row.zone || '',
    regionTokens: parseSeRegions(row.region || ''),
  }));

  const debtBySE = {};

  for (const [debtKey, zoneAmounts] of Object.entries(debtByRegionAndZone || {})) {
    for (const [normZone, amount] of Object.entries(zoneAmounts || {})) {
      const matches = roster
        .filter(se =>
          se.teamZone !== 'All Corporate' &&
          se.regionTokens?.some(token => tokenMatchesRegionKey(token, debtKey)) &&
          zoneCodeMatchesSE(normZone, se.teamZone)
        )
        .sort((a, b) => a.se_name.localeCompare(b.se_name));

      if (matches.length === 0) continue;

      const shares = splitAmountEvenly(amount, matches.length);
      matches.forEach((se, index) => {
        debtBySE[se.se_name] = (debtBySE[se.se_name] || 0) + shares[index];
      });
    }
  }

  const corporateSEs = roster
    .filter(se => se.teamZone === 'All Corporate')
    .sort((a, b) => a.se_name.localeCompare(b.se_name));

  if (corporateSEs.length > 0 && totalCorpDebt > 0) {
    const shares = splitAmountEvenly(totalCorpDebt, corporateSEs.length);
    corporateSEs.forEach((se, index) => {
      debtBySE[se.se_name] = (debtBySE[se.se_name] || 0) + shares[index];
    });
  }

  const records = [];
  const skipped = [];

  roster.forEach(se => {
    const allocatedDebt = Math.round((debtBySE[se.se_name] || 0) * 100) / 100;

    if (allocatedDebt > 0) {
      records.push({
        se_name: se.se_name,
        zone: se.teamZone,
        debt_amount: allocatedDebt,
        week_date: weekDate,
      });
      return;
    }

    if (se.teamZone === 'All Corporate') {
      skipped.push(`${se.se_name} (no matching debt)`);
      return;
    }

    if (!se.regionTokens || se.regionTokens.length === 0) {
      skipped.push(`${se.se_name} (no region)`);
      return;
    }

    skipped.push(`${se.se_name} (no matching debt)`);
  });

  return { records, skipped };
}
