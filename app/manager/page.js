'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ManagerPage() {
  const [flags, setFlags] = useState(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    fetch('/api/manager/flags')
      .then(r => r.json())
      .then(data => {
        setFlags(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(refresh, []);

  const expenseFlags = flags?.expense_flags || [];
  const inflowFlags = flags?.inflow_flags || [];
  const inactiveSEs = flags?.inactive_ses || [];
  const financialRows = flags?.financial_rows || [];
  const financialRange = flags?.financial_range || null;
  const totalFlags = expenseFlags.length + inflowFlags.length + inactiveSEs.length;
  const currency = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Manager View</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Direct follow-up flags plus a recent inflow and expense tracker for each SE.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{totalFlags}</span> flag{totalFlags !== 1 ? 's' : ''}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link
            href="/alerts"
            className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-800 transition-colors"
          >
            View All Alerts
          </Link>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading manager view...</p>}

      {!loading && financialRows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Financial Tracking</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Date, SE name, inflow, and expenses from uploaded records
                {financialRange ? ` (${financialRange.start} to ${financialRange.end})` : ''}.
              </p>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-semibold">
              {financialRows.length} row{financialRows.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">SE Name</th>
                    <th className="px-4 py-3 font-semibold text-right">Inflow</th>
                    <th className="px-4 py-3 font-semibold text-right">Expenses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {financialRows.map(row => (
                    <tr key={`${row.record_date}-${row.se_name}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.record_date}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/se/${encodeURIComponent(row.se_name)}`}
                          className="font-medium text-slate-900 hover:text-slate-700 transition-colors"
                        >
                          {row.se_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700 whitespace-nowrap">
                        {row.inflow > 0 ? `N${currency.format(row.inflow)}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-orange-700 whitespace-nowrap">
                        {row.expenses > 0 ? `N${currency.format(row.expenses)}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {!loading && totalFlags === 0 && financialRows.length === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-lg bg-white">
          <p className="text-slate-600 font-medium mb-1">No manager data yet</p>
          <p className="text-slate-400 text-xs">Upload inflow or expense records to start monitoring this table.</p>
        </div>
      )}

      {!loading && expenseFlags.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-orange-600">Expense Flags</h2>
            <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded font-semibold">
              {expenseFlags.length}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {expenseFlags.map((se, i) => (
              <div key={`${se.se_name}-${i}`} className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-slate-900">{se.se_name}</span>
                    {se.zone && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{se.zone}</span>}
                    <span className="text-[10px] text-slate-400">{se.position?.replace(/_/g, ' ')}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      se.reason === 'over_budget' || se.reason === 'daily_limit'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-orange-50 border-orange-200 text-orange-700'
                    }`}>
                      {se.reason === 'over_budget'
                        ? 'Over Budget'
                        : se.reason === 'daily_limit'
                          ? 'Daily Limit Exceeded'
                          : 'Expense Spike'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{se.detail}</p>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
                    <span>This week: <strong className="text-slate-700">N{currency.format(se.weekly_total)}</strong></span>
                    <span>Budget: <strong className="text-slate-700">N{currency.format(se.budget)}</strong></span>
                    {se.weekly_total > se.budget && (
                      <span className="text-red-500 font-semibold">
                        +N{currency.format(se.weekly_total - se.budget)} over
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/se/${encodeURIComponent(se.se_name)}`}
                  className="text-xs border border-slate-200 hover:border-slate-300 text-slate-700 px-3 py-1.5 rounded transition-colors flex-shrink-0"
                >
                  View SE
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && inflowFlags.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-amber-600">Inflow Gaps - Senior and Corporate SE</h2>
            <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded font-semibold">
              {inflowFlags.length}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {inflowFlags.map(se => (
              <div key={se.se_name} className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-slate-900">{se.se_name}</span>
                    {se.zone && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{se.zone}</span>}
                    <span className="text-[10px] text-slate-400">{se.position?.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-amber-50 border-amber-200 text-amber-700">
                      {se.days_zero}d No Inflow
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{se.detail}. Collections must be prioritised today.</p>
                </div>
                <Link
                  href={`/se/${encodeURIComponent(se.se_name)}`}
                  className="text-xs border border-slate-200 hover:border-slate-300 text-slate-700 px-3 py-1.5 rounded transition-colors flex-shrink-0"
                >
                  View SE
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && inactiveSEs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">Inactive SEs</h2>
            <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded font-semibold">
              {inactiveSEs.length}
            </span>
          </div>
          <p className="text-[10px] text-slate-400">
            No data uploaded or zero stores visited for 2+ consecutive days. Analytics are paused and reactivates automatically when activity resumes.
          </p>
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {inactiveSEs.map(se => (
              <div key={se.se_name} className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-slate-900">{se.se_name}</span>
                    {se.zone && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{se.zone}</span>}
                    <span className="text-[10px] text-slate-400">{se.position?.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-100 border-slate-300 text-slate-600">
                      Inactive {se.days_inactive}d
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {se.detail}
                    {se.last_active_date ? ` - last active ${se.last_active_date}` : ''}. Follow up before next upload.
                  </p>
                </div>
                <Link
                  href={`/se/${encodeURIComponent(se.se_name)}`}
                  className="text-xs border border-slate-200 hover:border-slate-300 text-slate-700 px-3 py-1.5 rounded transition-colors flex-shrink-0"
                >
                  View SE
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
