'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, LineChart, Line,
  ComposedChart,
} from 'recharts';

const ZONE_COLORS = [
  '#f87171', '#34d399', '#60a5fa', '#fb923c', '#a78bfa',
  '#f472b6', '#facc15', '#2dd4bf', '#818cf8', '#4ade80',
];

const DATE_RANGE_PRESETS = [
  { label: '7D',  getDays: () => 7 },
  { label: '2W',  getDays: () => 14 },
  { label: '1M',  getDays: () => 30 },
  { label: 'Q1',  getDays: () => quarterDays(1) },
  { label: 'Q2',  getDays: () => quarterDays(2) },
  { label: 'Q3',  getDays: () => quarterDays(3) },
  { label: 'Q4',  getDays: () => quarterDays(4) },
  { label: 'YTD', getDays: () => ytdDays() },
];

const SECTIONS = [
  { key: 'kpi',          label: 'KPI Cards' },
  { key: 'ordersChart',  label: 'Orders & Value' },
  { key: 'debtChart',    label: 'Debt Trend' },
  { key: 'brandOrders',  label: 'Brand Orders' },
  { key: 'dailyBrands',  label: 'Daily Brands' },
  { key: 'financial',    label: 'Financial' },
  { key: 'brandIssues',  label: 'Brand Issues' },
];

