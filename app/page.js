'use client';

import { useState, useEffect, useCallback } from 'react';
import { STATUS_META, buildRankSparkline } from '@/lib/tier-engine';

// Zone display order
const ZONE_ORDER = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'All Corporate', 'Trial'];

export default function Dashboard() {
  const [date, setDate]           = useState(yesterdayStr());
  const [reports, setReports]     = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coaching, setCoaching]   = useState(false);
  const [message, setMessage]     = useState(null);
  const [files, setFiles]         = useState({ checkin: null, product: null, feedback: null });
  const [debtScores, setDebtScores] = useState({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [tableView, setTableView]       = useState('zone'); // 'zone' | 'list'

  const loadData = useCallback(async (d) => {
    setLoading(true);
    try {
      const [reportsRes, analyticsRes] = await Promise.all([
        fetch(`/api/reports?date=${d}`),
        fetch(`/api/analytics?date=${d}&days=7`),
      ]);
      const reportsData   = await reportsRes.json();
      const analyticsData = await analyticsRes.json();
      setReports(Array.isArray(reportsData) ? reportsData : []);
      setAnalytics(analyticsData?.summary ? analyticsData : null);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(date); }, [date, loadData]);

  // Pre-fill debt scores from last known values when analytics loads
  useEffect(() => {
    if (analytics?.lastDebtScores) {
      setDebtScores(prev => {
        const merged = { ...analytics.lastDebtScores };
        // Don't overwrite values the user already changed this session
        Object.entries(prev).forEach(([k, v]) => { merged[k] = v; });
        return merged;
      });
    }
  }, [analytics?.lastDebtScores]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!files.checkin || !files.product || !files.feedback) {
      setMessage({ type: 'error', text: 'Please select all 3 files.' });
      return;
    }
    setUploading(true);
    setMessage(null);
    const fd = new FormData();
    fd.append('checkin',  files.checkin);
    fd.append('product',  files.product);
    fd.append('feedback', files.feedback);
    fd.append('date',     date);
    fd.append('debt_scores', JSON.stringify(debtScores));
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: 'success', text: `Processed ${data.processed} SEs for ${data.date}` });
      setUploadOpen(false);
      loadData(date);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setUploading(false);
  }

  async function handleCoach() {
    setCoaching(true);
    setMessage(null);
    try {
      const res  = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: 'success', text: `Coaching generated for ${data.count} SEs` });
      loadData(date);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setCoaching(false);
  }

  // Use analytics-enriched SE list if available, else fall back to raw reports
  const enrichedSEs = analytics?.ses || [];
  const rawFullSEs  = reports.filter(r => r.status !== 'trial');
  const hasAnalytics = enrichedSEs.length > 0;

  // Build zone groups sorted by ZONE_ORDER
  const allSEs = hasAnalytics ? enrichedSEs : reports;
  const zoneGroups = buildZoneGroups(allSEs, filterStatus, hasAnalytics);

  const filterOptions = ['all', 'rising', 'at_risk', 'below_expectation', 'watch', 'on_track'];
  const allFilterable  = hasAnalytics ? enrichedSEs : [];

  const summary = analytics?.summary;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Track, rank, and coach your field sales team</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white"
          />
          {reports.length > 0 && (
            <button
              onClick={handleCoach}
              disabled={coaching}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
            >
              {coaching ? 'Generating…' : 'Generate Coaching'}
            </button>
          )}
          <button
            onClick={() => setUploadOpen(o => !o)}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors flex items-center gap-1.5"
          >
            Upload {uploadOpen ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* ── Upload Panel (collapsible) ─────────────────────────── */}
      {uploadOpen && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">Upload PepUp Files</h2>
          <form onSubmit={handleUpload}>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <FileInput label="Check-in / Check-out"  accept=".xls,.xlsx"
                onChange={f => setFiles(p => ({ ...p, checkin: f }))} />
              <FileInput label="Product Report"         accept=".xls,.xlsx"
                onChange={f => setFiles(p => ({ ...p, product: f }))} />
              <FileInput label="Feedback Detail Report" accept=".xls,.xlsx"
                onChange={f => setFiles(p => ({ ...p, feedback: f }))} />
            </div>
            {rawFullSEs.length > 0 && (
              <DebtInputs ses={rawFullSEs} debtScores={debtScores} onChange={setDebtScores} />
            )}
            <button
              type="submit"
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded transition-colors"
            >
              {uploading ? 'Processing…' : 'Upload & Process'}
            </button>
          </form>
        </div>
      )}

      {/* ── Message ───────────────────────────────────────────── */}
      {message && (
        <div className={`mb-4 px-4 py-3 rounded text-sm ${
          message.type === 'error'
            ? 'bg-red-900/50 border border-red-700 text-red-300'
            : 'bg-green-900/50 border border-green-700 text-green-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* ── KPI Summary Cards ──────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <KpiCard
            label="Team Avg Score"
            value={`${summary.teamAvgScore}/100`}
            delta={summary.teamAvgScoreYesterday != null
              ? (summary.teamAvgScore - summary.teamAvgScoreYesterday).toFixed(1)
              : null}
          />
          <KpiCard label="Reporting Today" value={summary.reportingCount} />
          <KpiCard label="Total Value" value={`₦${Number(summary.totalValue).toLocaleString()}`} />
          <KpiCard
            label="At Risk"
            value={summary.atRiskCount}
            valueColor={summary.atRiskCount > 0 ? 'text-red-400' : 'text-slate-300'}
            sub={summary.decliningCount > 0 ? `+${summary.decliningCount} watching` : null}
          />
          <KpiCard
            label="Rising"
            value={summary.risingCount}
            valueColor={summary.risingCount > 0 ? 'text-green-400' : 'text-slate-300'}
          />
        </div>
      )}

      {/* ── View Toggle + Filter Tabs ──────────────────────────── */}
      {reports.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded overflow-hidden border border-slate-700 mr-2">
            <button
              onClick={() => setTableView('zone')}
              className={`text-xs px-3 py-1.5 transition-colors ${
                tableView === 'zone' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              By Zone
            </button>
            <button
              onClick={() => setTableView('list')}
              className={`text-xs px-3 py-1.5 transition-colors border-l border-slate-700 ${
                tableView === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Ranked List
            </button>
          </div>

          {/* Status filter chips */}
          {filterOptions.map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`text-xs px-3 py-1 rounded transition-colors ${
                filterStatus === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              {f === 'all' ? 'All' : (STATUS_META[f]?.label || f)}
              {f !== 'all' && hasAnalytics && (() => {
                const cnt = allFilterable.filter(s => s.status === f).length;
                return cnt > 0 ? <span className="ml-1 opacity-70">({cnt})</span> : null;
              })()}
            </button>
          ))}
        </div>
      )}

      {/* ── Zone Tables ────────────────────────────────────────── */}
      {reports.length > 0 && tableView === 'zone' && (
        <div className="space-y-8">
          {zoneGroups.map(zone => (
            <ZoneSection key={zone.name} zone={zone} hasAnalytics={hasAnalytics} />
          ))}
        </div>
      )}

      {/* ── Full Ranked List ───────────────────────────────────── */}
      {reports.length > 0 && tableView === 'list' && (() => {
        const allRanked = [...allSEs].sort((a, b) => (a.rank || 99) - (b.rank || 99));
        const filtered  = hasAnalytics && filterStatus !== 'all'
          ? allRanked.filter(s => s.status === filterStatus)
          : allRanked;
        return (
          <div>
            <TrackingTable rows={filtered} hasAnalytics={hasAnalytics} showZone />
          </div>
        );
      })()}

      {loading && <p className="text-slate-400 text-sm mt-4">Loading…</p>}
      {!loading && reports.length === 0 && (
        <p className="text-slate-500 text-sm mt-4">
          No data for {date}. Click <strong>Upload ▼</strong> to add today's PepUp exports.
        </p>
      )}
    </div>
  );
}

