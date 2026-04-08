import { NextResponse } from 'next/server';

import { ADMIN_SESSION_COOKIE, requireSameOrigin } from '@/lib/admin-auth';

export async function POST(request) {
  const sameOriginResponse = requireSameOrigin(request);
  if (sameOriginResponse) {
    return sameOriginResponse;
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
