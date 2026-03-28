'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const ALERT_URGENCY_ORDER = {
  intervention: 0,
  corrective: 1,
  coaching: 2,
  developmental: 3,
};

const URGENCY_META = {
  developmental: { label: 'Developmental', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  coaching: { label: 'Coaching', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  corrective: { label: 'Corrective', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  intervention: { label: 'Intervention', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
};

const TREND_META = {
  declining: { label: 'Declining', color: 'text-red-600' },
  volatile: { label: 'Volatile', color: 'text-yellow-600' },
  flat: { label: 'Flat', color: 'text-slate-500' },
  improving: { label: 'Improving', color: 'text-green-600' },
};

export default function AlertsPage() {
  const [summaries,      setSummaries]      = useState([]);
  const [flags,          setFlags]          = useState(null);
  const [dormantBrands,  setDormantBrands]  = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [flagsLoading,   setFlagsLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/coach/summaries')
      .then(r => r.json())
      .then(data => {
        setSummaries(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    Promise.all([
      fetch('/api/manager/flags').then(r => r.json()),
      fetch('/api/alerts/dormant-brands').then(r => r.json()),
    ]).then(([flagData, dormData]) => {
      setFlags(flagData);
      setDormantBrands(Array.isArray(dormData) ? dormData : []);
      setFlagsLoading(false);
    }).catch(() => setFlagsLoading(false));
  }, []);

  const alerts = summaries
    .filter(isAlertSummary)
    .sort((a, b) => {
      const urgencyDiff =
        (ALERT_URGENCY_ORDER[a.urgency_level] ?? 99) -
        (ALERT_URGENCY_ORDER[b.urgency_level] ?? 99);
      if (urgencyDiff !== 0) return urgencyDiff;

      const weightDiff = alertWeight(b) - alertWeight(a);
      if (weightDiff !== 0) return weightDiff;

      return Number(a.latest_score ?? 999) - Number(b.latest_score ?? 999);
    });

  const inactiveSEs    = flags?.inactive_ses    || [];
  const expenseFlags   = flags?.expense_flags   || [];
  const inflowFlags    = flags?.inflow_flags    || [];
  const totalAlerts    = alerts.length + inactiveSEs.length + expenseFlags.length + inflowFlags.length + dormantBrands.length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Alerts</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Performance urgency, inactivity, expense spikes, inflow gaps, and dormant brands.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{totalAlerts}</span> active notification{totalAlerts !== 1 ? 's' : ''}
        </div>
      </div>

      {(loading || flagsLoading) && <p className="text-sm text-slate-400">Loading alerts…</p>}

      {!loading && alerts.length > 0 && (
        <div className="space-y-3">
          <SectionHeading label="Performance Urgency" count={alerts.length} color="text-red-600" />
          {alerts.map(alert => {
            const urgency = URGENCY_META[alert.urgency_level];
            const trend = TREND_META[alert.score_trend];
            const message = buildAlertMessage(alert);
            const detailDate = alert.latest_score_date || alert.latest_coach_date || '';

            return (
              <div key={alert.se_name} className="bg-white border border-slate-200 rounded-lg px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{alert.se_name}</span>
                      {alert.zone && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{alert.zone}</span>
                      )}
                      {urgency && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${urgency.bg} ${urgency.color}`}>
                          {urgency.label}
                        </span>
                      )}
                      {alert.urgency_escalated && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-orange-50 border-orange-200 text-orange-700">
                          Escalated
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                      {trend && <span className={trend.color}>{trend.label}</span>}
                      {alert.performance_state && <span>{formatPerformanceState(alert.performance_state)}</span>}
                      {alert.latest_score != null && <span>Score {Number(alert.latest_score).toFixed(1)}</span>}
                      {alert.latest_score_date && <span>{alert.latest_score_date}</span>}
                    </div>

                    <p className="text-sm text-slate-700 mt-3">{message}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/coach?se=${encodeURIComponent(alert.se_name)}`}
                      className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded transition-colors"
                    >
                      Open Coach
                    </Link>
                    <Link
                      href={`/se/${encodeURIComponent(alert.se_name)}${detailDate ? `?date=${detailDate}` : ''}`}
                      className="text-xs border border-slate-200 hover:border-slate-300 text-slate-700 px-3 py-1.5 rounded transition-colors"
                    >
                      View Report
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Inactive SE Alerts ───────────────────────────────────────────────── */}
      {!flagsLoading && inactiveSEs.length > 0 && (
        <div className="space-y-3">
          <SectionHeading label="Inactive SEs" count={inactiveSEs.length} color="text-slate-600"
            sub="No activity or zero stores visited for 2+ consecutive days. Analytics paused until active." />
          {inactiveSEs.map(se => (
            <div key={se.se_name} className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{se.se_name}</span>
                    {se.zone && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{se.zone}</span>}
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-100 border-slate-300 text-slate-600">
                      Inactive {se.days_inactive}d
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-2">{se.detail}{se.last_active_date ? ` — last seen ${se.last_active_date}` : ''}. Investigate before next report.</p>
                </div>
                <Link href={`/se/${encodeURIComponent(se.se_name)}`}
                  className="text-xs border border-slate-200 hover:border-slate-300 text-slate-700 px-3 py-1.5 rounded transition-colors flex-shrink-0">
                  View SE
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Expense Alerts ───────────────────────────────────────────────────── */}
      {!flagsLoading && expenseFlags.length > 0 && (
        <div className="space-y-3">
          <SectionHeading label="Expense Alerts" count={expenseFlags.length} color="text-orange-600"
            sub="SEs exceeding the ₦4,000 daily limit, over weekly budget, or showing sudden spend spikes." />
          {expenseFlags.map((se, i) => (
            <div key={`${se.se_name}-${i}`} className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{se.se_name}</span>
                    {se.zone && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{se.zone}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      se.reason === 'over_budget'   ? 'bg-red-50 border-red-200 text-red-700' :
                      se.reason === 'daily_limit'   ? 'bg-red-50 border-red-200 text-red-700' :
                                                      'bg-orange-50 border-orange-200 text-orange-700'
                    }`}>
                      {se.reason === 'over_budget' ? 'Over Budget' : se.reason === 'daily_limit' ? 'Daily Limit Exceeded' : 'Expense Spike'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-2">{se.detail}</p>
                </div>
                <Link href="/manager"
                  className="text-xs border border-slate-200 hover:border-slate-300 text-slate-700 px-3 py-1.5 rounded transition-colors flex-shrink-0">
                  Manager View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Inflow Alerts ────────────────────────────────────────────────────── */}
      {!flagsLoading && inflowFlags.length > 0 && (
        <div className="space-y-3">
          <SectionHeading label="Inflow Alerts" count={inflowFlags.length} color="text-amber-600"
            sub="Senior SE / Corporate SE with 2+ consecutive days of zero inflow." />
          {inflowFlags.map(se => (
            <div key={se.se_name} className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{se.se_name}</span>
                    {se.zone && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{se.zone}</span>}
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-amber-50 border-amber-200 text-amber-700">
                      {se.days_zero}d No Inflow
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-2">{se.detail} — prioritise collections immediately.</p>
                </div>
                <Link href={`/se/${encodeURIComponent(se.se_name)}`}
                  className="text-xs border border-slate-200 hover:border-slate-300 text-slate-700 px-3 py-1.5 rounded transition-colors flex-shrink-0">
                  View SE
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Dormant Brands ───────────────────────────────────────────────────── */}
      {!flagsLoading && dormantBrands.length > 0 && (
        <div className="space-y-3">
          <SectionHeading label="Dormant Brands" count={dormantBrands.length} color="text-purple-600"
            sub="No SE has ordered for these brands in the last 2–3 days. Push orders before the week ends." />
          <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
            <div className="space-y-2">
              {dormantBrands.map(b => (
                <div key={b.brand} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.severity === 'red' ? 'bg-red-500' : 'bg-orange-400'}`} />
                    <span className="text-sm font-medium text-slate-800">{b.brand}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${b.severity === 'red' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'}`}>
                      {b.days_missed} day{b.days_missed !== 1 ? 's' : ''} with no orders
                    </span>
                    {b.last_ordered && (
                      <p className="text-[10px] text-slate-400 mt-0.5">Last ordered: {b.last_ordered}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── All clear ───────────────────────────────────────────────────────── */}
      {!loading && !flagsLoading && totalAlerts === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-lg bg-white">
          <p className="text-slate-600 font-medium mb-1">No active alerts</p>
          <p className="text-slate-400 text-xs">No urgency notifications are active right now.</p>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ label, count, color = 'text-slate-700', sub }) {
  return (
    <div className="flex items-start justify-between gap-2 pt-2">
      <div>
        <h2 className={`text-sm font-bold ${color}`}>{label}</h2>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-semibold flex-shrink-0">{count}</span>
    </div>
  );
}

function isAlertSummary(summary) {
  if (!summary) return false;

  return (
    summary.urgency_level === 'intervention' ||
    summary.urgency_level === 'corrective' ||
    summary.urgency_escalated === true ||
    summary.score_trend === 'declining' ||
    summary.performance_state === 'underperforming_declining' ||
    summary.performance_state === 'underperforming_critical' ||
    summary.performance_level === 'critical'
  );
}

function alertWeight(summary) {
  let weight = 0;

  if (summary.score_trend === 'declining') weight += 2;
  if (summary.performance_state === 'underperforming_declining') weight += 2;
  if (summary.performance_state === 'underperforming_critical') weight += 3;
  if (summary.performance_level === 'critical') weight += 1;
  if (summary.urgency_escalated) weight += 2;

  return weight;
}

function buildAlertMessage(summary) {
  if (summary.urgency_level === 'intervention') {
    return 'This SE is at intervention level and needs immediate attention.';
  }

  if (summary.urgency_level === 'corrective' && summary.urgency_escalated) {
    return 'Urgency has escalated and performance needs direct correction now.';
  }

  if (summary.performance_state === 'underperforming_critical') {
    return 'Performance is in a critical state and should be reviewed immediately.';
  }

  if (summary.performance_state === 'underperforming_declining') {
    return 'Performance is already below target and still moving in the wrong direction.';
  }

  if (summary.score_trend === 'declining') {
    return 'Recent performance trend is declining and needs attention before it worsens.';
  }

  if (summary.performance_level === 'critical') {
    return 'Latest performance level is critical.';
  }

  return 'This SE has triggered the urgency list and should be reviewed.';
}

function formatPerformanceState(value) {
  return String(value || '')
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
