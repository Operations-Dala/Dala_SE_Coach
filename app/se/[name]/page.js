'use client';

import Link from 'next/link';
import { use, useEffect, useEffectEvent, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

export default function SEDetail({ params, searchParams }) {
  const resolvedParams = use(params);
  const resolvedSearch = use(searchParams);
  const seName = decodeURIComponent(resolvedParams.name);
  const date   = resolvedSearch.date || yesterdayStr();

  const [data,          setData]         = useState(null);
  const [history,       setHistory]      = useState([]);
  const [historyDays,   setHistoryDays]  = useState(30);
  const [profile,       setProfile]      = useState(null);
  const [loading,       setLoading]      = useState(true);
  const [coaching,      setCoaching]     = useState(false);
  const [uploading,     setUploading]    = useState(false);
  const [msg,           setMsg]          = useState(null);
  const [weeklyReview,  setWeeklyReview] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyMsg,     setWeeklyMsg]    = useState(null);

  const loadHistory = useEffectEvent(async () => {
    try {
      const res  = await fetch(`/api/se-history?se=${encodeURIComponent(seName)}&days=${historyDays}`);
      const rows = await res.json();
      setHistory(Array.isArray(rows) ? rows : []);
    } catch {}
  });

  const loadWeeklyReview = useEffectEvent(async () => {
    try {
      const res  = await fetch(`/api/coach/weekly-review?se=${encodeURIComponent(seName)}`);
      const json = await res.json();
      if (json && !json.error) setWeeklyReview(json);
    } catch {}
  });

  // Load report + profile on date/se change
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/reports?date=${date}&se=${encodeURIComponent(seName)}`).then(r => r.json()),
      fetch(`/api/se-profile/${encodeURIComponent(seName)}`).then(r => r.json()),
    ]).then(([reportData, profileData]) => {
      setData(reportData);
      setProfile(profileData);
      setLoading(false);
    });
    loadWeeklyReview();
  }, [seName, date]);

  // Reload history when SE or date range changes
  useEffect(() => {
    loadHistory();
  }, [seName, historyDays]);

  async function handleGenerateWeeklyReview() {
    setWeeklyLoading(true);
    setWeeklyMsg(null);
    try {
      const res    = await fetch('/api/coach/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ se_name: seName }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setWeeklyReview(result);
      setWeeklyMsg({ type: 'success', text: 'Weekly review generated.' });
    } catch (err) {
      setWeeklyMsg({ type: 'error', text: err.message });
    }
    setWeeklyLoading(false);
  }

  async function handleCoach() {
    setCoaching(true);
    setMsg(null);
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, se_name: seName }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      const updated = await fetch(`/api/reports?date=${date}&se=${encodeURIComponent(seName)}`).then(r => r.json());
      setData(updated);
      setMsg({ type: 'success', text: 'Coaching generated.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
    setCoaching(false);
  }

  async function handleProfileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res    = await fetch(`/api/se-profile/${encodeURIComponent(seName)}`, { method: 'POST', body: fd });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setProfile({ ...profile, file_name: file.name });
      setMsg({ type: 'success', text: 'Traits profile uploaded.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
    setUploading(false);
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  const report       = data?.report;
  const coaching_msg = data?.coaching;
  const analysis     = coaching_msg?.analysis_json
    ? (typeof coaching_msg.analysis_json === 'string'
        ? JSON.parse(coaching_msg.analysis_json)
        : coaching_msg.analysis_json)
    : null;

  const perf      = analysis?.performance;
  const strengths = perf?.key_strengths        || [];
  const gaps      = perf?.key_gaps             || [];
  const patterns  = perf?.behavioral_patterns  || [];
  const perfLevel = perf?.performance_level;
  const trend     = perf?.score_trend;

  const brandCoverage = report?.brand_coverage ? JSON.parse(report.brand_coverage) : {};
  const covered = Object.entries(brandCoverage).filter(([, v]) =>  v).map(([k]) => k);
  const missed  = Object.entries(brandCoverage).filter(([, v]) => !v).map(([k]) => k);

  // Chart data — format dates for display
  const chartData = history.map(h => ({
    date:  fmtDate(h.report_date),
    score: Number(h.total_score) || 0,
    raw:   h.report_date,
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-slate-500 hover:text-slate-900 text-sm">Back to Dashboard</Link>
        <span className="text-slate-400">/</span>
        <h1 className="text-xl font-bold text-slate-900">{seName}</h1>
        <span className="text-slate-500 text-sm">{date}</span>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded text-sm ${
          msg.type === 'error'
            ? 'bg-red-900/50 border border-red-700 text-red-300'
            : 'bg-green-900/50 border border-green-700 text-green-300'
        }`}>{msg.text}</div>
      )}

      {/* ── Performance Overview Chart (full width) ── */}
      {chartData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Performance Overview</h2>
              <p className="text-xs text-slate-400 mt-0.5">Total score over time</p>
            </div>
            <div className="flex gap-1">
              {[7, 14, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setHistoryDays(d)}
                  className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                    historyDays === d
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {d}D
                </button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={70} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.6} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#scoreGrad)"
                dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#6366f1' }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Mini legend */}
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-500 inline-block rounded" />
              Total score
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-green-400 inline-block rounded border-dashed" style={{ borderTop: '1.5px dashed #4ade80' }} />
              70-point threshold
            </span>
            {chartData.length > 0 && (
              <span className="ml-auto">
                {chartData.length} data point{chartData.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {!report ? (
        <p className="text-slate-500">No report found for this date.</p>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* ── Left: main content ── */}
          <div className="col-span-2 space-y-4">

            {/* Score breakdown */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-900">Score Breakdown</h2>
                <span className="text-2xl font-bold text-slate-900">{report.total_score}/100</span>
              </div>
              <div className="space-y-2">
                <ScoreBar label="Brand Coverage" score={report.brand_score}       max={40} color="bg-blue-500" />
                <ScoreBar label="Debt Score"     score={report.debt_score}        max={30} color="bg-green-500" />
                <ScoreBar label="Efficiency"     score={report.efficiency_score}  max={15} color="bg-yellow-500" />
                <ScoreBar label="Visits"         score={report.visit_score}       max={10} color="bg-orange-500" />
                <ScoreBar label="Punctuality"    score={report.time_score}        max={5}  color="bg-purple-500" />
              </div>
            </div>

            {/* ── Strengths & Struggles ── */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-900">Performance Insights</h2>
                <div className="flex items-center gap-2">
                  {perfLevel && <PerfBadge level={perfLevel} />}
                  {trend     && <TrendBadge trend={trend} />}
                </div>
              </div>

              {(strengths.length > 0 || gaps.length > 0 || patterns.length > 0) ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Doing well */}
                    <div>
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-widest mb-2">
                        Doing Well
                      </p>
                      {strengths.length > 0 ? (
                        <ul className="space-y-2">
                          {strengths.map((s, i) => (
                            <li key={i} className="flex gap-2 text-sm text-slate-600 bg-green-50 rounded-lg px-3 py-2">
                              <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No strengths identified yet.</p>
                      )}
                    </div>

                    {/* Needs work */}
                    <div>
                      <p className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-2">
                        Needs Work
                      </p>
                      {gaps.length > 0 ? (
                        <ul className="space-y-2">
                          {gaps.map((g, i) => (
                            <li key={i} className="flex gap-2 text-sm text-slate-600 bg-red-50 rounded-lg px-3 py-2">
                              <span className="text-red-400 shrink-0 mt-0.5">!</span>
                              <span>{g}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No gaps identified yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Behavioral patterns */}
                  {patterns.length > 0 && (
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest mb-2">
                        Patterns Detected
                      </p>
                      <ul className="space-y-1.5">
                        {patterns.map((p, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-600">
                            <span className="text-blue-400 shrink-0">→</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-slate-400 text-sm">No analysis yet.</p>
                  <p className="text-slate-400 text-xs mt-1">Generate coaching to see performance insights.</p>
                </div>
              )}
            </div>

            {/* Key metrics */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="font-semibold text-slate-900 mb-3">Today&apos;s Metrics</h2>
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Resumption"   value={report.resumption_time || '—'} />
                <Metric label="Stores"       value={report.stores_visited} />
                <Metric label="Brands"       value={report.brands_ordered} />
                <Metric label="Orders"       value={report.orders_generated} />
                <Metric label="Value (₦)"    value={Number(report.value_of_orders).toLocaleString()} />
                <Metric label="Reports"      value={report.complete_report} />
                <Metric label="Avg/BP"       value={`₦${Number(report.avg_value_per_bp).toLocaleString()}`} />
                <Metric label="Avg/Store"    value={`₦${Number(report.avg_value_per_store).toLocaleString()}`} />
                <Metric label="Rank"         value={`#${report.rank}`} />
              </div>
            </div>

            {/* Brand coverage */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="font-semibold text-slate-900 mb-3">Brand Coverage</h2>
              {missed.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-red-400 mb-1.5 uppercase tracking-wide">Missed ({missed.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {missed.map(b => (
                      <span key={b} className="text-xs bg-red-50 border border-red-200 text-red-500 px-2 py-0.5 rounded">{b}</span>
                    ))}
                  </div>
                </div>
              )}
              {covered.length > 0 && (
                <div>
                  <p className="text-xs text-green-500 mb-1.5 uppercase tracking-wide">Covered ({covered.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {covered.map(b => (
                      <span key={b} className="text-xs bg-green-50 border border-green-200 text-green-600 px-2 py-0.5 rounded">{b}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Coaching */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-900">AI Coaching</h2>
                <button
                  onClick={handleCoach}
                  disabled={coaching}
                  className="text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors"
                >
                  {coaching ? 'Generating…' : coaching_msg ? 'Regenerate' : 'Generate'}
                </button>
              </div>

              {coaching_msg?.coaching_message ? (
                <div className="space-y-4">
                  {analysis?.performance?.week_trajectory && (
                    <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600 italic border-l-2 border-indigo-300">
                      {analysis.performance.week_trajectory}
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Coach Message</p>
                    <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                      {coaching_msg.coaching_message}
                    </p>
                  </div>
                  {analysis?.performance?.risk_flags?.length > 0 && (
                    <div className="border-t border-slate-100 pt-3">
                      <p className="text-xs text-amber-500 uppercase tracking-wide mb-1.5">Risk Flags</p>
                      <ul className="space-y-1">
                        {analysis.performance.risk_flags.map((f, i) => (
                          <li key={i} className="text-xs text-slate-500 flex gap-1.5">
                            <span className="text-amber-400">⚠</span>{f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No coaching yet. Click Generate.</p>
              )}
            </div>
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-4">
            {/* SE Profile */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h2 className="font-semibold text-slate-900 text-sm mb-3">SE Traits Profile</h2>
              {profile?.file_name ? (
                <div className="mb-3">
                  <p className="text-xs text-green-500 mb-1">Uploaded</p>
                  <p className="text-xs text-slate-400">{profile.file_name}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mb-3">No traits profile uploaded yet.</p>
              )}
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">
                  {profile?.file_name ? 'Replace' : 'Upload'} .docx traits file
                </span>
                <input
                  type="file" accept=".docx"
                  onChange={handleProfileUpload}
                  disabled={uploading}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300 cursor-pointer disabled:opacity-50"
                />
              </label>
            </div>

            {/* Weekly Review */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-900 text-sm">Weekly Review</h2>
                <button
                  onClick={handleGenerateWeeklyReview}
                  disabled={weeklyLoading}
                  className="text-[10px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-2.5 py-1 rounded transition-colors"
                >
                  {weeklyLoading ? 'Generating…' : weeklyReview ? 'Regenerate' : 'Generate'}
                </button>
              </div>

              {weeklyMsg && (
                <p className={`text-[10px] mb-2 ${weeklyMsg.type === 'error' ? 'text-red-400' : 'text-green-500'}`}>
                  {weeklyMsg.text}
                </p>
              )}

              {weeklyReview ? (
                <div className="space-y-3 text-xs">
                  {weeklyReview.avgScore != null && (
                    <div className="flex gap-2 text-center">
                      <div className="flex-1 bg-slate-50 rounded p-2">
                        <p className="text-[10px] text-slate-400 mb-0.5">Avg</p>
                        <p className="font-bold text-slate-700">{weeklyReview.avgScore}</p>
                      </div>
                      <div className="flex-1 bg-green-50 rounded p-2">
                        <p className="text-[10px] text-slate-400 mb-0.5">High</p>
                        <p className="font-bold text-green-600">{weeklyReview.highScore}</p>
                      </div>
                      <div className="flex-1 bg-red-50 rounded p-2">
                        <p className="text-[10px] text-slate-400 mb-0.5">Low</p>
                        <p className="font-bold text-red-500">{weeklyReview.lowScore}</p>
                      </div>
                    </div>
                  )}

                  {weeklyReview.reviewJson?.week_summary && (
                    <p className="text-slate-600 leading-relaxed">{weeklyReview.reviewJson.week_summary}</p>
                  )}

                  {weeklyReview.reviewJson?.highlights?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-green-600 uppercase tracking-widest mb-1">What went well</p>
                      <ul className="space-y-1">
                        {weeklyReview.reviewJson.highlights.map((h, i) => (
                          <li key={i} className="flex gap-1.5 text-slate-600">
                            <span className="text-green-500 shrink-0">✓</span>{h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {weeklyReview.reviewJson?.improvement_areas?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-widest mb-1">What to improve</p>
                      <ul className="space-y-1">
                        {weeklyReview.reviewJson.improvement_areas.map((a, i) => (
                          <li key={i} className="flex gap-1.5 text-slate-600">
                            <span className="text-orange-400 shrink-0">!</span>{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {weeklyReview.reviewJson?.patterns_observed?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest mb-1">Patterns noticed</p>
                      <ul className="space-y-1">
                        {weeklyReview.reviewJson.patterns_observed.map((p, i) => (
                          <li key={i} className="flex gap-1.5 text-slate-600">
                            <span className="text-blue-400 shrink-0">→</span>{p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {weeklyReview.reviewJson?.next_week_mission && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded p-2.5">
                      <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-widest mb-1">Next week&apos;s mission</p>
                      <p className="text-slate-700">{weeklyReview.reviewJson.next_week_mission}</p>
                    </div>
                  )}

                  {weeklyReview.reviewJson?.coach_note && (
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">From your coach</p>
                      <p className="text-slate-600 italic leading-relaxed">{weeklyReview.reviewJson.coach_note}</p>
                    </div>
                  )}

                  {weeklyReview.week_ending && (
                    <p className="text-[10px] text-slate-400 pt-1">Week ending {weeklyReview.week_ending}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {weeklyLoading ? 'Generating review…' : 'Click Generate to produce a personalised end-of-week review.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chart components ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const score = payload[0]?.value;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="text-slate-400 mb-0.5">{label}</p>
      <p className="font-bold text-slate-800">{score}/100</p>
      <p className={`text-[10px] mt-0.5 ${score >= 70 ? 'text-green-500' : score >= 50 ? 'text-amber-500' : 'text-red-400'}`}>
        {score >= 70 ? 'On target' : score >= 50 ? 'Below target' : 'Critical'}
      </p>
    </div>
  );
}

// ── Badge components ──────────────────────────────────────────────────────────

const PERF_STYLES = {
  elite:        'bg-purple-100 text-purple-700',
  strong:       'bg-green-100 text-green-700',
  average:      'bg-blue-100 text-blue-700',
  below_average:'bg-orange-100 text-orange-700',
  critical:     'bg-red-100 text-red-700',
};

function PerfBadge({ level }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${PERF_STYLES[level] || 'bg-slate-100 text-slate-500'}`}>
      {level?.replace('_', ' ')}
    </span>
  );
}

const TREND_STYLES = {
  improving: 'bg-green-100 text-green-700',
  declining: 'bg-red-100 text-red-700',
  volatile:  'bg-amber-100 text-amber-700',
  flat:      'bg-slate-100 text-slate-500',
};
const TREND_ICONS = { improving: '↑', declining: '↓', volatile: '~', flat: '→' };

function TrendBadge({ trend }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TREND_STYLES[trend] || 'bg-slate-100 text-slate-500'}`}>
      {TREND_ICONS[trend] || ''} {trend}
    </span>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function ScoreBar({ label, score, max, color }) {
  const pct = max > 0 ? Math.min((score / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-600 w-12 text-right">{Number(score).toFixed(1)}/{max}</span>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
