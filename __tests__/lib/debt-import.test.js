import { describe, expect, it } from 'vitest';

import {
  allocateRegionMatchedDebt,
  normaliseDebtRegion,
  tokenMatchesRegionKey,
} from '../../lib/debt-import.js';

describe('normaliseDebtRegion', () => {
  it('normalises debt sheet region labels', () => {
    expect(normaliseDebtRegion('Reg 6A')).toBe('6a');
    expect(normaliseDebtRegion('bp')).toBeNull();
  });
});

describe('tokenMatchesRegionKey', () => {
  it('matches broad parent regions to sub-regions', () => {
    expect(tokenMatchesRegionKey('1', '1a')).toBe(true);
    expect(tokenMatchesRegionKey('1a', '1')).toBe(false);
  });
});

describe('allocateRegionMatchedDebt', () => {
  it('splits overlapping debt between a senior and junior instead of duplicating it', () => {
    const { records } = allocateRegionMatchedDebt({
      rosterRows: [
        { se_name: 'Senior', zone: 'Zone 1', region: '1,5' },
        { se_name: 'Junior', zone: 'Zone 1', region: '1A,1B' },
      ],
      debtByRegionAndZone: {
        '1a': { 'Z1.RTL': 100 },
        '1b': { 'Z1.RTL': 50 },
        '5': { 'Z1.RTL': 40 },
      },
      weekDate: '2026-03-09',
    });

    expect(records).toEqual([
      { se_name: 'Senior', zone: 'Zone 1', debt_amount: 115, week_date: '2026-03-09' },
      { se_name: 'Junior', zone: 'Zone 1', debt_amount: 75, week_date: '2026-03-09' },
    ]);
  });

  it('splits shared zone debt equally when two SEs own the same region', () => {
    const { records } = allocateRegionMatchedDebt({
      rosterRows: [
        { se_name: 'Omodolapo Alumona', zone: 'Zone 3', region: '6,12' },
        { se_name: 'Okonofua Amina', zone: 'Zone 3', region: '6,12' },
      ],
      debtByRegionAndZone: {
        '6': { 'Z3.RTL': 100 },
        '12': { 'Z3.RTL': 300 },
      },
      weekDate: '2026-03-09',
    });

    expect(records).toEqual([
      { se_name: 'Omodolapo Alumona', zone: 'Zone 3', debt_amount: 200, week_date: '2026-03-09' },
      { se_name: 'Okonofua Amina', zone: 'Zone 3', debt_amount: 200, week_date: '2026-03-09' },
    ]);
  });

  it('splits corporate debt across multiple corporate SEs', () => {
    const { records } = allocateRegionMatchedDebt({
      rosterRows: [
        { se_name: 'Corp A', zone: 'All Corporate', region: 'All Corporate' },
        { se_name: 'Corp B', zone: 'All Corporate', region: 'All Corporate' },
      ],
      debtByRegionAndZone: {},
      totalCorpDebt: 101,
      weekDate: '2026-03-09',
    });

    expect(records).toEqual([
      { se_name: 'Corp A', zone: 'All Corporate', debt_amount: 50.5, week_date: '2026-03-09' },
      { se_name: 'Corp B', zone: 'All Corporate', debt_amount: 50.5, week_date: '2026-03-09' },
    ]);
  });
});
