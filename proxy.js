import { NextResponse } from 'next/server';

import {
  ADMIN_SESSION_COOKIE,
  hasAdminConfig,
  shouldEnforceAdminApiAuth,
  isValidAdminSession,
} from '@/lib/admin-auth';

const PUBLIC_PATHS = new Set(['/login']);
const PUBLIC_API_PATHS = new Set(['/api/admin/login', '/api/admin/logout']);

export async function proxy(request) {
  const { pathname, search } = request.nextUrl;

  if (!shouldEnforceAdminApiAuth()) {
    return NextResponse.next();
  }

  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = await isValidAdminSession(sessionToken);

  if (PUBLIC_PATHS.has(pathname)) {
    if (authenticated) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (authenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        error: hasAdminConfig()
          ? 'Admin authentication required.'
          : 'Admin authentication is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.',
      },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/login', request.url);
  const nextPath = `${pathname}${search || ''}`;
  if (nextPath && nextPath !== '/login') {
    loginUrl.searchParams.set('next', nextPath);
  }
  if (!hasAdminConfig()) {
    loginUrl.searchParams.set('setup', '1');
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

function isPublicAsset(pathname) {
  return pathname.startsWith('/_next/') || /\.[^/]+$/.test(pathname);
}
