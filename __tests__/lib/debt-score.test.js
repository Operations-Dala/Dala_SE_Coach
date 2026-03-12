import { describe, expect, it } from 'vitest';

import {
  buildZoneDebtTotals,
  calcZoneDebtScore,
  ZONE_DEBT_BASELINE_PCT,
  ZONE_DEBT_MAX_PCT,
} from '../../lib/debt-score.js';

describe('buildZoneDebtTotals', () => {
  it('aggregates debt by zone', () => {
    const totals = buildZoneDebtTotals(
      { Ayo: 100, Bisi: 150, Chika: 50 },
      { Ayo: 'Zone 1', Bisi: 'Zone 1', Chika: 'Zone 2' }
    );

    expect(totals).toEqual({
      'Zone 1': 250,
      'Zone 2': 50,
    });
  });
});

describe('calcZoneDebtScore', () => {
  it('returns full score when there is no debt data', () => {
    expect(calcZoneDebtScore('Ayo', {}, { Ayo: 'Zone 1' })).toBe(30);
  });

  it('returns full score when zone debt is at or below the baseline', () => {
    const score = calcZoneDebtScore(
      'Ayo',
      { Ayo: 100, Bisi: 900 },
      { Ayo: 'Zone 1', Bisi: 'Zone 2' }
    );

    expect(ZONE_DEBT_BASELINE_PCT).toBe(10);
    expect(score).toBe(30);
  });

  it('scales score down between the baseline and max zone debt thresholds', () => {
    const score = calcZoneDebtScore(
      'Ayo',
      { Ayo: 120, Bisi: 80, Chika: 800 },
      { Ayo: 'Zone 1', Bisi: 'Zone 1', Chika: 'Zone 2' }
    );

    expect(score).toBe(10);
  });

  it('returns zero when zone debt reaches the max threshold', () => {
    const score = calcZoneDebtScore(
      'Ayo',
      { Ayo: 200, Bisi: 50, Chika: 550 },
      { Ayo: 'Zone 1', Bisi: 'Zone 1', Chika: 'Zone 2' }
    );

    expect(ZONE_DEBT_MAX_PCT).toBe(25);
    expect(score).toBe(0);
  });

  it('applies the same zone debt score to every SE in that zone', () => {
    const debtBySE = { Ayo: 120, Bisi: 80, Chika: 800 };
    const zoneBySE = { Ayo: 'Zone 1', Bisi: 'Zone 1', Chika: 'Zone 2' };

    expect(calcZoneDebtScore('Ayo', debtBySE, zoneBySE)).toBe(10);
    expect(calcZoneDebtScore('Bisi', debtBySE, zoneBySE)).toBe(10);
  });
});