/**
 * Group SEs by zone, apply status filter, sort zones by ZONE_ORDER.
 * Within each zone, SEs are sorted: senior_se first, then by rank.
 */
function buildZoneGroups(ses, filterStatus, hasAnalytics) {
  const zoneMap = {};
  ses.forEach(se => {
    const zone = se.zone || 'Unassigned';
    if (!zoneMap[zone]) zoneMap[zone] = [];
    zoneMap[zone].push(se);
  });

  return Object.entries(zoneMap)
    .map(([name, zoneSEs]) => {
      // Sort: senior_se/corporate_se first, then by rank
      const sorted = [...zoneSEs].sort((a, b) => {
        const aIsSenior = a.positionKey === 'senior_se' || a.positionKey === 'corporate_se';
        const bIsSenior = b.positionKey === 'senior_se' || b.positionKey === 'corporate_se';
        if (aIsSenior && !bIsSenior) return -1;
        if (!aIsSenior && bIsSenior) return 1;
        return (a.rank || 99) - (b.rank || 99);
      });

      // Apply filter (only if analytics active; otherwise show all)
      const filtered = hasAnalytics && filterStatus !== 'all'
        ? sorted.filter(s => s.status === filterStatus)
        : sorted;

      const fullInZone = zoneSEs.filter(s => s.isFullSE !== false && s.status !== 'trial');
      const avgScore = fullInZone.length
        ? Math.round((fullInZone.reduce((s, e) => s + (e.total_score || 0), 0) / fullInZone.length) * 10) / 10
        : null;
      const totalValue = zoneSEs.reduce((s, e) => s + (e.value_of_orders || 0), 0);

      return { name, ses: filtered, allSEs: sorted, avgScore, totalValue };
    })
    .filter(z => z.ses.length > 0)
    .sort((a, b) => {
      const ai = ZONE_ORDER.indexOf(a.name);
      const bi = ZONE_ORDER.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
}

// ── Zone Section ─────────────────────────────────────────────────────

function ZoneSection({ zone, hasAnalytics }) {
  return (
    <div>
      {/* Zone header */}
      <div className="flex items-center gap-3 mb-3 pb-2 border-b border-slate-700">
        <h3 className="font-semibold text-white text-sm uppercase tracking-wider">{zone.name}</h3>
        {zone.avgScore != null && (
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            zone.avgScore >= 75 ? 'bg-green-900/50 text-green-300'
            : zone.avgScore >= 50 ? 'bg-yellow-900/50 text-yellow-300'
            : 'bg-red-900/50 text-red-300'
          }`}>
            Avg {zone.avgScore}
          </span>
        )}
        {zone.totalValue > 0 && (
          <span className="text-xs text-slate-500">
            ₦{Number(zone.totalValue).toLocaleString()}
          </span>
        )}
        <span className="text-xs text-slate-600 ml-auto">{zone.ses.length} SE{zone.ses.length !== 1 ? 's' : ''}</span>
      </div>

      <TrackingTable rows={zone.ses} hasAnalytics={hasAnalytics} />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function KpiCard({ label, value, delta, valueColor = 'text-white', sub }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      {delta != null && (
        <p className={`text-xs mt-0.5 ${Number(delta) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {Number(delta) >= 0 ? '↑' : '↓'} {Math.abs(delta)} vs yesterday
        </p>
      )}
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function FileInput({ label, accept, onChange }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={e => onChange(e.target.files[0] || null)}
        className="w-full text-xs text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 cursor-pointer"
      />
    </label>
  );
}

function DebtInputs({ ses, debtScores, onChange }) {
  if (!ses.length) return null;
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded p-3 mb-3">
      <p className="text-xs text-slate-400 mb-1">Debt Scores (0–30) — pre-filled from last week</p>
      <div className="flex flex-wrap gap-3">
        {ses.map(se => (
          <label key={se.se_name} className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="whitespace-nowrap">{se.se_name.split(' ')[0]}:</span>
            <input
              type="number" min="0" max="30"
              value={debtScores[se.se_name] ?? 30}
              onChange={e => onChange(p => ({ ...p, [se.se_name]: Number(e.target.value) }))}
              className="w-12 bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-white text-center"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function TrackingTable({ rows, hasAnalytics, showZone = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 uppercase border-b border-slate-700">
            <th className="text-left py-2 px-3">Rank</th>
            <th className="text-left py-2 px-3">Name</th>
            {showZone && <th className="text-left py-2 px-3">Zone</th>}
            {hasAnalytics && <th className="text-left py-2 px-3">Status</th>}
            <th className="text-right py-2 px-3">Score</th>
            {hasAnalytics && <th className="text-center py-2 px-3">7-Day Trend</th>}
            <th className="text-right py-2 px-3">Stores</th>
            <th className="text-right py-2 px-3">Brands</th>
            <th className="text-right py-2 px-3">Value (₦)</th>
            <th className="text-right py-2 px-3">Time</th>
            {hasAnalytics && <th className="text-center py-2 px-3">Expectations</th>}
            <th className="text-left py-2 px-3">Coach</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const rankDelta  = r.rankDeltaVsYesterday;
            const statusMeta = r.status ? (STATUS_META[r.status] || STATUS_META.on_track) : null;
            const sparkData  = r.rankHistory ? buildRankSparkline(r.rankHistory, 7) : null;
            const isSenior   = r.positionKey === 'senior_se' || r.positionKey === 'corporate_se';

            return (
              <tr
                key={r.se_name}
                className={`border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer ${isSenior ? 'bg-slate-800/20' : ''}`}
                onClick={() => window.location.href = `/se/${encodeURIComponent(r.se_name)}?date=${r.report_date}`}
              >
                {/* Rank + delta */}
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-300 font-medium">{r.rank || '—'}</span>
                    {rankDelta != null && rankDelta !== 0 && (
                      <span className={`text-xs ${rankDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {rankDelta > 0 ? `↑${rankDelta}` : `↓${Math.abs(rankDelta)}`}
                      </span>
                    )}
                    {rankDelta === 0 && <span className="text-xs text-slate-600">—</span>}
                  </div>
                </td>

                {/* Name + Position */}
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <div className={`font-medium ${isSenior ? 'text-white' : 'text-slate-200'}`}>{r.se_name}</div>
                  {r.positionLabel && r.positionLabel !== 'Sales Executive' && (
                    <div className="text-xs text-slate-500">{r.positionLabel}</div>
                  )}
                </td>

                {/* Zone (ranked list only) */}
                {showZone && (
                  <td className="py-2.5 px-3 text-xs text-slate-400 whitespace-nowrap">{r.zone || '—'}</td>
                )}

                {/* Status badge */}
                {hasAnalytics && (
                  <td className="py-2.5 px-3">
                    {statusMeta ? (
                      <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 w-fit ${statusMeta.bg} ${statusMeta.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                        {statusMeta.label}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                )}

                {/* Score */}
                <td className="py-2.5 px-3 text-right">
                  <div>
                    <ScoreBadge score={r.total_score} />
                    {r.avgScore7d != null && r.avgScore7d !== r.total_score && (
                      <div className="text-xs text-slate-500">{r.avgScore7d} avg</div>
                    )}
                  </div>
                </td>

                {/* Rank sparkline */}
                {hasAnalytics && (
                  <td className="py-2.5 px-3 text-center">
                    {sparkData ? <RankSparkline data={sparkData} /> : <span className="text-slate-600">—</span>}
                  </td>
                )}

                {/* Stores */}
                <td className="py-2.5 px-3 text-right">
                  <span className={r.expectations && !r.expectations.storesOk ? 'text-orange-400' : 'text-slate-300'}>
                    {r.stores_visited}
                  </span>
                </td>

                {/* Brands */}
                <td className="py-2.5 px-3 text-right">
                  <span className={r.expectations && !r.expectations.brandsOk ? 'text-orange-400' : 'text-slate-300'}>
                    {r.brands_ordered}
                    {r.brandPct != null && <span className="text-xs text-slate-500 ml-1">({r.brandPct}%)</span>}
                  </span>
                </td>

                {/* Value */}
                <td className="py-2.5 px-3 text-right text-slate-300">
                  {Number(r.value_of_orders).toLocaleString()}
                </td>

                {/* Time */}
                <td className="py-2.5 px-3 text-right text-slate-400 text-xs">{r.resumption_time || '—'}</td>

                {/* Expectations checkmarks */}
                {hasAnalytics && (
                  <td className="py-2.5 px-3 text-center">
                    {r.expectations && !r.expectations.exempt ? (
                      <div className="flex gap-1 justify-center text-xs">
                        <ExpCheck ok={r.expectations.scoreOk}  label="S" />
                        <ExpCheck ok={r.expectations.brandsOk} label="B" />
                        <ExpCheck ok={r.expectations.storesOk} label="V" />
                      </div>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                )}

                {/* Coaching */}
                <td className="py-2.5 px-3">
                  {r.coaching
                    ? <span className="text-xs text-green-400">Ready</span>
                    : <span className="text-xs text-slate-500">—</span>
                  }
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} className="py-6 text-center text-slate-500 text-sm">
                No SEs match this filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ExpCheck({ ok, label }) {
  return (
    <span
      title={label === 'S' ? 'Score' : label === 'B' ? 'Brand %' : 'Stores visited'}
      className={`w-5 h-5 rounded flex items-center justify-center ${
        ok ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'
      }`}
    >
      {ok ? '✓' : '✗'}
    </span>
  );
}

function ScoreBadge({ score }) {
  const s = Number(score) || 0;
  const color = s >= 75 ? 'text-green-400' : s >= 50 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`font-bold ${color}`}>{s.toFixed(1)}</span>;
}

/**
 * Inline SVG sparkline for rank history.
 * Lower rank number = better = higher on chart (Y axis inverted).
 */
function RankSparkline({ data, width = 56, height = 20, maxRank = 15 }) {
  const valid = data.filter(d => d != null);
  if (valid.length < 2) return <span className="text-slate-600 text-xs">—</span>;

  const pts = data.map((rank, i) => {
    if (rank == null) return null;
    const x = (i / (data.length - 1)) * width;
    const y = ((rank - 1) / (maxRank - 1)) * height;
    return { x, y };
  }).filter(Boolean);

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const firstRank = valid[0];
  const lastRank  = valid[valid.length - 1];
  const color = lastRank < firstRank ? '#4ade80' : lastRank > firstRank ? '#f87171' : '#94a3b8';

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill={color} />
      ))}
    </svg>
  );
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
