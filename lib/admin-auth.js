export const ADMIN_SESSION_COOKIE = 'secoach_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

export function isAdminLockEnabled() {
  return process.env.ADMIN_LOCK_ENABLED === 'true';
}

export function getAdminUsername() {
  return process.env.ADMIN_USERNAME || 'Admin';
}

export function hasAdminConfig() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
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
