import { beforeEach, describe, expect, it } from 'vitest';

import { POST as login } from '@/app/api/admin/login/route.js';
import { POST as logout } from '@/app/api/admin/logout/route.js';
import { resetAdminAuthStateForTests } from '@/lib/admin-auth';

function createHeaders(headers = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    get(name) {
      return normalized.get(String(name).toLowerCase());
    },
  };
}

function createJsonRequest({
  url = 'https://example.com/api/admin/login',
  method = 'POST',
  headers = {
    origin: 'https://example.com',
    'x-forwarded-for': '198.51.100.10',
  },
  body = {},
} = {}) {
  return {
    url,
    method,
    headers: createHeaders(headers),
    async json() {
      return body;
    },
  };
}

describe('admin login route hardening', () => {
  beforeEach(() => {
    process.env.ADMIN_USERNAME = 'Admin';
    process.env.ADMIN_PASSWORD = 'secret-pass';
    process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
    process.env.ADMIN_LOGIN_MAX_ATTEMPTS = '2';
    process.env.ADMIN_LOGIN_WINDOW_MS = '60000';
    resetAdminAuthStateForTests();
  });

  it('blocks cross-site login attempts', async () => {
    const response = await login(
      createJsonRequest({
        headers: {
          origin: 'https://evil.example',
          'x-forwarded-for': '198.51.100.11',
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Cross-site request blocked. Send the request from the same origin as the app.',
    });
  });

  it('rate limits repeated failed login attempts', async () => {
    const failedRequest = () =>
      createJsonRequest({
        headers: {
          origin: 'https://example.com',
          'x-forwarded-for': '198.51.100.12',
        },
        body: {
          username: 'Admin',
          password: 'wrong-pass',
        },
      });

    expect((await login(failedRequest())).status).toBe(401);
    expect((await login(failedRequest())).status).toBe(401);

    const limitedResponse = await login(failedRequest());

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get('Retry-After')).toBeTruthy();
    await expect(limitedResponse.json()).resolves.toEqual({
      error: 'Too many login attempts. Please wait before trying again.',
    });
  });

  it('allows valid same-origin login and sets the session cookie', async () => {
    const response = await login(
      createJsonRequest({
        headers: {
          origin: 'https://example.com',
          'x-forwarded-for': '198.51.100.13',
        },
        body: {
          username: 'Admin',
          password: 'secret-pass',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(response.headers.get('set-cookie')).toContain('secoach_admin_session=');
  });

  it('blocks cross-site logout attempts', async () => {
    const response = await logout(
      createJsonRequest({
        url: 'https://example.com/api/admin/logout',
        headers: {
          origin: 'https://evil.example',
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Cross-site request blocked. Send the request from the same origin as the app.',
    });
  });
});
