import { describe, expect, it } from 'vitest';

import { buildBrandCoverage, resolveCanonicalBrand } from '../../lib/data-engine.js';

describe('resolveCanonicalBrand', () => {
  it('maps known aliases and fuzzy product names back to active partner names', () => {
    expect(resolveCanonicalBrand('BisQuate', ['B-boon', 'Kitchen Smith'])).toBe('B-boon');
    expect(resolveCanonicalBrand('BP BisQuate', ['B-boon', 'Kitchen Smith'])).toBe('B-boon');
    expect(resolveCanonicalBrand('BP Felon Innovation Ltd', ['Felon', 'Kitchen Smith'])).toBe('Felon');
    expect(resolveCanonicalBrand('Kitchen Smith International Foods Ltd', ['Kitchen Smith'])).toBe('Kitchen Smith');
  });

  it('preserves unmatched ordered brands instead of dropping them', () => {
    expect(resolveCanonicalBrand('Hidden Partner Ltd', ['Kitchen Smith'])).toBe('Hidden Partner Ltd');
  });
});

describe('buildBrandCoverage', () => {
  it('keeps unmatched ordered brands visible in brand coverage while still marking active brands', () => {
    const productData = new Map([
      ['Adeola Ganiyu', {
        brandRows: [
          { brand: 'BisQuate', value: 1200 },
          { brand: 'Kitchen Smith International Foods Ltd', value: 3400 },
          { brand: 'Hidden Partner Ltd', value: 2100 },
        ],
      }],
    ]);

    const coverage = buildBrandCoverage(productData, ['B-boon', 'Kitchen Smith']);
    const row = coverage.get('Adeola Ganiyu');

    expect(row).toMatchObject({
      'B-boon': true,
      'Kitchen Smith': true,
      'Hidden Partner Ltd': true,
    });
  });
});
