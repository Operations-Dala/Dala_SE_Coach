import { NextResponse } from 'next/server';

export const ADMIN_SESSION_COOKIE = 'secoach_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;
const DEFAULT_ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const DEFAULT_ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const adminLoginFailures = new Map();

export function isAdminLockEnabled() {
  return process.env.ADMIN_LOCK_ENABLED === 'true';
}

export function getAdminUsername() {
  return process.env.ADMIN_USERNAME || 'Admin';
}

export function hasAdminConfig() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

export function shouldEnforceAdminApiAuth() {
  return isAdminLockEnabled() || hasAdminConfig();
}

export function getAdminLoginMaxAttempts() {
  const parsed = Number.parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_ADMIN_LOGIN_MAX_ATTEMPTS;
}

export function getAdminLoginWindowMs() {
  const parsed = Number.parseInt(process.env.ADMIN_LOGIN_WINDOW_MS || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_ADMIN_LOGIN_WINDOW_MS;
}

export async function createAdminSessionToken() {
  if (!hasAdminConfig()) return null;
  return sha256Hex(`${process.env.ADMIN_SESSION_SECRET}:${getAdminUsername()}:${process.env.ADMIN_PASSWORD}`);
}

export async function isValidAdminSession(token) {
  if (!token) return false;
  const expected = await createAdminSessionToken();
  return Boolean(expected && token === expected);
}

export function getAdminUnauthorizedMessage() {
  return hasAdminConfig()
    ? 'Admin authentication required.'
    : 'Admin authentication is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.';
}

export async function requireAdminApiSession(request) {
  const sameOriginResponse = requireSameOrigin(request);
  if (sameOriginResponse) {
    return sameOriginResponse;
  }

  if (!shouldEnforceAdminApiAuth()) {
    return null;
  }

  const sessionToken = request?.cookies?.get?.(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = await isValidAdminSession(sessionToken);
  if (authenticated) {
    return null;
  }

  return NextResponse.json({ error: getAdminUnauthorizedMessage() }, { status: 401 });
}

export function requireSameOrigin(request) {
  if (!isMutatingMethod(request)) {
    return null;
  }

  const requestOrigin = request?.headers?.get?.('origin');
  const expectedOrigin = getRequestOrigin(request);

  if (!requestOrigin || !expectedOrigin || requestOrigin !== expectedOrigin) {
    return NextResponse.json(
      { error: 'Cross-site request blocked. Send the request from the same origin as the app.' },
      { status: 403 }
    );
  }

  return null;
}

export function getAdminLoginRateLimitState(request) {
  const now = Date.now();
  const key = getAdminLoginRateLimitKey(request);
  const recentFailures = getRecentAdminLoginFailures(key, now);
  const maxAttempts = getAdminLoginMaxAttempts();

  if (recentFailures.length < maxAttempts) {
    return {
      limited: false,
      remaining: maxAttempts - recentFailures.length,
      retryAfterSeconds: 0,
    };
  }

  const retryAfterMs = Math.max(recentFailures[0] + getAdminLoginWindowMs() - now, 0);
  return {
    limited: true,
    remaining: 0,
    retryAfterSeconds: Math.max(Math.ceil(retryAfterMs / 1000), 1),
  };
}

export function recordAdminLoginFailure(request) {
  const now = Date.now();
  const key = getAdminLoginRateLimitKey(request);
  const recentFailures = getRecentAdminLoginFailures(key, now);
  recentFailures.push(now);
  adminLoginFailures.set(key, recentFailures);
  return getAdminLoginRateLimitState(request);
}

export function clearAdminLoginFailures(request) {
  adminLoginFailures.delete(getAdminLoginRateLimitKey(request));
}

export function buildAdminRateLimitResponse(rateLimitState) {
  const response = NextResponse.json(
    {
      error: 'Too many login attempts. Please wait before trying again.',
    },
    { status: 429 }
  );
  response.headers.set('Retry-After', String(rateLimitState.retryAfterSeconds));
  return response;
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  };
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function isMutatingMethod(request) {
  return MUTATING_METHODS.has(String(request?.method || '').toUpperCase());
}

function getRequestOrigin(request) {
  // On Railway (and other proxied hosts) request.url is the internal container
  // URL (e.g. http://localhost:3000) while the browser sends the public origin.
  // Use forwarded headers first so the comparison works in production.
  const proto = request?.headers?.get?.('x-forwarded-proto')?.split(',')[0]?.trim();
  const host  = request?.headers?.get?.('x-forwarded-host')?.split(',')[0]?.trim()
             || request?.headers?.get?.('host');
  if (proto && host) {
    return `${proto}://${host}`;
  }
  try {
    return new URL(request?.url || '').origin;
  } catch {
    return null;
  }
}

function getAdminLoginRateLimitKey(request) {
  const forwardedFor = request?.headers?.get?.('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || request?.headers?.get?.('x-real-ip')?.trim();
  if (ip) {
    return `ip:${ip}`;
  }

  const userAgent = request?.headers?.get?.('user-agent')?.trim();
  return `ua:${userAgent || 'unknown'}`;
}

function getRecentAdminLoginFailures(key, now) {
  const windowMs = getAdminLoginWindowMs();
  const recentFailures = (adminLoginFailures.get(key) || []).filter(timestamp => now - timestamp < windowMs);

  if (recentFailures.length > 0) {
    adminLoginFailures.set(key, recentFailures);
  } else {
    adminLoginFailures.delete(key);
  }

  return recentFailures;
}

export function resetAdminAuthStateForTests() {
  adminLoginFailures.clear();
}