export default function SEAnalyticsPage() {
  const [selectedRange, setSelectedRange] = useState(DATE_RANGE_PRESETS[2]); // default: 1M
  const [trends,        setTrends]        = useState(null);
  const [loading,       setLoading]       = useState(true);

  const [brandOrders,   setBrandOrders]   = useState([]);
  const [brandIssues,   setBrandIssues]   = useState([]);
  const [brandPartners, setBrandPartners] = useState([]);
  const [roster,        setRoster]        = useState([]);
  const [extraLoading,  setExtraLoading]  = useState(true);

  // Visualization settings
  const [ordersChartType,   setOrdersChartType]   = useState('area');   // area | bar | line
  const [ordersMetric,      setOrdersMetric]       = useState('both');   // both | orders | value
  const [debtChartType,     setDebtChartType]      = useState('bar');    // bar | line
  const [brandSortBy,       setBrandSortBy]        = useState('count');  // count | alpha
  const [hiddenSections,    setHiddenSections]     = useState(new Set());

  // Financial overview state
  const [financialData,     setFinancialData]      = useState(null);
  const [inflowData,        setInflowData]         = useState(null);
  const [financialLoading,  setFinancialLoading]   = useState(true);

  // Daily brand chart state
  const [dailyBrandDate,    setDailyBrandDate]     = useState(todayStr());
  const [dailyBrandData,    setDailyBrandData]     = useState(null);
  const [dailyBrandLoading, setDailyBrandLoading]  = useState(false);

  const days = useMemo(() => selectedRange.getDays(), [selectedRange]);

  // Fetch trends when range changes
  useEffect(() => {
    setLoading(true);
    fetch(`/api/trends?days=${days}`)
      .then(r => r.json())
      .then(data => { setTrends(data?.daily ? data : null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  // Fetch financial data when range changes
  useEffect(() => {
    setFinancialLoading(true);
    Promise.all([
      fetch(`/api/analytics/expenses?days=${days}`).then(r => r.json()),
      fetch(`/api/analytics/inflow?days=${days}`).then(r => r.json()),
    ]).then(([expData, inflData]) => {
      setFinancialData(expData?.daily ? expData : null);
      setInflowData(inflData?.daily ? inflData : null);
      setFinancialLoading(false);
    }).catch(() => setFinancialLoading(false));
  }, [days]);

  // Fetch daily brand data when date changes
  useEffect(() => {
    if (!dailyBrandDate) return;
    setDailyBrandLoading(true);
    fetch(`/api/analytics/brand-orders/daily?date=${dailyBrandDate}`)
      .then(r => r.json())
      .then(data => { setDailyBrandData(data); setDailyBrandLoading(false); })
      .catch(() => setDailyBrandLoading(false));
  }, [dailyBrandDate]);

  // Fetch brand + roster data when range changes
  useEffect(() => {
    setExtraLoading(true);
    Promise.all([
      fetch(`/api/analytics/brand-orders?days=${days}`).then(r => r.json()),
      fetch(`/api/feedback/intelligence?days=${days}`).then(r => r.json()),
      fetch('/api/roster').then(r => r.json()),
      fetch('/api/settings/brands').then(r => r.json()),
    ]).then(([orderData, intel, rosterData, partnerData]) => {
      setBrandOrders(Array.isArray(orderData) ? orderData : []);
      setBrandIssues(intel?.brand_summary || []);
      setRoster(Array.isArray(rosterData) ? rosterData : []);
      setBrandPartners(Array.isArray(partnerData) ? partnerData : []);
      setExtraLoading(false);
    }).catch(() => setExtraLoading(false));
  }, [days]);

  const daily = trends?.daily || [];
  const debt  = trends?.debt  || [];

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalOrders = daily.reduce((s, d) => s + (d.orders_generated || 0), 0);
  const totalValue  = daily.reduce((s, d) => s + (d.value_of_orders  || 0), 0);
  const avgDaily    = daily.length ? Math.round(totalOrders / daily.length) : 0;

  const latestDebt = debt.length ? debt[debt.length - 1]?.total_debt : null;
  const prevDebt   = debt.length > 1 ? debt[debt.length - 2]?.total_debt : null;
  const debtDelta  = latestDebt != null && prevDebt != null ? latestDebt - prevDebt : null;

  const mid = Math.floor(daily.length / 2);
  const firstOrders  = mid ? daily.slice(0, mid).reduce((s, d) => s + d.orders_generated, 0) / mid : 0;
  const secondOrders = (daily.length - mid) ? daily.slice(mid).reduce((s, d) => s + d.orders_generated, 0) / (daily.length - mid) : 0;
  const firstValue   = mid ? daily.slice(0, mid).reduce((s, d) => s + d.value_of_orders, 0) / mid : 0;
  const secondValue  = (daily.length - mid) ? daily.slice(mid).reduce((s, d) => s + d.value_of_orders, 0) / (daily.length - mid) : 0;
  const ordersTrend  = daily.length > 2 ? (secondOrders > firstOrders * 1.02 ? 'up' : secondOrders < firstOrders * 0.98 ? 'down' : 'flat') : 'flat';
  const valueTrend   = daily.length > 2 ? (secondValue  > firstValue  * 1.02 ? 'up' : secondValue  < firstValue  * 0.98 ? 'down' : 'flat') : 'flat';

  // ── Debt by zone pie ───────────────────────────────────────────────────────
  const latestByZone = debt.length ? (debt[debt.length - 1]?.by_zone || {}) : {};
  const pieData = Object.entries(latestByZone)
    .map(([zone, amt]) => ({ name: zone, value: amt }))
    .sort((a, b) => b.value - a.value);

  const sesByZone = {};
  for (const r of roster) {
    const z = r.zone || 'Unassigned';
    if (!sesByZone[z]) sesByZone[z] = [];
    sesByZone[z].push(r.se_name);
  }

  // ── Brand charts ───────────────────────────────────────────────────────────
  const NON_BRANDS = ['credit note', 'credit', 'n/a', 'unknown', 'other', ''];
  const orderCountMap = {};
  for (const b of brandOrders) {
    const key = (b.brand || '').toLowerCase().trim();
    if (key) orderCountMap[key] = b.count || 0;
  }
  let colorIdx = 0;
  const brandOrderChartData = brandPartners
    .filter(p => !NON_BRANDS.includes((p.brand_name || '').toLowerCase().trim()))
    .map(p => {
      const count = orderCountMap[(p.brand_name || '').toLowerCase().trim()] || 0;
      return { brand: p.brand_name, count, active: count > 0 };
    })
    .sort((a, b) => brandSortBy === 'alpha'
      ? a.brand.localeCompare(b.brand) : b.count - a.count)
    .map(b => ({ ...b, color: b.active ? ZONE_COLORS[colorIdx++ % ZONE_COLORS.length] : '#e2e8f0' }));

  const ISSUE_TYPES = ['stock_out', 'quality', 'pricing', 'competitor_activity', 'retailer_complaint', 'other'];
  const brandIssueChartData = brandIssues
    .map(b => {
      const issueCount = ISSUE_TYPES.reduce((s, t) => s + (b.issue_types?.[t] || 0), 0);
      return { brand: b.brand, issueCount };
    })
    .filter(b => b.issueCount > 0 && b.brand && !NON_BRANDS.includes(b.brand.toLowerCase().trim()))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 15);

  function toggleSection(key) {
    setHiddenSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  const visible = (key) => !hiddenSections.has(key);

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">SE Analytics</h1>
            <p className="text-slate-500 text-xs mt-0.5">Performance trends, outstanding debt, and brand activity</p>
          </div>

          {/* Section visibility toggles */}
          <div className="flex items-center gap-1 flex-wrap">
            {SECTIONS.map(s => (
              <button key={s.key} onClick={() => toggleSection(s.key)}
                className={`text-[10px] px-2.5 py-1 rounded border transition-colors ${
                  visible(s.key)
                    ? 'bg-slate-800 text-slate-200 border-slate-700'
                    : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date range preset bar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-400 mr-1">Range:</span>
          {DATE_RANGE_PRESETS.map(preset => (
            <button key={preset.label} onClick={() => setSelectedRange(preset)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                selectedRange?.label === preset.label
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-900 hover:border-slate-300'
              }`}>
              {preset.label}
            </button>
          ))}
          <span className="text-xs text-slate-400 ml-1">— {days} days</span>
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading trends…</div>
      )}

      {!loading && daily.length === 0 && debt.length === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-lg">
          <p className="text-slate-500 font-medium mb-1">No trend data yet</p>
          <p className="text-slate-400 text-xs">Upload daily PepUp files to start building performance history.</p>
        </div>
      )}

      {!loading && (daily.length > 0 || debt.length > 0) && (
        <div className="space-y-6">

          {/* ── KPI Stat Cards ──────────────────────────────────────────────── */}
          {daily.length > 0 && visible('kpi') && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <StatCard
                label={`Total Orders (${selectedRange.label})`}
                value={totalOrders.toLocaleString()}
                trend={ordersTrend}
                trendLabel={`${Math.abs(Math.round(((secondOrders - firstOrders) / (firstOrders || 1)) * 100))}% vs first half`}
              />
              <StatCard
                label={`Total Value (${selectedRange.label})`}
                value={`₦${(totalValue / 1_000_000).toFixed(1)}M`}
                trend={valueTrend}
                trendLabel={`${Math.abs(Math.round(((secondValue - firstValue) / (firstValue || 1)) * 100))}% vs first half`}
                valueColor="text-red-500"
              />
              <StatCard label="Avg Daily Orders" value={avgDaily} />
              {latestDebt != null && (
                <StatCard
                  label="Latest Team Debt"
                  value={`₦${(latestDebt / 1_000_000).toFixed(2)}M`}
                  trend={debtDelta != null ? (debtDelta > 0 ? 'up' : debtDelta < 0 ? 'down' : 'flat') : undefined}
                  trendLabel={debtDelta != null ? `₦${Math.abs(debtDelta / 1_000_000).toFixed(2)}M vs prev week` : undefined}
                  invertTrend
                  valueColor="text-orange-500"
                />
              )}
            </div>
          )}

          {/* ── Orders & Value Chart ─────────────────────────────────────────── */}
          {daily.length > 1 && visible('ordersChart') && (
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Daily Orders &amp; Value — {selectedRange.label}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Metric toggle */}
                  <div className="flex rounded overflow-hidden border border-slate-200">
                    {[['both', 'Both'], ['orders', 'Orders'], ['value', 'Value']].map(([v, l]) => (
                      <button key={v} onClick={() => setOrdersMetric(v)}
                        className={`text-[10px] px-2.5 py-1 transition-colors ${ordersMetric === v ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {/* Chart type toggle */}
                  <div className="flex rounded overflow-hidden border border-slate-200">
                    {[['area', 'Area'], ['bar', 'Bar'], ['line', 'Line']].map(([v, l]) => (
                      <button key={v} onClick={() => setOrdersChartType(v)}
                        className={`text-[10px] px-2.5 py-1 transition-colors ${ordersChartType === v ? 'bg-slate-700 text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <OrdersValueChart data={daily} chartType={ordersChartType} metric={ordersMetric} />
            </div>
          )}

          {/* ── Debt Charts ─────────────────────────────────────────────────── */}
          {debt.length > 0 && visible('debtChart') && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

              {/* Debt over time */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                      Outstanding Team Debt — weekly
                    </p>
                    {debtDelta != null && (
                      <span className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${debtDelta > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {debtDelta > 0 ? '▲' : '▼'} ₦{(Math.abs(debtDelta) / 1_000_000).toFixed(2)}M week-on-week
                      </span>
                    )}
                  </div>
                  <div className="flex rounded overflow-hidden border border-slate-200">
                    {[['bar', 'Bar'], ['line', 'Line']].map(([v, l]) => (
                      <button key={v} onClick={() => setDebtChartType(v)}
                        className={`text-[10px] px-2.5 py-1 transition-colors ${debtChartType === v ? 'bg-slate-700 text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  {debtChartType === 'bar' ? (
                    <BarChart data={debt} margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="week_date" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `₦${(v / 1_000_000).toFixed(1)}M`} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#475569' }}
                        formatter={v => [`₦${Number(v).toLocaleString()}`, 'Team Debt']} />
                      <Bar dataKey="total_debt" fill="#fb923c" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <LineChart data={debt} margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="week_date" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `₦${(v / 1_000_000).toFixed(1)}M`} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#475569' }}
                        formatter={v => [`₦${Number(v).toLocaleString()}`, 'Team Debt']} />
                      <Line type="monotone" dataKey="total_debt" stroke="#fb923c" strokeWidth={2} dot={{ r: 3, fill: '#fb923c' }} activeDot={{ r: 5 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Debt by Zone Pie */}
              {pieData.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
                    Debt by Zone — latest week
                  </p>
                  <p className="text-[10px] text-slate-400 mb-4">
                    Total: ₦{(latestDebt / 1_000_000).toFixed(2)}M
                  </p>
                  <div className="flex gap-4 items-center">
                    <ResponsiveContainer width="55%" height={200}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                          {pieData.map((entry, i) => (
                            <Cell key={entry.name} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }}
                          formatter={(val, name) => [`₦${Number(val).toLocaleString()}`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2 overflow-y-auto max-h-[200px]">
                      {pieData.map((z, i) => {
                        const ses = sesByZone[z.name] || [];
                        const pct = latestDebt ? Math.round((z.value / latestDebt) * 100) : 0;
                        return (
                          <div key={z.name}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                              <span className="text-xs font-semibold text-slate-700 truncate">{z.name}</span>
                              <span className="text-[10px] text-slate-400 ml-auto">{pct}%</span>
                            </div>
                            <p className="text-[10px] text-slate-400 pl-3.5">
                              ₦{(z.value / 1_000_000).toFixed(2)}M
                              {ses.length > 0 && ` · ${ses.slice(0, 3).map(s => s.split(' ')[0]).join(', ')}${ses.length > 3 ? ` +${ses.length - 3}` : ''}`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ── Brand Orders ─────────────────────────────────────────────────────── */}
      {!extraLoading && brandOrderChartData.length > 0 && visible('brandOrders') && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Brand Orders — {selectedRange.label}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                All brand partners — count = SE-days that brand was ordered (grey = zero orders this period)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-3 text-[10px] text-slate-400 mr-2">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />Active</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" />No orders</span>
              </div>
              {/* Sort toggle */}
              <div className="flex rounded overflow-hidden border border-slate-200">
                {[['count', 'By Count'], ['alpha', 'A–Z']].map(([v, l]) => (
                  <button key={v} onClick={() => setBrandSortBy(v)}
                    className={`text-[10px] px-2.5 py-1 transition-colors ${brandSortBy === v ? 'bg-slate-700 text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={Math.max(260, brandOrderChartData.length * 34)}>
              <BarChart data={brandOrderChartData} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="brand" tick={{ fill: '#64748b', fontSize: 10 }} width={150} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, _name, props) => [
                    v > 0 ? `${v} SE-days ordered` : 'No orders recorded',
                    props.payload?.brand,
                  ]} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {brandOrderChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Daily Brand Chart ────────────────────────────────────────────────── */}
      {visible('dailyBrands') && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Brand Coverage — Single Day
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                How many SEs ordered each brand on the selected date
              </p>
            </div>
            <input type="date" value={dailyBrandDate} onChange={e => setDailyBrandDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm text-slate-900" />
          </div>
          {dailyBrandLoading && <p className="text-xs text-slate-400 py-6 text-center">Loading…</p>}
          {!dailyBrandLoading && dailyBrandData && dailyBrandData.brands?.length > 0 && (
            <>
              <p className="text-[10px] text-slate-400 mb-3">
                {dailyBrandData.date} · {dailyBrandData.total_ses} SE{dailyBrandData.total_ses !== 1 ? 's' : ''} reporting
              </p>
              <ResponsiveContainer width="100%" height={Math.max(260, dailyBrandData.brands.length * 32)}>
                <BarChart data={dailyBrandData.brands} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false}
                    domain={[0, dailyBrandData.total_ses || 'auto']} />
                  <YAxis type="category" dataKey="brand" tick={{ fill: '#64748b', fontSize: 10 }} width={155} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                    formatter={(v, _n, props) => [
                      `${v} of ${dailyBrandData.total_ses} SEs`,
                      props.payload?.brand,
                    ]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {dailyBrandData.brands.map((entry, i) => (
                      <Cell key={i} fill={entry.count > 0 ? ZONE_COLORS[i % ZONE_COLORS.length] : '#e2e8f0'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
          {!dailyBrandLoading && (!dailyBrandData || dailyBrandData.brands?.length === 0) && (
            <p className="text-xs text-slate-400 py-6 text-center">No data for this date.</p>
          )}
        </div>
      )}

      {/* ── Financial Overview ───────────────────────────────────────────────── */}
      {visible('financial') && !financialLoading && (financialData || inflowData) && (
        <div className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <StatCard
              label={`Team Expenses — This Week`}
              value={`₦${Number(financialData?.team_weekly_total || 0).toLocaleString()}`}
              valueColor="text-orange-600"
            />
            <StatCard
              label={`Team Inflow — This Week`}
              value={`₦${Number(inflowData?.team_weekly_total || 0).toLocaleString()}`}
              valueColor="text-green-600"
            />
            <StatCard
              label="SEs Over Budget"
              value={financialData?.over_budget_count ?? 0}
              valueColor={financialData?.over_budget_count > 0 ? 'text-red-600' : 'text-slate-900'}
            />
          </div>

          {/* Expense & Inflow charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {financialData?.daily?.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                  Daily Expenses — {selectedRange.label}
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={financialData.daily} margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
                    <defs>
                      <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#fb923c" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#fb923c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                      formatter={v => [`₦${Number(v).toLocaleString()}`, 'Team Expenses']} />
                    <Area type="monotone" dataKey="total" stroke="#fb923c" strokeWidth={2} fill="url(#expGrad)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
                {financialData.per_se_weekly?.filter(s => s.over_budget).length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-semibold text-red-600 mb-1.5">Over Budget This Week</p>
                    <div className="space-y-1">
                      {financialData.per_se_weekly.filter(s => s.over_budget).map(s => (
                        <div key={s.se_name} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-700">{s.se_name} <span className="text-slate-400">({s.zone})</span></span>
                          <span className="text-red-600 font-medium">₦{Number(s.weekly_total).toLocaleString()} / ₦{Number(s.budget).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {inflowData?.daily?.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                  Daily Inflow — {selectedRange.label}
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={inflowData.daily} margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
                    <defs>
                      <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#34d399" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                      formatter={v => [`₦${Number(v).toLocaleString()}`, 'Team Inflow']} />
                    <Area type="monotone" dataKey="total" stroke="#34d399" strokeWidth={2} fill="url(#inflowGrad)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
                {inflowData.inflow_alerts?.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-semibold text-amber-600 mb-1.5">2-Day Zero Inflow Alert</p>
                    <div className="space-y-1">
                      {inflowData.inflow_alerts.map(s => (
                        <div key={s.se_name} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-700">{s.se_name} <span className="text-slate-400">({s.zone})</span></span>
                          <span className="text-amber-600 font-medium">{s.days_zero} days no inflow</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Brand Issues ─────────────────────────────────────────────────────── */}
      {!extraLoading && brandIssueChartData.length > 0 && visible('brandIssues') && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
            Brands with Most Reported Issues — {selectedRange.label}
          </p>
          <p className="text-[10px] text-slate-400 mb-5">
            AI-extracted field complaints: stock-outs, quality, pricing, competitor activity, retailer issues
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={brandIssueChartData} margin={{ top: 4, right: 20, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
              <XAxis dataKey="brand" tick={{ fill: '#64748b', fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                formatter={(v, _name, props) => [`${v} reported issues`, props.payload?.brand]} />
              <Bar dataKey="issueCount" radius={[4, 4, 0, 0]}>
                {brandIssueChartData.map((_, i) => (
                  <Cell key={i} fill={['#f87171', '#fb923c', '#fbbf24', '#f472b6', '#a78bfa'][i % 5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/* ── Orders & Value Chart (multi-type) ──────────────────────────────────────── */
function OrdersValueChart({ data, chartType, metric }) {
  const showOrders = metric === 'both' || metric === 'orders';
  const showValue  = metric === 'both' || metric === 'value';

  const commonProps = {
    data,
    margin: { top: 4, right: 20, left: 10, bottom: 4 },
  };
  const xAxis = <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={d => d.slice(5)} />;
  const yOrders = <YAxis yAxisId="orders" orientation="left"  tick={{ fill: '#64748b', fontSize: 10 }} />;
  const yValue  = <YAxis yAxisId="value"  orientation="right" tick={{ fill: '#64748b', fontSize: 10 }}
    tickFormatter={v => `₦${(v / 1_000_000).toFixed(1)}M`} />;
  const grid    = <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />;
  const tooltip = (
    <Tooltip
      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
      labelStyle={{ color: '#475569' }}
      formatter={(val, name) => name === 'value_of_orders'
        ? [`₦${Number(val).toLocaleString()}`, 'Total Value']
        : [val, 'Orders Raised']} />
  );
  const legend = (
    <Legend wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 12 }}
      formatter={v => v === 'orders_generated' ? 'Orders Raised' : 'Total Value'} />
  );

  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f87171" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#34d399" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid}{xAxis}{yOrders}{yValue}{tooltip}{legend}
          {showOrders && <Area yAxisId="orders" type="monotone" dataKey="orders_generated"
            stroke="#f87171" strokeWidth={2} fill="url(#ordersGrad)" dot={false} activeDot={{ r: 4 }} />}
          {showValue  && <Area yAxisId="value"  type="monotone" dataKey="value_of_orders"
            stroke="#34d399" strokeWidth={2} fill="url(#valueGrad)"  dot={false} activeDot={{ r: 4 }} />}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart {...commonProps}>
          {grid}{xAxis}{yOrders}{yValue}{tooltip}{legend}
          {showOrders && <Bar    yAxisId="orders" dataKey="orders_generated" fill="#f87171" radius={[3, 3, 0, 0]} />}
          {showValue  && <Line  yAxisId="value"  type="monotone" dataKey="value_of_orders"
            stroke="#34d399" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // line
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart {...commonProps}>
        {grid}{xAxis}{yOrders}{yValue}{tooltip}{legend}
        {showOrders && <Line yAxisId="orders" type="monotone" dataKey="orders_generated"
          stroke="#f87171" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
        {showValue  && <Line yAxisId="value"  type="monotone" dataKey="value_of_orders"
          stroke="#34d399" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── Stat Card ──────────────────────────────────────────────────────────────── */
function StatCard({ label, value, valueColor = 'text-slate-900', trend, trendLabel, invertTrend }) {
  const isUp      = trend === 'up';
  const isDown    = trend === 'down';
  const upColor   = invertTrend ? 'text-red-500'   : 'text-green-500';
  const downColor = invertTrend ? 'text-green-500' : 'text-red-500';

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
        {trend && trend !== 'flat' && (
          <span className={`text-base font-bold mb-0.5 leading-none ${isUp ? upColor : downColor}`}>
            {isUp ? '↑' : '↓'}
          </span>
        )}
      </div>
      {trendLabel && trend && trend !== 'flat' && (
        <p className={`text-[10px] mt-0.5 ${isUp ? upColor : downColor}`}>{trendLabel}</p>
      )}
    </div>
  );
}

/* ── Date helpers ────────────────────────────────────────────────────────────── */
function quarterDays(quarter) {
  const now   = new Date();
  const year  = now.getFullYear();
  const qStarts = [null, 0, 3, 6, 9];
  const qStart  = new Date(year, qStarts[quarter], 1);
  const qEnd    = new Date(year, qStarts[quarter] + 3, 0);
  const end     = now < qEnd ? now : qEnd;
  return Math.max(1, Math.round((end - qStart) / 86400000) + 1);
}

function ytdDays() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.max(1, Math.round((now - start) / 86400000) + 1);
}
