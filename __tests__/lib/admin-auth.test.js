import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAdminLoginFailures,
  getAdminLoginRateLimitState,
  recordAdminLoginFailure,
  requireSameOrigin,
  resetAdminAuthStateForTests,
} from '../../lib/admin-auth.js';

function createRequest({
  url = 'https://example.com/api/admin/login',
  method = 'POST',
  headers = {},
} = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    url,
    method,
    headers: {
      get(name) {
        return normalized.get(String(name).toLowerCase());
      },
    },
  };
}

describe('requireSameOrigin', () => {
  it('allows same-origin mutating requests', () => {
    const response = requireSameOrigin(
      createRequest({
        headers: { origin: 'https://example.com' },
      })
    );

    expect(response).toBeNull();
  });

  it('blocks cross-site mutating requests', async () => {
    const response = requireSameOrigin(
      createRequest({
        headers: { origin: 'https://evil.example' },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Cross-site request blocked. Send the request from the same origin as the app.',
    });
  });

  it('ignores non-mutating requests', () => {
    const response = requireSameOrigin(
      createRequest({
        method: 'GET',
      })
    );

    expect(response).toBeNull();
  });
});

describe('admin login rate limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
    process.env.ADMIN_LOGIN_MAX_ATTEMPTS = '2';
    process.env.ADMIN_LOGIN_WINDOW_MS = '60000';
    resetAdminAuthStateForTests();
  });

  it('blocks an IP after repeated failed attempts within the time window', () => {
    const request = createRequest({
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    expect(getAdminLoginRateLimitState(request).limited).toBe(false);

    recordAdminLoginFailure(request);
    expect(getAdminLoginRateLimitState(request).limited).toBe(false);

    recordAdminLoginFailure(request);

    const limitedState = getAdminLoginRateLimitState(request);
    expect(limitedState.limited).toBe(true);
    expect(limitedState.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets the limiter after a successful login', () => {
    const request = createRequest({
      headers: { 'x-forwarded-for': '203.0.113.11' },
    });

    recordAdminLoginFailure(request);
    clearAdminLoginFailures(request);

    expect(getAdminLoginRateLimitState(request)).toMatchObject({
      limited: false,
      remaining: 2,
    });
  });

  it('expires old failures after the configured time window', () => {
    const request = createRequest({
      headers: { 'x-forwarded-for': '203.0.113.12' },
    });

    recordAdminLoginFailure(request);
    recordAdminLoginFailure(request);
    expect(getAdminLoginRateLimitState(request).limited).toBe(true);

    vi.advanceTimersByTime(61000);

    expect(getAdminLoginRateLimitState(request)).toMatchObject({
      limited: false,
      remaining: 2,
    });
  });
});
