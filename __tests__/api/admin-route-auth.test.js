import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAdminApiSessionMock, fromMock } = vi.hoisted(() => ({
  requireAdminApiSessionMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/lib/admin-auth', async () => {
  const actual = await vi.importActual('@/lib/admin-auth');
  return {
    ...actual,
    requireAdminApiSession: requireAdminApiSessionMock,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}));

import { GET as getDormantBrands } from '@/app/api/alerts/dormant-brands/route.js';
import { GET as getDashboardAnalytics } from '@/app/api/analytics/route.js';
import { GET as getExpensesAnalytics } from '@/app/api/analytics/expenses/route.js';
import { GET as getInflowAnalytics } from '@/app/api/analytics/inflow/route.js';
import { GET as getReports } from '@/app/api/reports/route.js';
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route.js';
import { DELETE as deleteBrand } from '@/app/api/settings/brands/[id]/route.js';
import { PATCH as patchRoster } from '@/app/api/settings/roster/[id]/route.js';
import { POST as postTelegram } from '@/app/api/telegram/route.js';
import { GET as getManagerFlags } from '@/app/api/manager/flags/route.js';
import { POST as postFinancialTest, DELETE as deleteFinancialTest } from '@/app/api/test/financial/route.js';

function buildUnauthorizedResponse() {
  return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 });
}

function createRequest(url) {
  return {
    url,
    cookies: {
      get: vi.fn(() => undefined),
    },
  };
}

function createRouteContext(params = {}) {
  return { params: Promise.resolve(params) };
}

describe('sensitive admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminApiSessionMock.mockResolvedValue(buildUnauthorizedResponse());
  });

  it.each([
    ['manager flags', getManagerFlags, 'https://example.com/api/manager/flags'],
    ['dormant brands', getDormantBrands, 'https://example.com/api/alerts/dormant-brands'],
    ['expenses analytics', getExpensesAnalytics, 'https://example.com/api/analytics/expenses?days=7'],
    ['inflow analytics', getInflowAnalytics, 'https://example.com/api/analytics/inflow?days=7'],
    ['dashboard analytics', getDashboardAnalytics, 'https://example.com/api/analytics?date=2026-03-31&days=7'],
    ['reports', getReports, 'https://example.com/api/reports?date=2026-03-31'],
    ['settings get', getSettings, 'https://example.com/api/settings'],
    ['settings put', putSettings, 'https://example.com/api/settings'],
    ['telegram post', postTelegram, 'https://example.com/api/telegram'],
    ['test financial post', postFinancialTest, 'https://example.com/api/test/financial?date=2026-03-31'],
    ['test financial delete', deleteFinancialTest, 'https://example.com/api/test/financial?date=2026-03-31'],
  ])('returns 401 before querying Supabase for %s', async (_name, handler, url) => {
    const response = await handler(createRequest(url));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Admin authentication required.',
    });
    expect(requireAdminApiSessionMock).toHaveBeenCalledTimes(1);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it.each([
    ['delete brand', deleteBrand, 'https://example.com/api/settings/brands/1', createRouteContext({ id: '1' })],
    ['patch roster', patchRoster, 'https://example.com/api/settings/roster/1', createRouteContext({ id: '1' })],
  ])('returns 401 before reading route params or querying Supabase for %s', async (_name, handler, url, context) => {
    const response = await handler(createRequest(url), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Admin authentication required.',
    });
    expect(requireAdminApiSessionMock).toHaveBeenCalledTimes(1);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
