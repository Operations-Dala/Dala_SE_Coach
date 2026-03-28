'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const NAV = [
  {
    section: 'MAIN',
    items: [
      { label: 'Home',          href: '/',         icon: IconHome },
      { label: 'Import Data',   href: '/import',    icon: IconUpload },
    ],
  },
  {
    section: 'INTELLIGENCE',
    items: [
      { label: 'SE Analytics',   href: '/se-analytics',       icon: IconChart },
      { label: 'Field Intel',    href: '/field-intelligence', icon: IconFieldIntel },
      { label: 'Coach',          href: '/coach',              icon: IconCoach },
    ],
  },
  {
    section: 'ANALYTICS',
    items: [
      { label: 'History',       href: '/history',   icon: IconHistory },
      { label: 'Alerts',        href: '/alerts',    icon: IconBell },
      { label: 'Manager View',  href: '/manager',   icon: IconManager },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Settings',      href: '/settings',  icon: IconSettings },
      { label: 'How It Works',  href: '/how-it-works', icon: IconInfo },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState(null);
  const [pending, startTransition] = useTransition();

  if (pathname === '/login') return null;

  function handleLogout() {
    setLogoutError(null);
    startTransition(async () => {
      const response = await fetch('/api/admin/logout', { method: 'POST' });
      if (!response.ok) {
        setLogoutError('Logout failed.');
        return;
      }
      router.replace('/login');
      router.refresh();
    });
  }

  return (
    <aside className="w-[220px] min-h-screen bg-[#07111e] border-r border-slate-800/80 flex flex-col flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
      {/* Branding */}
      <div className="px-5 pt-6 pb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="bg-red-600 text-white font-black text-sm px-2 py-0.5 rounded tracking-tight">SE</span>
          <span className="text-white font-bold text-lg tracking-tight">COACH</span>
          <span className="text-red-500 font-black text-xl leading-none mb-0.5">.</span>
        </div>
        <p className="text-slate-600 text-[10px] uppercase tracking-[0.15em] mt-1.5">Performance Portal</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-6">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-[0.12em] px-3 mb-1.5">
              {section}
            </p>
            <div className="space-y-0.5">
              {items.map(({ label, href, icon: Icon, soon }) => {
                const isActive = pathname === href;
                const cls = [
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left',
                  isActive
                    ? 'bg-red-600/15 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                  soon ? 'opacity-40 cursor-not-allowed pointer-events-none' : '',
                ].join(' ');

                return (
                  <Link key={label} href={soon ? '#' : href} className={cls}>
                    <Icon />
                    <span>{label}</span>
                    {soon && (
                      <span className="ml-auto text-[9px] text-slate-600 uppercase tracking-wide">Soon</span>
                    )}
                    {isActive && !soon && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-800/80">
        <button
          onClick={handleLogout}
          disabled={pending}
          className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-60"
        >
          {pending ? 'Signing Out...' : 'Sign Out'}
        </button>
        {logoutError && (
          <p className="mt-2 text-[10px] text-red-400">{logoutError}</p>
        )}
        <p className="text-slate-700 text-[10px]">SE Coach &copy; 2026</p>
      </div>
    </aside>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */

function IconHome() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  );
}
function IconHistory() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IconFieldIntel() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}
function IconCoach() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-1-3z" />
    </svg>
  );
}
function IconManager() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
