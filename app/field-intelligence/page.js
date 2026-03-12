'use client';

import { useState, useEffect } from 'react';

const FAULT_META = {
  se:     { label: 'SE Controllable', color: 'bg-orange-500', text: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200', desc: 'Issues the SE can fix — missed visits, weak pitch, poor follow-through' },
  supply: { label: 'Supply / Dala',   color: 'bg-red-500',    text: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',    desc: "Stock-outs, delayed delivery, quality from depot — Dala's responsibility" },
  market: { label: 'Market Factors',  color: 'bg-blue-500',   text: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',   desc: "Competitor pricing, consumer shifts, economic factors outside anyone's control" },
  shared: { label: 'Shared',          color: 'bg-yellow-500', text: 'text-yellow-600',  bg: 'bg-yellow-50',  border: 'border-yellow-200', desc: 'Mixed — supply issue the SE could have escalated faster' },
};

const ISSUE_LABELS = {
  stock_out: 'Stock-out', quality: 'Quality', pricing: 'Pricing',
  competitor_activity: 'Competitor', high_demand: 'High Demand',
  low_demand: 'Low Demand', positive_reception: 'Positive',
  retailer_complaint: 'Retailer Complaint', other: 'Other',
};

const SEVERITY_META = {
  high:   { label: 'High',   cls: 'bg-red-100 text-red-600' },
  medium: { label: 'Medium', cls: 'bg-yellow-100 text-yellow-700' },
  low:    { label: 'Low',    cls: 'bg-slate-100 text-slate-500' },
};

export default function FieldIntelligencePage() {
  const [intel, setIntel]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [days, setDays]             = useState(14);

  // Detail drawer
  const [panel, setPanel]           = useState(null); // { type: 'brand'|'observation', data }
  const [panelFeedback, setPanelFeedback] = useState(null);
  const [panelLoading, setPanelLoading]   = useState(false);

  useEffect(() => {
    fetch(`/api/feedback/intelligence?days=${days}`)
      .then(r => r.json())
      .then(data => { setIntel(data?.recent_complaints ? data : null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  function handleDaysChange(nextDays) {
    if (nextDays === days) return;
    setLoading(true);
    setDays(nextDays);
  }

  function openBrandPanel(brand) {
    setPanel({ type: 'brand', data: brand });
    setPanelFeedback(null);
  }

  async function openObservationPanel(obs) {
    setPanel({ type: 'observation', data: obs });
    setPanelFeedback(null);
    setPanelLoading(true);
    try {
      const res  = await fetch(`/api/feedback?date=${obs.date}&se=${encodeURIComponent(obs.se)}`);
      const data = await res.json();
      setPanelFeedback(data);
    } catch {}
    setPanelLoading(false);
  }

  function closePanel() {
    setPanel(null);
    setPanelFeedback(null);
  }

  return (
    <>
      {/* Main content */}
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Field Intelligence Log</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              SE-reported field observations — accountability split between SE, supply/Dala, and market factors
            </p>
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => handleDaysChange(d)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${days === d ? 'bg-red-600 text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading field intelligence…</div>
        )}

        {!loading && !intel && (
          <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
            <p className="text-slate-500 font-medium mb-1">No field intelligence yet</p>
            <p className="text-slate-400 text-xs">Upload feedback reports and run coaching to populate this log.</p>
          </div>
        )}

        {!loading && intel && (
          <div className="space-y-5">

            {/* ── Accountability Breakdown ───────────────────────────────────────── */}
            {intel.has_ai_analysis && intel.accountability.total > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Issue Accountability — last {days} days
                  </p>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {intel.accountability.total} flagged issues
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  {[
                    { key: 'supply', pct: intel.accountability.supply_pct },
                    { key: 'se',     pct: intel.accountability.se_pct },
                    { key: 'market', pct: intel.accountability.market_pct },
                  ].map(({ key, pct }) => {
                    const meta = FAULT_META[key];
                    return (
                      <div key={key} className={`${meta.bg} border ${meta.border} rounded-lg p-4`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-slate-700">{meta.label}</span>
                          <span className={`text-2xl font-bold ${meta.text}`}>{pct}%</span>
                        </div>
                        <div className="w-full bg-white/70 rounded-full h-1.5 mb-3">
                          <div className={`${meta.color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug">{meta.desc}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 italic">
                  Supply/Dala issues reflect stock, delivery, or quality problems — not SE performance. SE-controllable issues are coaching targets.
                </p>
              </div>
            )}

            {/* ── Top Brands — AI enriched ───────────────────────────────────────── */}
            {intel.has_ai_analysis && intel.brand_summary.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
                  Top Brands by Field Issues
                </p>
                <p className="text-[10px] text-slate-400 mb-4">Click a brand to see full report detail</p>
                <div className="space-y-0">
                  {intel.brand_summary.map(b => {
                    const topIssue = Object.entries(b.issue_types || {}).sort((a, m) => m[1] - a[1])[0];
                    const topFault = Object.entries(b.fault_attrs || {}).sort((a, m) => m[1] - a[1])[0];
                    const faultMeta = topFault ? FAULT_META[topFault[0]] : null;
                    const isActive  = panel?.type === 'brand' && panel.data.brand === b.brand;
                    return (
                      <button key={b.brand} onClick={() => openBrandPanel(b)}
                        className={`w-full flex items-center gap-4 py-3 px-3 -mx-3 rounded-lg border text-left transition-colors cursor-pointer ${isActive ? 'bg-slate-50 border-slate-200' : 'border-transparent hover:bg-slate-50'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-900">{b.brand}</span>
                            {topIssue && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                {ISSUE_LABELS[topIssue[0]] || topIssue[0]}
                              </span>
                            )}
                            {faultMeta && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${faultMeta.text} ${faultMeta.bg}`}>
                                {faultMeta.label}
                              </span>
                            )}
                          </div>
                          {b.examples[0] && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                              {b.examples[0].store}: {b.examples[0].issue}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-bold text-slate-700">{b.count}</span>
                          <p className="text-[10px] text-slate-400">mentions</p>
                        </div>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-slate-300 flex-shrink-0">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Raw brand frequency — fallback ────────────────────────────────── */}
            {!intel.has_ai_analysis && intel.raw_brand_summary.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Top Brands Mentioned in Feedback
                  </p>
                  <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                    Run coaching to get fault attribution
                  </span>
                </div>
                <div className="space-y-0">
                  {intel.raw_brand_summary.map(b => (
                    <div key={b.brand} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                      <span className="text-sm text-slate-700">{b.brand}</span>
                      <span className="text-sm font-bold text-slate-500">{b.raw_count} entries</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Recent Field Observations ──────────────────────────────────────── */}
            {intel.recent_complaints.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Recent Field Observations</p>
                  <span className="text-[10px] text-slate-400">{intel.recent_complaints.length} entries</span>
                </div>
                <p className="text-[10px] text-slate-400 mb-4">Click an entry to view the SE&apos;s full feedback report</p>
                <div className="space-y-0">
                  {intel.recent_complaints.map((c, i) => {
                    const isActive = panel?.type === 'observation' && panel.data === c;
                    return (
                      <button key={i} onClick={() => openObservationPanel(c)}
                        className={`w-full flex gap-4 py-3 px-3 -mx-3 rounded-lg border text-left transition-colors cursor-pointer ${isActive ? 'bg-slate-50 border-slate-200' : 'border-transparent hover:bg-slate-50'}`}>
                        <div className="flex-shrink-0 w-24 text-right">
                          <p className="text-[10px] text-slate-400 font-mono">{c.date?.slice(5)}</p>
                          <p className="text-[10px] text-slate-600 font-semibold truncate">{c.se?.split(' ')[0]}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <span className="text-xs font-semibold text-slate-800">{c.brand}</span>
                            <span className="text-[10px] text-slate-400">· {c.store}</span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{c.note}</p>
                        </div>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-slate-300 flex-shrink-0 mt-1">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ── Detail Drawer ──────────────────────────────────────────────────────── */}
      {panel && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 z-30" onClick={closePanel} />

          {/* Slide-in panel */}
          <div className="fixed right-0 top-0 h-full w-[420px] max-w-full bg-white border-l border-slate-200 shadow-xl z-40 flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <div>
                {panel.type === 'brand' ? (
                  <>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Brand Report</p>
                    <h2 className="text-base font-bold text-slate-900">{panel.data.brand}</h2>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Field Report — {panel.data.date}</p>
                    <h2 className="text-base font-bold text-slate-900">{panel.data.se}</h2>
                  </>
                )}
              </div>
              <button onClick={closePanel}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* ── Brand detail panel ──────────────────────────────────────────── */}
              {panel.type === 'brand' && (() => {
                const b = panel.data;
                return (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-slate-900">{b.count}</span>
                      <span className="text-xs text-slate-500">mention{b.count !== 1 ? 's' : ''} in the last {days} days</span>
                    </div>

                    {/* Issue type breakdown */}
                    {b.issue_types && Object.keys(b.issue_types).length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Issue Types</p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(b.issue_types).sort((a, c) => c[1] - a[1]).map(([type, cnt]) => (
                            <span key={type} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                              {ISSUE_LABELS[type] || type} · {cnt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fault attribution breakdown */}
                    {b.fault_attrs && Object.keys(b.fault_attrs).length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Fault Attribution</p>
                        <div className="space-y-2">
                          {Object.entries(b.fault_attrs).sort((a, c) => c[1] - a[1]).map(([key, cnt]) => {
                            const meta = FAULT_META[key] || { label: key, color: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' };
                            const pct  = Math.round((cnt / b.count) * 100);
                            return (
                              <div key={key} className={`${meta.bg} border ${meta.border} rounded-lg p-3`}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
                                  <span className="text-xs text-slate-500">{cnt} ({pct}%)</span>
                                </div>
                                <div className="w-full bg-white/70 rounded-full h-1">
                                  <div className={`${meta.color} h-1 rounded-full`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* All field reports for this brand */}
                    {b.examples.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                          Field Reports ({b.examples.length})
                        </p>
                        <div className="space-y-3">
                          {b.examples.map((ex, i) => {
                            const faultMeta = ex.fault ? FAULT_META[ex.fault] : null;
                            const sevMeta   = ex.severity ? SEVERITY_META[ex.severity] : null;
                            return (
                              <div key={i} className="bg-slate-50 rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {sevMeta && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sevMeta.cls}`}>
                                      {sevMeta.label}
                                    </span>
                                  )}
                                  {faultMeta && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${faultMeta.text} ${faultMeta.bg} border ${faultMeta.border}`}>
                                      {faultMeta.label}
                                    </span>
                                  )}
                                  {ex.date && (
                                    <span className="text-[10px] text-slate-400 ml-auto font-mono">{ex.date}</span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-slate-700">{ex.store}</p>
                                <p className="text-xs text-slate-600 leading-relaxed">{ex.issue}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* ── Observation detail panel ────────────────────────────────────── */}
              {panel.type === 'observation' && (
                <>
                  {/* Context summary */}
                  <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">{panel.data.brand}</span>
                      <span className="text-[10px] text-slate-400">at {panel.data.store}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{panel.data.note}</p>
                  </div>

                  {/* Full feedback Q&A */}
                  {panelLoading && (
                    <div className="text-center py-8 text-slate-400 text-xs">Loading full report…</div>
                  )}

                  {!panelLoading && panelFeedback && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                        Full Feedback — {panel.data.date}
                      </p>
                      {Object.keys(panelFeedback.grouped?.[panel.data.se] || {}).length === 0 && (
                        <p className="text-xs text-slate-400 italic">No feedback records found for this date.</p>
                      )}
                      {Object.entries(panelFeedback.grouped?.[panel.data.se] || {}).map(([store, brands]) => (
                        <div key={store} className="mb-4">
                          <p className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-slate-400">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {store}
                          </p>
                          {Object.entries(brands).map(([brand, qas]) => (
                            <div key={brand} className="mb-3 bg-slate-50 rounded-lg p-3">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{brand}</p>
                              <div className="space-y-2">
                                {qas.map((qa, j) => (
                                  <div key={j}>
                                    <p className="text-[10px] text-slate-400 mb-0.5">{qa.question}</p>
                                    <p className="text-xs text-slate-700 leading-relaxed">{qa.answer}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {!panelLoading && !panelFeedback && (
                    <p className="text-xs text-slate-400 italic text-center py-6">Could not load report data.</p>
                  )}
                </>
              )}

            </div>
          </div>
        </>
      )}
    </>
  );
}
