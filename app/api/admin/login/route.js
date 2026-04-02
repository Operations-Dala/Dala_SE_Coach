import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import {
  ADMIN_SESSION_COOKIE,
  buildAdminRateLimitResponse,
  clearAdminLoginFailures,
  createAdminSessionToken,
  getAdminLoginRateLimitState,
  getAdminCookieOptions,
  getAdminUsername,
  hasAdminConfig,
  recordAdminLoginFailure,
  requireSameOrigin,
} from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function POST(request) {
  const sameOriginResponse = requireSameOrigin(request);
  if (sameOriginResponse) {
    return sameOriginResponse;
  }

  if (!hasAdminConfig()) {
    return NextResponse.json(
      { error: 'Admin authentication is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.' },
      { status: 500 }
    );
  }

  const rateLimitState = getAdminLoginRateLimitState(request);
  if (rateLimitState.limited) {
    return buildAdminRateLimitResponse(rateLimitState);
  }

  const body = await request.json();
  const submittedUsername = typeof body?.username === 'string' ? body.username : '';
  const submittedPassword = typeof body?.password === 'string' ? body.password : '';
  const expectedUsername = getAdminUsername();

  if (
    !constantTimeEqual(submittedUsername, expectedUsername) ||
    !constantTimeEqual(submittedPassword, process.env.ADMIN_PASSWORD)
  ) {
    recordAdminLoginFailure(request);
    return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  }

  clearAdminLoginFailures(request);
  const sessionToken = await createAdminSessionToken();
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, getAdminCookieOptions());
  return response;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
