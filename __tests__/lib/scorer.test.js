import { describe, it, expect } from 'vitest';
import { scoreMetrics, assignRanks } from '../../lib/scorer.js';

// Default config matching DB defaults
const DEFAULT_CONFIG = {
  score_time:            '5',
  score_visits:          '10',
  score_brands:          '40',
  score_efficiency:      '15',
  min_store_target:      '8',
  advanced_store_target: '10',
  surveys_target:        '15',
};

const TOTAL_BRANDS = 10;

// ─── scoreMetrics ────────────────────────────────────────────────────────────

describe('scoreMetrics — time score', () => {
  it('awards full points for check-in at or before 08:50', () => {
    const r = scoreMetrics({ resumption_time: '08:50', stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.time_score).toBe(5);
  });

  it('awards full points for check-in well before 08:50', () => {
    const r = scoreMetrics({ resumption_time: '07:30', stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.time_score).toBe(5);
  });

  it('awards partial points (3) for check-in between 08:51 and 09:00', () => {
    const r = scoreMetrics({ resumption_time: '09:00', stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.time_score).toBe(3);
  });

  it('awards zero points for check-in after 09:00', () => {
    const r = scoreMetrics({ resumption_time: '09:01', stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.time_score).toBe(0);
  });

  it('awards zero for a late afternoon check-in', () => {
    const r = scoreMetrics({ resumption_time: '14:00', stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.time_score).toBe(0);
  });

  it('awards zero when resumption_time is missing', () => {
    const r = scoreMetrics({ stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.time_score).toBe(0);
  });
});

describe('scoreMetrics — visit score', () => {
  it('awards full points at or above the advanced target (10 stores)', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 10, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.visit_score).toBe(10);
  });

  it('awards full points for stores above the advanced target', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 15, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.visit_score).toBe(10);
  });

  it('awards proportional points between min (8) and advanced (10) targets', () => {
    // At exactly min_store_target (8) → 50% of max = 5
    const r = scoreMetrics({ resumption_time: null, stores_visited: 8, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.visit_score).toBe(5);
  });

  it('awards zero for zero stores', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.visit_score).toBe(0);
  });

  it('score increases as stores increase from min to advanced', () => {
    const at8  = scoreMetrics({ resumption_time: null, stores_visited: 8,  brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30).visit_score;
    const at9  = scoreMetrics({ resumption_time: null, stores_visited: 9,  brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30).visit_score;
    const at10 = scoreMetrics({ resumption_time: null, stores_visited: 10, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30).visit_score;
    expect(at9).toBeGreaterThan(at8);
    expect(at10).toBeGreaterThan(at9);
  });
});

describe('scoreMetrics — brand score', () => {
  it('awards full points when all brands are covered', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 10, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.brand_score).toBe(40);
  });

  it('awards proportional points for partial brand coverage', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 5, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.brand_score).toBe(20);
  });

  it('awards zero for no brands covered', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.brand_score).toBe(0);
  });

  it('awards zero when totalActiveBrands is zero (avoids division by zero)', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 5, complete_report: 0 }, DEFAULT_CONFIG, 0, 30);
    expect(r.brand_score).toBe(0);
  });
});

describe('scoreMetrics — efficiency score', () => {
  it('awards full points when complete_report equals surveys_target', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 0, complete_report: 15 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.efficiency_score).toBe(15);
  });

  it('caps at max even if reports exceed target', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 0, complete_report: 30 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.efficiency_score).toBe(15);
  });

  it('awards proportional points below target', () => {
    // 7.5 surveys / 15 target = 50% of 15 = 7.5
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 0, complete_report: 7.5 }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.efficiency_score).toBeCloseTo(7.5);
  });
});

describe('scoreMetrics — debt score', () => {
  it('uses the passed-in debt score directly', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 25);
    expect(r.debt_score).toBe(25);
  });

  it('defaults to 30 when not provided', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS);
    expect(r.debt_score).toBe(30);
  });

  it('clamps negative debt score to 0', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, -5);
    expect(r.debt_score).toBe(0);
  });

  it('clamps debt score above 30 to 30', () => {
    const r = scoreMetrics({ resumption_time: null, stores_visited: 0, brands_ordered: 0, complete_report: 0 }, DEFAULT_CONFIG, TOTAL_BRANDS, 50);
    expect(r.debt_score).toBe(30);
  });
});

describe('scoreMetrics — total score', () => {
  it('a perfect SE scores 100', () => {
    const r = scoreMetrics({
      resumption_time: '08:00',
      stores_visited:  10,
      brands_ordered:  10,
      complete_report: 15,
    }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.total_score).toBe(100);
  });

  it('a zero-activity SE with full debt scores 30', () => {
    const r = scoreMetrics({
      resumption_time: null,
      stores_visited:  0,
      brands_ordered:  0,
      complete_report: 0,
    }, DEFAULT_CONFIG, TOTAL_BRANDS, 30);
    expect(r.total_score).toBe(30);
  });

  it('total is the sum of all five components', () => {
    const r = scoreMetrics({
      resumption_time: '08:50',
      stores_visited:  8,
      brands_ordered:  5,
      complete_report: 7,
    }, DEFAULT_CONFIG, TOTAL_BRANDS, 20);
    const expected = r.time_score + r.visit_score + r.brand_score + r.efficiency_score + r.debt_score;
    expect(r.total_score).toBeCloseTo(expected);
  });
});

// ─── assignRanks ─────────────────────────────────────────────────────────────

describe('assignRanks', () => {
  it('ranks full-status SEs by total_score descending', () => {
    const rows = [
      { se_name: 'Alice', total_score: 70, status: 'full' },
      { se_name: 'Bob',   total_score: 90, status: 'full' },
      { se_name: 'Carol', total_score: 80, status: 'full' },
    ];
    assignRanks(rows);
    const bob   = rows.find(r => r.se_name === 'Bob');
    const carol = rows.find(r => r.se_name === 'Carol');
    const alice = rows.find(r => r.se_name === 'Alice');
    expect(bob.rank).toBe(1);
    expect(carol.rank).toBe(2);
    expect(alice.rank).toBe(3);
  });

  it('ranks trial SEs separately (starting from #1)', () => {
    const rows = [
      { se_name: 'Trial A', total_score: 60, status: 'trial' },
      { se_name: 'Full A',  total_score: 85, status: 'full'  },
      { se_name: 'Trial B', total_score: 75, status: 'trial' },
    ];
    assignRanks(rows);
    const trialB = rows.find(r => r.se_name === 'Trial B');
    const trialA = rows.find(r => r.se_name === 'Trial A');
    expect(trialB.rank).toBe(1);
    expect(trialA.rank).toBe(2);
    // Full SE gets rank 1 in its own group
    expect(rows.find(r => r.se_name === 'Full A').rank).toBe(1);
  });

  it('tags full SEs with rank_group "full"', () => {
    const rows = [{ se_name: 'X', total_score: 50, status: 'full' }];
    assignRanks(rows);
    expect(rows[0].rank_group).toBe('full');
  });

  it('tags trial SEs with rank_group "trial"', () => {
    const rows = [{ se_name: 'Y', total_score: 50, status: 'trial' }];
    assignRanks(rows);
    expect(rows[0].rank_group).toBe('trial');
  });

  it('handles an empty array without throwing', () => {
    expect(() => assignRanks([])).not.toThrow();
  });
});
