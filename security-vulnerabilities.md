# Security Vulnerability Report — SE Coach

**Date:** 2026-04-08
**Reviewer:** Claude (senior security engineer persona)
**Branch:** master
**Scope:** Full codebase filesystem scan (untracked & committed files)

---

## Summary

| # | File | Severity | Category | Confidence |
|---|------|----------|----------|------------|
| 1 | `app/api/manager/flags/route.js` | HIGH | Authorization Bypass | 9/10 |
| 2 | `app/api/alerts/dormant-brands/route.js` | HIGH | Authorization Bypass | 8.5/10 |
| 3 | `app/api/analytics/expenses/route.js` | HIGH | Authorization Bypass | 9/10 |
| 3 | `app/api/analytics/inflow/route.js` | HIGH | Authorization Bypass | 9/10 |

**Root Cause:** The `admin-auth.js` session system exists but is only applied to `/api/admin/login` and `/api/admin/logout`. No Next.js middleware file (`middleware.ts`/`middleware.js`) exists at the project root to globally protect `/api/*` routes. All other API routes are fully unauthenticated.

---

## Vuln 1: Missing Authentication — Manager Flags Endpoint

**File:** `app/api/manager/flags/route.js`
**Severity:** HIGH
**Category:** `authorization_bypass`

**Description:**
The GET endpoint `/api/manager/flags` returns sensitive employee PII and financial metrics — SE names, zones, positions, 30-day expense tracking, inflow gaps, and inactivity flags — with zero authentication or session validation. No Next.js middleware exists at the project root, and the `admin-auth.js` helper is only applied to the login/logout routes. The Supabase client uses the `service_role` key with no RLS policies configured, so the database returns unrestricted results to any caller.

**Exploit Scenario:**
Any unauthenticated attacker sends:
```
GET /api/manager/flags HTTP/1.1
Host: [your-domain]
```
And immediately receives a full roster of employees with their financial performance data — no credentials, tokens, or special access required.

**Recommendation:**
Add session validation at the top of the handler using the existing `isValidAdminSession` / `ADMIN_SESSION_COOKIE` helpers from `lib/admin-auth.js`. Return `401 Unauthorized` before any database queries execute.

```javascript
import { isValidAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';

export async function GET(request) {
  const cookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!await isValidAdminSession(cookie)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of handler
}
```

---

## Vuln 2: Missing Authentication — Dormant Brands Endpoint

**File:** `app/api/alerts/dormant-brands/route.js`
**Severity:** HIGH
**Category:** `authorization_bypass`

**Description:**
The GET endpoint `/api/alerts/dormant-brands` exposes brand performance intelligence — which brands have zero orders, severity levels, and last-ordered dates — to unauthenticated requests. No middleware or route-level auth check exists. The Supabase client uses the `service_role` key with no RLS policies, so the database returns unrestricted results.

**Exploit Scenario:**
```bash
curl https://[domain]/api/alerts/dormant-brands
```
Returns a real-time inventory gap report — actionable competitive intelligence — to any external caller with no authentication required.

**Recommendation:**
Apply `isValidAdminSession` check before the Supabase query (same pattern as Vuln 1). Also:
- Enable `ADMIN_LOCK_ENABLED=true` in production
- Add Next.js middleware protecting all `/api/*` routes to prevent future routes from having the same issue

---

## Vuln 3: Missing Authentication — Analytics Endpoints

**Files:**
- `app/api/analytics/expenses/route.js`
- `app/api/analytics/inflow/route.js`

**Severity:** HIGH
**Category:** `authorization_bypass`

**Description:**
Both analytics endpoints expose individual employee financial data to unauthenticated HTTP GET requests:

- `/api/analytics/expenses` — returns per-SE weekly spending by employee name, budget vs. actual, and budget thresholds by position
- `/api/analytics/inflow` — returns which named employees had zero revenue collection and on which specific dates, along with full roster details (names, positions, zones)

Neither route imports nor calls any auth helper. The Supabase `service_role` key bypasses all RLS.

**Exploit Scenario:**
```
GET /api/analytics/expenses?days=7   → Full SE spending breakdown by name
GET /api/analytics/inflow?days=7     → Which employees collected zero revenue and when
```
Both requests require no credentials.

**Recommendation:**
Add `isValidAdminSession` validation to both handlers. Consider a shared auth middleware wrapper for all analytics routes:

```javascript
// middleware.js (project root — create this file)
import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/') &&
      !pathname.startsWith('/api/admin/login') &&
      !pathname.startsWith('/api/admin/logout')) {
    const cookie = request.cookies.get('admin_session')?.value;
    if (!cookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

---

## Remediation Priority

| Priority | Action |
|----------|--------|
| **Immediate** | Add `isValidAdminSession` check to all 4 endpoints above |
| **Short-term** | Create `middleware.js` at project root to protect all `/api/*` routes globally |
| **Short-term** | Set `ADMIN_LOCK_ENABLED=true` in production environment |
| **Medium-term** | Enable RLS on Supabase tables and restrict the service role key usage |
| **Medium-term** | Audit all remaining API routes for the same pattern |
