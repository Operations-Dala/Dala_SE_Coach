'use client';

import { useState, useEffect } from 'react';

export default function History() {
  const [dates,    setDates]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [reports,  setReports] = useState([]);
  const [loading,  setLoading] = useState(false);

  async function loadDate(date) {
    setLoading(true);
    const res  = await fetch(`/api/reports?date=${date}`);
    const data = await res.json();
    setReports(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetch('/api/reports').then(r => r.json()).then(d => {
      setDates(Array.isArray(d) ? d : []);
      if (d.length) {
        setSelected(d[0]);
        loadDate(d[0]);
      }
    });
  }, []);

  function selectDate(date) {
    setSelected(date);
    loadDate(date);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Report History</h1>
      <div className="flex gap-6">
        {/* Date list */}
        <div className="w-40 shrink-0">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Dates</p>
          <div className="space-y-1">
            {dates.map(d => (
              <button
                key={d}
                onClick={() => selectDate(d)}
                className={`w-full text-left text-sm px-3 py-1.5 rounded transition-colors ${
                  d === selected
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {d}
              </button>
            ))}
            {dates.length === 0 && <p className="text-xs text-slate-400">No reports yet</p>}
          </div>
        </div>

        {/* Reports table */}
        <div className="flex-1">
          {loading && <p className="text-slate-400 text-sm">Loading…</p>}
          {!loading && reports.length > 0 && (
            <>
              <p className="text-sm text-slate-400 mb-3">{reports.length} SEs — {selected}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase border-b border-slate-200">
                      <th className="text-left py-2 px-3">#</th>
                      <th className="text-left py-2 px-3">Name</th>
                      <th className="text-right py-2 px-3">Score</th>
                      <th className="text-right py-2 px-3">Stores</th>
                      <th className="text-right py-2 px-3">Brands</th>
                      <th className="text-right py-2 px-3">Value (₦)</th>
                      <th className="text-left py-2 px-3">Coaching</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...reports].sort((a,b) => (a.rank||99)-(b.rank||99)).map(r => (
                      <tr key={r.se_name}
                        className="border-b border-slate-200 hover:bg-slate-100/50 cursor-pointer"
                        onClick={() => window.location.href = `/se/${encodeURIComponent(r.se_name)}?date=${r.report_date}`}
                      >
                        <td className="py-2.5 px-3 text-slate-500">{r.rank}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{r.se_name}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">{Number(r.total_score).toFixed(1)}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{r.stores_visited}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{r.brands_ordered}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{Number(r.value_of_orders).toLocaleString()}</td>
                        <td className="py-2.5 px-3">
                          {r.coaching
                            ? <span className="text-xs text-green-400">Ready</span>
                            : <span className="text-xs text-slate-500">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!loading && reports.length === 0 && selected && (
            <p className="text-slate-500 text-sm">No data for {selected}.</p>
          )}
        </div>
      </div>
    </div>
  );
}
