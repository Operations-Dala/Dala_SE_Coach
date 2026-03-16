'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';

const PERF_META = {
  elite:         { label: 'Elite',         color: 'text-green-600',  bg: 'bg-green-50 border-green-200',  dot: 'bg-green-500'  },
  strong:        { label: 'Strong',        color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-500'   },
  average:       { label: 'Average',       color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200',dot: 'bg-yellow-500' },
  below_average: { label: 'Below Avg',     color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200',dot: 'bg-orange-500' },
  critical:      { label: 'Critical',      color: 'text-red-600',    bg: 'bg-red-50 border-red-200',      dot: 'bg-red-500'    },
};

const TREND_META = {
  improving: { label: '↑ Improving', color: 'text-green-600' },
  declining: { label: '↓ Declining', color: 'text-red-500'   },
  flat:      { label: '→ Flat',      color: 'text-slate-500' },
  volatile:  { label: '~ Volatile',  color: 'text-yellow-600'},
};

const DEBT_META = {
  clean:    { label: 'Clean',    color: 'text-green-600' },
  moderate: { label: 'Moderate', color: 'text-yellow-600'},
  high:     { label: 'High',     color: 'text-orange-600'},
  critical: { label: 'Critical', color: 'text-red-600'  },
};

const URGENCY_META = {
  developmental: { label: 'Developmental', color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  dot: 'bg-green-500',  desc: 'Performing well — focus on stretch goals and leadership growth.' },
  coaching:      { label: 'Coaching',      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-500',   desc: 'Stable but gaps exist — identify the lever and adjust approach.' },
  corrective:    { label: 'Corrective',    color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200',dot: 'bg-orange-500', desc: 'Declining trend — explicit correction needed. 2-week checkpoint.' },
  intervention:  { label: 'Intervention',  color: 'text-red-700',    bg: 'bg-red-50 border-red-200',      dot: 'bg-red-500',    desc: 'Critical — formal escalation required. Hard deadlines. Document.' },
};

const STATE_META = {
  high_accelerating:         { label: 'High — Accelerating',   color: 'text-green-600'  },
  high_plateauing:           { label: 'High — Plateauing',     color: 'text-blue-600'   },
  solid_consistent:          { label: 'Solid — Consistent',    color: 'text-slate-600'  },
  underperforming_declining: { label: 'Underperforming — Declining', color: 'text-orange-600' },
  underperforming_critical:  { label: 'Underperforming — Critical',  color: 'text-red-600'    },
  new_hire_onboarding:       { label: 'New Hire — Onboarding', color: 'text-purple-600' },
};

const DIRECTNESS_META = {
  diplomatic: { label: 'Diplomatic', desc: 'Leads with care and context — psychological safety first.' },
  balanced:   { label: 'Balanced',   desc: 'Professional, clear, respectful — the default middle ground.' },
  direct:     { label: 'Direct',     desc: 'Efficient, no padding — states the issue and expectation.' },
  blunt:      { label: 'Blunt',      desc: 'No framing — conclusion first, every time.' },
};

const WARMTH_META = {
  formal:       { label: 'Formal',       desc: 'Efficient and structured — no unnecessary social language.' },
  professional: { label: 'Professional', desc: 'Respectful and clear — neutral default tone.' },
  warm:         { label: 'Warm',         desc: 'Acknowledges the person before the performance.' },
  relational:   { label: 'Relational',   desc: 'Conversational and team-oriented — starts with recognition.' },
};

const POSITION_LABELS = {
  corporate_se:    'Corporate SE',
  senior_se:       'Senior SE',
  sales_executive: 'Sales Executive',
  junior_se:       'Junior SE',
  trial:           'Trial',
};

export default function CoachPage() {
  return (
    <Suspense fallback={<p className="text-slate-400 text-sm">Loading coach summaries...</p>}>
      <CoachPageContent />
    </Suspense>
  );
}

function CoachPageContent() {
  const searchParams  = useSearchParams();
  const targetSE      = searchParams.get('se') ? decodeURIComponent(searchParams.get('se')) : null;
  const targetRef     = useRef(null);

  const [summaries,   setSummaries]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState(targetSE);
  const [activeTab,   setActiveTab]   = useState({});
  const [zoneFilter,  setZoneFilter]  = useState('all');
  const [perfFilter,  setPerfFilter]  = useState('all');
  const [generating,  setGenerating]  = useState(null);
  const [genMsg,      setGenMsg]      = useState(null);

  function getTab(seName) { return activeTab[seName] || 'message'; }
  function setTab(seName, tab) { setActiveTab(prev => ({ ...prev, [seName]: tab })); }

  function handleExportExcel() {
    const wb = XLSX.utils.book_new();
    const rows = summaries.map(s => ({
      Name: s.se_name,
      Zone: s.zone || '',
      'Performance Level': s.performance_level || '',
      'Urgency Level': s.urgency_level || '',
      Trend: s.score_trend || '',
      'Debt Status': s.debt_status || '',
      'Latest Score': s.latest_score ?? '',
      'Last Coached': s.latest_coach_date || '',
      'Performance State': s.performance_state || '',
      Strengths: (s.key_strengths || []).join('; '),
      'Key Gaps': (s.key_gaps || []).join('; '),
      'Behavioral Patterns': (s.behavioral_patterns || []).join('; '),
      'Coaching Message': s.coaching_message || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Coach Summary');
    XLSX.writeFile(wb, `coach-summary_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleGenerate(seName, date) {
    setGenerating(seName);
    setGenMsg(null);
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, se_name: seName }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setGenMsg({ type: 'success', text: `Coaching generated for ${seName}.` });
      fetch('/api/coach/summaries')
        .then(r => r.json())
        .then(data => setSummaries(Array.isArray(data) ? data : []));
    } catch (err) {
      setGenMsg({ type: 'error', text: err.message });
    }
    setGenerating(null);
  }

  useEffect(() => {
    fetch('/api/coach/summaries')
      .then(r => r.json())
      .then(data => { setSummaries(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && targetSE && targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading, targetSE]);

  const zones      = ['all', ...new Set(summaries.map(s => s.zone).filter(Boolean))].sort();
  const perfLevels = ['all', 'elite', 'strong', 'average', 'below_average', 'critical'];

  const filtered = summaries.filter(s => {
    if (zoneFilter !== 'all' && s.zone !== zoneFilter) return false;
    if (perfFilter !== 'all' && s.performance_level !== perfFilter) return false;
    return true;
  });

  const perfOrder = { critical: 0, below_average: 1, average: 2, strong: 3, elite: 4 };
  const sorted = [...filtered].sort((a, b) => {
    const aP = perfOrder[a.performance_level] ?? 5;
    const bP = perfOrder[b.performance_level] ?? 5;
    if (aP !== bP) return aP - bP;
    return a.se_name.localeCompare(b.se_name);
  });

  const coached   = summaries.filter(s => s.latest_coach_date).length;
  const uncoached = summaries.length - coached;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Coach Assessment</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Personalized AI coach ratings for each SE — based on performance, behaviour, and debt analysis
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span><span className="font-semibold text-slate-700">{coached}</span> coached</span>
          {uncoached > 0 && <span className="text-orange-500"><span className="font-semibold">{uncoached}</span> pending coaching</span>}
          {summaries.length > 0 && (
            <button onClick={handleExportExcel}
              className="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium px-3 py-1 rounded transition-colors">
              ↓ Excel
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest mr-1">Zone</span>
          {zones.map(z => (
            <button key={z} onClick={() => setZoneFilter(z)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${zoneFilter === z ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
              {z === 'all' ? 'All' : z}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-4">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest mr-1">Level</span>
          {perfLevels.map(p => (
            <button key={p} onClick={() => setPerfFilter(p)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${perfFilter === p ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
              {p === 'all' ? 'All' : (PERF_META[p]?.label || p)}
            </button>
          ))}
        </div>
      </div>

      {genMsg && (
        <div className={`px-4 py-3 rounded text-sm ${
          genMsg.type === 'error'
            ? 'bg-red-50 border border-red-200 text-red-600'
            : 'bg-green-50 border border-green-200 text-green-700'
        }`}>{genMsg.text}</div>
      )}

      {loading && <p className="text-slate-400 text-sm">Loading coach summaries…</p>}

      {!loading && sorted.length === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-lg">
          <p className="text-slate-500 font-medium mb-1">No coach data yet</p>
          <p className="text-slate-400 text-xs">Generate coaching from the Home page first.</p>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map(se => {
            const perf     = PERF_META[se.performance_level];
            const trend    = TREND_META[se.score_trend];
            const debt     = DEBT_META[se.debt_status];
            const urgency  = URGENCY_META[se.urgency_level];
            const isOpen   = expanded === se.se_name;
            const hasCoaching = !!se.latest_coach_date;
            const tab      = getTab(se.se_name);

            return (
              <div key={se.se_name}
                ref={se.se_name === targetSE ? targetRef : null}
                className={`bg-white border rounded-lg overflow-hidden transition-all ${perf ? perf.bg : 'border-slate-200'} ${se.se_name === targetSE ? 'ring-2 ring-red-400' : ''}`}>

                {/* Row */}
                <div className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : se.se_name)}>

                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${perf ? perf.dot : 'bg-slate-300'}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm">{se.se_name}</span>
                      {se.position && (
                        <span className="text-[10px] text-slate-400">{POSITION_LABELS[se.position] || se.position}</span>
                      )}
                      {se.zone && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{se.zone}</span>
                      )}
                      {se.urgency_level && urgency && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${urgency.bg} ${urgency.color}`}>
                          {urgency.label}
                        </span>
                      )}
                    </div>
                    {se.latest_coach_date && (
                      <p className="text-[10px] text-slate-400 mt-0.5">Last coached: {se.latest_coach_date}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    {hasCoaching ? (
                      <>
                        <div className="text-center hidden sm:block">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Level</p>
                          <p className={`text-xs font-semibold mt-0.5 ${perf ? perf.color : 'text-slate-400'}`}>
                            {perf ? perf.label : '—'}
                          </p>
                        </div>
                        <div className="text-center hidden sm:block">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Trend</p>
                          <p className={`text-xs font-medium mt-0.5 ${trend ? trend.color : 'text-slate-400'}`}>
                            {trend ? trend.label : '—'}
                          </p>
                        </div>
                        <div className="text-center hidden sm:block">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Debt</p>
                          <p className={`text-xs font-medium mt-0.5 ${debt ? debt.color : 'text-slate-400'}`}>
                            {debt ? debt.label : '—'}
                          </p>
                        </div>
                        {se.latest_score != null && (
                          <div className="text-center">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Score</p>
                            <p className={`text-sm font-bold mt-0.5 ${se.latest_score >= 75 ? 'text-green-600' : se.latest_score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {Number(se.latest_score).toFixed(1)}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No coaching yet</span>
                    )}
                    <span className="text-slate-400 text-xs ml-2">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (() => {
                  const detailDate = se.latest_score_date || se.latest_coach_date || yesterdayStr();
                  const isGen = generating === se.se_name;
                  return (
                    <div className="border-t border-slate-200">
                      {hasCoaching ? (
                        <>
                          {/* Tab bar */}
                          <div className="flex border-b border-slate-200 px-5">
                            {[
                              { key: 'message',  label: 'Message'  },
                              { key: 'analysis', label: 'Analysis' },
                              { key: 'urgency',  label: 'Urgency'  },
                            ].map(t => (
                              <button
                                key={t.key}
                                onClick={e => { e.stopPropagation(); setTab(se.se_name, t.key); }}
                                className={`text-xs px-4 py-2.5 border-b-2 transition-colors ${
                                  tab === t.key
                                    ? 'border-red-500 text-red-600 font-semibold'
                                    : 'border-transparent text-slate-400 hover:text-slate-700'
                                }`}>
                                {t.label}
                                {t.key === 'urgency' && se.urgency_escalated && (
                                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-orange-400 align-middle" />
                                )}
                              </button>
                            ))}
                          </div>

                          {/* Tab: Message */}
                          {tab === 'message' && (
                            <div className="px-5 py-4">
                              {se.coaching_message ? (
                                <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap border border-slate-200">
                                  {se.coaching_message}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-400 italic">No coaching message available.</p>
                              )}
                            </div>
                          )}

                          {/* Tab: Analysis */}
                          {tab === 'analysis' && (
                            <div className="px-5 py-4 space-y-4">
                              {(se.key_strengths?.length > 0 || se.key_gaps?.length > 0) && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  {se.key_strengths?.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-semibold text-green-600 uppercase tracking-widest mb-2">Strengths</p>
                                      <ul className="space-y-1">
                                        {se.key_strengths.slice(0, 3).map((s, i) => (
                                          <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                                            <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>{s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {se.key_gaps?.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-widest mb-2">Key Gaps</p>
                                      <ul className="space-y-1">
                                        {se.key_gaps.slice(0, 3).map((g, i) => (
                                          <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                                            <span className="text-red-400 mt-0.5 flex-shrink-0">!</span>{g}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                              {se.behavioral_patterns?.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Behavioral Patterns</p>
                                  <ul className="space-y-1">
                                    {se.behavioral_patterns.slice(0, 4).map((p, i) => (
                                      <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                                        <span className="text-slate-400 mt-0.5 flex-shrink-0">⟳</span>{p}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {se.performance_state && STATE_META[se.performance_state] && (
                                <div className="flex items-center gap-2 pt-1">
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Performance State:</p>
                                  <p className={`text-xs font-semibold ${STATE_META[se.performance_state].color}`}>
                                    {STATE_META[se.performance_state].label}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Tab: Urgency */}
                          {tab === 'urgency' && (
                            <div className="px-5 py-4 space-y-4">
                              {se.urgency_level ? (
                                <>
                                  {/* Current level card */}
                                  <div className={`rounded-lg border p-4 ${urgency ? urgency.bg : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${urgency ? urgency.dot : 'bg-slate-300'}`} />
                                      <p className={`text-sm font-bold ${urgency ? urgency.color : 'text-slate-600'}`}>
                                        {urgency ? urgency.label : se.urgency_level}
                                      </p>
                                      {se.urgency_escalated && (
                                        <span className="text-[10px] bg-orange-100 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded font-medium ml-1">
                                          Escalated this session
                                        </span>
                                      )}
                                    </div>
                                    {urgency?.desc && (
                                      <p className="text-xs text-slate-600 pl-4">{urgency.desc}</p>
                                    )}
                                    <div className="flex gap-6 mt-3 pl-4">
                                      {se.urgency_sessions != null && (
                                        <div>
                                          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Sessions at level</p>
                                          <p className="text-sm font-bold text-slate-700">{se.urgency_sessions}</p>
                                        </div>
                                      )}
                                      {se.urgency_started && (
                                        <div>
                                          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Since</p>
                                          <p className="text-sm font-bold text-slate-700">{se.urgency_started}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Tone axes */}
                                  {(se.tone_directness || se.tone_warmth) && (
                                    <div>
                                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Tone Axes Applied</p>
                                      <div className="grid grid-cols-2 gap-3">
                                        {se.tone_directness && DIRECTNESS_META[se.tone_directness] && (
                                          <div className="bg-slate-50 border border-slate-200 rounded p-3">
                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Directness</p>
                                            <p className="text-xs font-semibold text-slate-700">{DIRECTNESS_META[se.tone_directness].label}</p>
                                            <p className="text-[10px] text-slate-500 mt-1">{DIRECTNESS_META[se.tone_directness].desc}</p>
                                          </div>
                                        )}
                                        {se.tone_warmth && WARMTH_META[se.tone_warmth] && (
                                          <div className="bg-slate-50 border border-slate-200 rounded p-3">
                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Warmth</p>
                                            <p className="text-xs font-semibold text-slate-700">{WARMTH_META[se.tone_warmth].label}</p>
                                            <p className="text-[10px] text-slate-500 mt-1">{WARMTH_META[se.tone_warmth].desc}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Urgency history */}
                                  {se.urgency_history?.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Urgency History</p>
                                      <div className="space-y-1.5">
                                        {[...se.urgency_history].reverse().map((h, i) => {
                                          const hMeta = URGENCY_META[h.level];
                                          return (
                                            <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hMeta ? hMeta.dot : 'bg-slate-300'}`} />
                                              <span className={`font-medium ${hMeta ? hMeta.color : ''}`}>{hMeta?.label || h.level}</span>
                                              <span className="text-slate-300">·</span>
                                              <span>{h.sessions} session{h.sessions !== 1 ? 's' : ''}</span>
                                              {h.ended && <><span className="text-slate-300">·</span><span className="text-slate-400">ended {h.ended}</span></>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className="text-sm text-slate-400 italic">
                                  Urgency state not yet established — generate coaching to initialise.
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="px-5 py-4">
                          <p className="text-sm text-slate-400 italic">
                            No coaching has been generated for this SE yet.
                          </p>
                        </div>
                      )}

                      {/* Footer actions */}
                      <div className="flex items-center gap-3 px-5 py-3 border-t border-slate-100">
                        <a
                          href={`/se/${encodeURIComponent(se.se_name)}?date=${detailDate}`}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          onClick={e => e.stopPropagation()}
                        >
                          View Full Report →
                        </a>
                        <button
                          onClick={e => { e.stopPropagation(); handleGenerate(se.se_name, detailDate); }}
                          disabled={isGen}
                          className="ml-auto text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors"
                        >
                          {isGen ? 'Generating…' : hasCoaching ? 'Regenerate Coaching' : 'Generate Coaching'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
