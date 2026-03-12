'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginForm({ nextPath = '/', setupRequired = false }) {
  const router = useRouter();
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || 'Login failed.');
        return;
      }

      router.replace(sanitizeNextPath(nextPath));
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Admin Access</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">SE Coach</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Enter the admin username and password to access the dashboard and protected API routes.
        </p>
      </div>

      {setupRequired && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` before using the app.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="block">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Username
        </span>
        <input
          type="text"
          value={username}
          onChange={event => setUsername(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
          autoFocus
          required
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Password
        </span>
        <input
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
          required
        />
      </label>

      <button
        type="submit"
        disabled={pending || setupRequired}
        className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}

function sanitizeNextPath(nextPath) {
  return typeof nextPath === 'string' && nextPath.startsWith('/') ? nextPath : '/';
}
