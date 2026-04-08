'use client';

import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { STATUS_META } from '@/lib/tier-engine';

const ZONE_ORDER = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'All Corporate', 'Trial'];

const DATE_RANGE_PRESETS = [
  { label: '7D',  getDays: () => 7,  getStartDate: (d) => shiftDate(d, -6) },
  { label: '2W',  getDays: () => 14, getStartDate: (d) => shiftDate(d, -13) },
  { label: '1M',  getDays: () => 30, getStartDate: (d) => shiftDate(d, -29) },
  { label: 'Q1',  getDays: (d) => quarterDays(d, 1), getStartDate: (d) => quarterStartStr(d, 1) },
  { label: 'Q2',  getDays: (d) => quarterDays(d, 2), getStartDate: (d) => quarterStartStr(d, 2) },
  { label: 'Q3',  getDays: (d) => quarterDays(d, 3), getStartDate: (d) => quarterStartStr(d, 3) },
  { label: 'Q4',  getDays: (d) => quarterDays(d, 4), getStartDate: (d) => quarterStartStr(d, 4) },
  { label: 'YTD', getDays: (d) => ytdDays(d),        getStartDate: (d) => `${d.slice(0,4)}-01-01` },
];

export default function Dashboard() {
  const [date, setDate]               = useState(yesterdayStr());
  const [selectedRange, setSelectedRange] = useState(null);
  const [reports, setReports]         = useState([]);
  const [analytics, setAnalytics]     = useState(null);
  const [rangeData, setRangeData]     = useState(null);
  const [trends, setTrends]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [uploadingDebt, setUploadingDebt] = useState(false);
  const [coaching, setCoaching]       = useState(false);
  const [message, setMessage]         = useState(null);
  const [files, setFiles]             = useState({ checkin: null, product: null, feedback: null });
  const [debtFile, setDebtFile]       = useState(null);
  const [debtWeek, setDebtWeek]       = useState('');
  const [uploadDate, setUploadDate]   = useState(yesterdayStr());
  const [uploadOpen, setUploadOpen]     = useState(false);
  const [uploadTab, setUploadTab]       = useState('daily');
  const [expenseFile, setExpenseFile]   = useState(null);
  const [expenseDate, setExpenseDate]   = useState(yesterdayStr());
  const [uploadingExpense, setUploadingExpense] = useState(false);
  const [inflowFile, setInflowFile]     = useState(null);
  const [inflowDate, setInflowDate]     = useState(yesterdayStr());
  const [uploadingInflow, setUploadingInflow]   = useState(false);
  const [tableView, setTableView]     = useState('zone');
  const [filterStatus, setFilterStatus] = useState('all');
  const [rangeView, setRangeView]     = useState('zone');
  const [showCustom, setShowCustom]   = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');

  const loadData = useCallback(async (d, range) => {
    setLoading(true);
    const days = range ? range.getDays(d) : 7;
    try {
      const fetches = [
        fetch(`/api/reports?date=${d}`),
        fetch(`/api/analytics?date=${d}&days=${days}`),
        fetch(`/api/trends?days=30`),
      ];
      if (range) {
        const startDate = range.getStartDate(d);
        fetches.push(fetch(`/api/reports/range?startDate=${startDate}&endDate=${d}`));
      }
      const results = await Promise.all(fetches);
      const [reportsData, analyticsData, trendsData] = await Promise.all(results.slice(0, 3).map(r => r.json()));
      setReports(Array.isArray(reportsData) ? reportsData : []);
      setAnalytics(analyticsData?.summary ? analyticsData : null);
      setTrends(trendsData?.daily ? trendsData : null);
      if (range && results[3]) {
        const rd = await results[3].json();
        setRangeData(rd?.summary ? rd : null);
      } else {
        setRangeData(null);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(date, selectedRange); }, [date, selectedRange, loadData]);

  function handleRangeSelect(preset) {
    if (selectedRange?.label === preset.label) {
      setSelectedRange(null);
      setRangeData(null);
    } else {
      setSelectedRange(preset);
    }
  }

  function handleApplyCustomRange() {
    if (!customStart || !customEnd || customStart > customEnd) return;
    const days = Math.round((new Date(customEnd) - new Date(customStart)) / 86400000) + 1;
    const start = customStart;
    const rangeObj = {
      label: 'Custom',
      getDays: () => days,
      getStartDate: () => start,
    };
    setDate(customEnd);
    setSelectedRange(rangeObj);
    setShowCustom(false);
  }


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
    fd.append('date',     uploadDate);
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: 'success', text: `Processed ${data.processed} SEs for ${data.date}` });
      setUploadOpen(false);
      setDate(uploadDate);
      loadData(uploadDate, selectedRange);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setUploading(false);
  }

  async function handleDebtUpload(e) {
    e.preventDefault();
    if (!debtFile) {
      setMessage({ type: 'error', text: 'Please select a debt Excel file.' });
      return;
    }
    setUploadingDebt(true);
    setMessage(null);
    const fd = new FormData();
    fd.append('debt_file', debtFile);
    if (debtWeek) fd.append('week_date', debtWeek);
    try {
      const res  = await fetch('/api/upload/debt', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({
        type: 'success',
        text: `Debt uploaded: ${data.imported} SEs | Week: ${data.week} | Total: ₦${Number(data.total_debt).toLocaleString()}${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`,
      });
      setUploadOpen(false);
      loadData(date, selectedRange);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setUploadingDebt(false);
  }

  async function handleExpenseUpload(e) {
    e.preventDefault();
    if (!expenseFile) { setMessage({ type: 'error', text: 'Please select an expense file.' }); return; }
    setUploadingExpense(true);
    setMessage(null);
    const fd = new FormData();
    fd.append('expense_file', expenseFile);
    fd.append('record_date', expenseDate);
    try {
      const res = await fetch('/api/upload/expenses', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: 'success', text: `Expenses uploaded: ${data.imported} records | Total: ₦${Number(data.total_amount).toLocaleString()}${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}` });
      setUploadOpen(false);
    } catch (err) { setMessage({ type: 'error', text: err.message }); }
    setUploadingExpense(false);
  }

  async function handleInflowUpload(e) {
    e.preventDefault();
    if (!inflowFile) { setMessage({ type: 'error', text: 'Please select an inflow file.' }); return; }
    setUploadingInflow(true);
    setMessage(null);
    const fd = new FormData();
    fd.append('inflow_file', inflowFile);
    fd.append('record_date', inflowDate);
    try {
      const res = await fetch('/api/upload/inflow', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: 'success', text: `Inflow uploaded: ${data.imported} records | Total: ₦${Number(data.total_amount).toLocaleString()}${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}` });
      setUploadOpen(false);
    } catch (err) { setMessage({ type: 'error', text: err.message }); }
    setUploadingInflow(false);
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
      loadData(date, selectedRange);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setCoaching(false);
  }

  async function handleExportExcel() {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Ranked List
    if (rangeData && rangeData.ses.length > 0) {
      const sorted = [...rangeData.ses].sort((a, b) => a.range_rank - b.range_rank);
      const rows = sorted.map(r => ({
        Rank: r.range_rank,
        Name: r.se_name,
        Zone: r.zone || '',
        Position: r.positionKey ? r.positionKey.replace(/_/g, ' ') : 'Sales Executive',
        'Days Reported': r.days_reported,
        'Attendance %': r.attendance_rate,
        'Total Stores': r.total_stores,
        'Total Orders': r.total_orders,
        'Total Value (₦)': r.total_value,
        'Avg Value/Day (₦)': r.avg_value_per_day,
        'Avg Value/Store (₦)': r.avg_value_per_store || 0,
        'Total Reports': r.total_complete_report || 0,
        'Avg Efficiency Score (/15)': r.avg_efficiency_score ?? '',
        'Debt (₦)': r.debt_amount || 0,
        'Avg Score': r.avg_score,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Ranked List');
    } else if (reports.length > 0) {
      const allRanked = [...allSEs].sort((a, b) => (a.rank || 99) - (b.rank || 99));
      const rows = allRanked.map(r => {
        const avgPerStore = r.stores_visited > 0 ? Math.round((r.value_of_orders || 0) / r.stores_visited) : 0;
        return {
          Rank: r.rank || '',
          Name: r.se_name,
          Zone: r.zone || '',
          Position: r.positionLabel || 'Sales Executive',
          'Resumption Time': r.resumption_time || '',
          'Stores Visited': r.stores_visited,
          'Brands Ordered': r.brands_ordered,
          'Brand Coverage %': r.brandPct ?? '',
          'Orders Generated': r.orders_generated ?? '',
          'Value of Orders (₦)': r.value_of_orders || 0,
          'Avg Value/Store (₦)': avgPerStore,
          'Complete Reports': r.complete_report ?? '',
          'Efficiency Score (/15)': r.efficiency_score ?? '',
          'Debt (₦)': r.debt_amount || 0,
          Score: r.total_score,
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Ranked List');
    }

    // Sheet 2: Coach Summary
    try {
      const res = await fetch('/api/coach/summaries');
      const summaries = await res.json();
      if (Array.isArray(summaries) && summaries.length > 0) {
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
      }
    } catch (_) { /* skip coach sheet if unavailable */ }

    const label = rangeData
      ? `${selectedRange?.label || 'range'}_${date}`
      : date;
    XLSX.writeFile(wb, `se-report_${label}.xlsx`);
  }

  const enrichedSEs  = analytics?.ses || [];
  const rawFullSEs   = reports.filter(r => r.status !== 'trial');
  const hasAnalytics = enrichedSEs.length > 0;
  const allSEs       = hasAnalytics ? enrichedSEs : reports;
  const zoneGroups   = buildZoneGroups(allSEs, filterStatus, hasAnalytics);
  const summary      = analytics?.summary;
  const filterOptions = ['all', 'rising', 'at_risk', 'below_expectation', 'watch', 'on_track'];
  const coachingReady = reports.filter(r => r.coaching).length;
  const coachingPending = reports.filter(r => !r.coaching).length;

  return (
    <div>
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Home</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            {summary ? `Latest Report — ${date}` : 'Upload PepUp files to generate a report'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setSelectedRange(null); }}
            className="bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm text-slate-900" />
          {(reports.length > 0 || (rangeData && rangeData.ses.length > 0)) && (
            <button onClick={handleExportExcel}
              className="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-medium px-4 py-1.5 rounded transition-colors">
              ↓ Excel
            </button>
          )}
          {reports.length > 0 && (
            <button onClick={handleCoach} disabled={coaching}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors">
              {coaching ? 'Generating…' : '⚡ Generate Coaching'}
            </button>
          )}
          <button onClick={() => setUploadOpen(o => !o)}
            className="bg-slate-50 border border-slate-200 hover:bg-slate-200 text-slate-900 text-sm font-medium px-4 py-1.5 rounded transition-colors">
            Import Data {uploadOpen ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* ── Date range presets ───────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-xs text-slate-400 mr-1">Range:</span>
        {DATE_RANGE_PRESETS.map(preset => (
          <button key={preset.label} onClick={() => { handleRangeSelect(preset); setShowCustom(false); }}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              selectedRange?.label === preset.label
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-900 hover:border-slate-300'
            }`}>
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => { setShowCustom(p => !p); if (selectedRange?.label === 'Custom') { setSelectedRange(null); setRangeData(null); } }}
          className={`text-xs px-3 py-1 rounded border transition-colors ${
            selectedRange?.label === 'Custom' || showCustom
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-900 hover:border-slate-300'
          }`}>
          Custom
        </button>
        {selectedRange && selectedRange.label !== 'Custom' && (
          <span className="text-xs text-slate-400 ml-1">
            — {selectedRange.getDays(date)} days ending {date}
          </span>
        )}
        {selectedRange?.label === 'Custom' && (
          <span className="text-xs text-slate-400 ml-1">
            — {customStart} → {customEnd}
          </span>
        )}
      </div>

      {/* ── Custom date range picker ─────────────────────────────── */}
      {showCustom && (
        <div className="flex items-end gap-3 mb-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex-wrap">
          <div>
            <label className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Start Date</label>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="bg-white border border-slate-300 rounded px-3 py-1.5 text-sm text-slate-900" />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">End Date</label>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="bg-white border border-slate-300 rounded px-3 py-1.5 text-sm text-slate-900" />
          </div>
          <button
            onClick={handleApplyCustomRange}
            disabled={!customStart || !customEnd || customStart > customEnd}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-medium px-4 py-2 rounded transition-colors">
            Apply Range
          </button>
          {customStart && customEnd && customStart <= customEnd && (
            <span className="text-xs text-slate-400 self-center">
              {Math.round((new Date(customEnd) - new Date(customStart)) / 86400000) + 1} calendar days
            </span>
          )}
        </div>
      )}

      {/* ── Two-column body ──────────────────────────────────────── */}
      <div className="flex gap-6 items-start">

        {/* ── Left: main content ──────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Upload Panel */}
          {uploadOpen && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-6">
              <div className="flex gap-1 mb-4 border-b border-slate-200 pb-3">
                {[['daily', 'Daily PepUp Files'], ['debt', 'Weekly Debt Sheet'], ['expenses', 'Daily Expenses'], ['inflow', 'Daily Inflow']].map(([key, label]) => (
                  <button key={key} onClick={() => setUploadTab(key)}
                    className={`text-xs px-3 py-1.5 rounded transition-colors ${uploadTab === key ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-500 hover:text-slate-900'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {uploadTab === 'daily' ? (
                <form onSubmit={handleUpload}>
                  <div className="mb-4 flex items-center gap-3">
                    <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Report Date</label>
                    <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-3 py-1.5 text-sm text-slate-900" />
                    <span className="text-xs text-slate-400">Uploading for this date will override any existing data for that day.</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <FileInput label="Check-in / Check-out" accept=".xls,.xlsx"
                      onChange={f => setFiles(p => ({ ...p, checkin: f }))} />
                    <FileInput label="Product Report" accept=".xls,.xlsx"
                      onChange={f => setFiles(p => ({ ...p, product: f }))} />
                    <FileInput label="Feedback Detail Report" accept=".xls,.xlsx"
                      onChange={f => setFiles(p => ({ ...p, feedback: f }))} />
                  </div>
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    <p className="font-semibold mb-1">Debt score is now automatic</p>
                    <p>
                      The latest weekly debt upload sets debt score by zone share of total team debt:
                      full score at 10% or below, and 0 once a zone reaches 25%.
                    </p>
                  </div>
                  <button type="submit" disabled={uploading}
                    className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded transition-colors">
                    {uploading ? 'Processing…' : 'Upload & Process'}
                  </button>
                </form>
              ) : uploadTab === 'debt' ? (
                <form onSubmit={handleDebtUpload}>
                  <p className="text-xs text-slate-500 mb-3">
                    Format: <span className="text-slate-600 font-medium">Column A</span> = SE Name &nbsp;|&nbsp;
                    <span className="text-slate-600 font-medium">Column B</span> = Debt Amount (₦) &nbsp;|&nbsp;
                    <span className="text-slate-600 font-medium">Column C</span> = Week Date (optional)
                  </p>
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    <p className="font-semibold mb-1">Debt score rule</p>
                    <p>
                      Weekly debt is scored by zone. 10% of total team debt is the safe baseline,
                      and a zone at 25% or higher gets 0 debt points.
                    </p>
                  </div>
                  <div className="flex gap-4 mb-4 items-end">
                    <div className="flex-1">
                      <FileInput label="Debt Excel Sheet" accept=".xls,.xlsx" onChange={f => setDebtFile(f)} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Week Date (optional)</label>
                      <input type="date" value={debtWeek} onChange={e => setDebtWeek(e.target.value)}
                        className="bg-slate-200 border border-slate-300 rounded px-3 py-1.5 text-sm text-slate-900" />
                    </div>
                  </div>
                  <button type="submit" disabled={uploadingDebt}
                    className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded transition-colors">
                    {uploadingDebt ? 'Uploading…' : 'Upload Debt Sheet'}
                  </button>
                </form>
              ) : uploadTab === 'expenses' ? (
                <form onSubmit={handleExpenseUpload}>
                  <p className="text-xs text-slate-500 mb-3">
                    Format: <span className="text-slate-600 font-medium">Column A</span> = Date &nbsp;|&nbsp;
                    <span className="text-slate-600 font-medium">Column B</span> = SE Name &nbsp;|&nbsp;
                    <span className="text-slate-600 font-medium">Column C</span> = Amount (₦)
                  </p>
                  <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                    <p className="font-semibold mb-1">Expense budget thresholds</p>
                    <p>Senior SE &amp; Corporate SE: ₦25,000/week. All others: ₦20,000/week. Alerts fire on budget overrun or sudden daily spikes.</p>
                  </div>
                  <div className="flex gap-4 mb-4 items-end">
                    <div className="flex-1">
                      <FileInput label="Expense Excel Sheet" accept=".xls,.xlsx" onChange={f => setExpenseFile(f)} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Default Date (if sheet has no date col)</label>
                      <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                        className="bg-slate-200 border border-slate-300 rounded px-3 py-1.5 text-sm text-slate-900" />
                    </div>
                  </div>
                  <button type="submit" disabled={uploadingExpense}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded transition-colors">
                    {uploadingExpense ? 'Uploading…' : 'Upload Expense Sheet'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleInflowUpload}>
                  <p className="text-xs text-slate-500 mb-3">
                    Format: <span className="text-slate-600 font-medium">Column A</span> = Date &nbsp;|&nbsp;
                    <span className="text-slate-600 font-medium">Column B</span> = SE Name &nbsp;|&nbsp;
                    <span className="text-slate-600 font-medium">Column C</span> = Amount (₦)
                  </p>
                  <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-900">
                    <p className="font-semibold mb-1">Inflow tracking</p>
                    <p>Records actual payments received per SE. Senior SE &amp; Corporate SE are flagged when inflow drops to zero for 2 consecutive days.</p>
                  </div>
                  <div className="flex gap-4 mb-4 items-end">
                    <div className="flex-1">
                      <FileInput label="Inflow Excel Sheet" accept=".xls,.xlsx" onChange={f => setInflowFile(f)} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Default Date (if sheet has no date col)</label>
                      <input type="date" value={inflowDate} onChange={e => setInflowDate(e.target.value)}
                        className="bg-slate-200 border border-slate-300 rounded px-3 py-1.5 text-sm text-slate-900" />
                    </div>
                  </div>
                  <button type="submit" disabled={uploadingInflow}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded transition-colors">
                    {uploadingInflow ? 'Uploading…' : 'Upload Inflow Sheet'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={`mb-4 px-4 py-3 rounded text-sm ${message.type === 'error' ? 'bg-red-900/50 border border-red-700 text-red-300' : 'bg-green-900/50 border border-green-700 text-green-300'}`}>
              {message.text}
            </div>
          )}

          {/* KPI Cards — range mode overrides single-day */}
          {rangeData ? (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
              <KpiCard label={`Avg Score (${selectedRange.label})`}
                value={`${rangeData.summary.teamAvgScore}/100`} />
              <KpiCard label="Reporting Days" value={rangeData.summary.seCount > 0 ? `${rangeData.totalDays}d` : '—'}
                sub={`${rangeData.summary.seCount} SEs · ${rangeData.summary.avgAttendance}% avg attendance`} />
              <KpiCard label={`Total Value (${selectedRange.label})`}
                value={`₦${Number(rangeData.summary.totalValue).toLocaleString()}`} />
              <KpiCard label={`Total Orders (${selectedRange.label})`}
                value={Number(rangeData.summary.totalOrders).toLocaleString()} />
            </div>
          ) : summary ? (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
              <KpiCard label="Team Avg Score" value={`${summary.teamAvgScore}/100`}
                delta={summary.teamAvgScoreYesterday != null
                  ? (summary.teamAvgScore - summary.teamAvgScoreYesterday).toFixed(1) : null} />
              <KpiCard label="Reporting Today" value={summary.reportingCount} />
              <KpiCard label="Total Value" value={`₦${Number(summary.totalValue).toLocaleString()}`} />
              <KpiCard
                label="Outstanding Debt"
                value={summary.outstandingDebtTotal > 0 ? `₦${Number(summary.outstandingDebtTotal).toLocaleString()}` : '—'}
                valueColor={summary.outstandingDebtTotal > 0 ? 'text-orange-400' : 'text-slate-400'}
                sub={summary.outstandingDebtTotal > 0 ? 'Latest weekly upload · zone debt drives debt score' : 'Upload debt sheet to track'}
              />
            </div>
          ) : null}

          {/* ── Range cumulative table ── */}
          {rangeData && rangeData.ses.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Cumulative — {selectedRange.label}
                </span>
                <span className="text-[10px] text-slate-400">
                  {selectedRange.getStartDate(date)} → {date} · {rangeData.totalDays} reporting days
                </span>
                <div className="flex rounded overflow-hidden border border-slate-200 ml-auto">
                  <button onClick={() => setRangeView('zone')}
                    className={`text-xs px-3 py-1 transition-colors ${rangeView === 'zone' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900'}`}>
                    By Zone
                  </button>
                  <button onClick={() => setRangeView('list')}
                    className={`text-xs px-3 py-1 border-l border-slate-200 transition-colors ${rangeView === 'list' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900'}`}>
                    Ranked List
                  </button>
                </div>
              </div>
              {rangeView === 'zone'
                ? <RangeTable rows={rangeData.ses} />
                : <RangeRankedList rows={rangeData.ses} />
              }
            </div>
          )}

          {/* View Toggle + Filter (single-day, only shown when no range) */}
          {!rangeData && reports.length > 0 && (
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <div className="flex rounded overflow-hidden border border-slate-200 mr-2">
                <button onClick={() => setTableView('zone')}
                  className={`text-xs px-3 py-1.5 transition-colors ${tableView === 'zone' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900'}`}>
                  By Zone
                </button>
                <button onClick={() => setTableView('list')}
                  className={`text-xs px-3 py-1.5 border-l border-slate-200 transition-colors ${tableView === 'list' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900'}`}>
                  Ranked List
                </button>
              </div>
              {filterOptions.map(f => (
                <button key={f} onClick={() => setFilterStatus(f)}
                  className={`text-xs px-3 py-1 rounded transition-colors ${filterStatus === f ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900 border border-slate-200'}`}>
                  {f === 'all' ? 'All' : (STATUS_META[f]?.label || f)}
                </button>
              ))}
            </div>
          )}

          {/* Zone Tables (single-day) */}
          {!rangeData && reports.length > 0 && tableView === 'zone' && (
            <div className="space-y-8">
              {zoneGroups.map(zone => (
                <ZoneSection key={zone.name} zone={zone} hasAnalytics={hasAnalytics} />
              ))}
            </div>
          )}

          {/* Ranked List (single-day) */}
          {!rangeData && reports.length > 0 && tableView === 'list' && (() => {
            const allRanked = [...allSEs].sort((a, b) => (a.rank || 99) - (b.rank || 99));
            const filtered  = hasAnalytics && filterStatus !== 'all'
              ? allRanked.filter(s => s.status === filterStatus) : allRanked;
            return <TrackingTable rows={filtered} hasAnalytics={hasAnalytics} showZone />;
          })()}

          {loading && <p className="text-slate-400 text-sm mt-4">Loading…</p>}
          {!loading && reports.length === 0 && !rangeData && (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-lg mt-4">
              <p className="text-slate-500 font-medium mb-1">No report for {date}</p>
              <p className="text-slate-400 text-xs">Click <strong className="text-slate-500">Import Data</strong> above to upload today&apos;s PepUp exports.</p>
            </div>
          )}


        </div>
        {/* end left column */}

        {/* ── Right: summary panel ────────────────────────────────── */}
        <aside className="w-72 flex-shrink-0 space-y-4 hidden xl:block">

          {/* Summary card — range or single day */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            {rangeData ? (
              <>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                  {selectedRange.label} Range
                </p>
                <p className="text-slate-900 font-bold text-base leading-tight">
                  {selectedRange.getStartDate(date)} → {date}
                </p>
                <p className="text-slate-400 text-xs mt-0.5">{rangeData.totalDays} reporting days</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wide">Total Revenue</p>
                    <p className="text-red-400 font-bold text-sm mt-0.5">
                      ₦{Number(rangeData.summary.totalValue / 1_000_000).toFixed(2)}M
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wide">Total Orders</p>
                    <p className="text-slate-900 font-bold text-sm mt-0.5">
                      {rangeData.summary.totalOrders.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wide">Avg Score</p>
                    <p className="text-slate-900 font-bold text-sm mt-0.5">{rangeData.summary.teamAvgScore}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wide">Avg Attend.</p>
                    <p className="text-slate-900 font-bold text-sm mt-0.5">{rangeData.summary.avgAttendance}%</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Latest Report</p>
                <p className="text-slate-900 font-bold text-base leading-tight">{formatDateDisplay(date)}</p>
                <p className="text-slate-400 text-xs mt-0.5">{date}</p>

                {summary ? (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wide">Revenue</p>
                        <p className="text-red-400 font-bold text-sm mt-0.5">
                          ₦{Number(summary.totalValue / 1_000_000).toFixed(2)}M
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wide">Score</p>
                        <p className="text-slate-900 font-bold text-sm mt-0.5">{summary.teamAvgScore}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wide">SEs</p>
                        <p className="text-slate-900 font-bold text-sm mt-0.5">{summary.reportingCount}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => setTableView('zone')}
                        className="flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-medium py-1.5 rounded transition-colors">
                        By Zone
                      </button>
                      <button onClick={() => setTableView('list')}
                        className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-900 text-xs font-medium py-1.5 rounded transition-colors">
                        Ranked List
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-400 text-xs mt-3">No data for this date.</p>
                )}
              </>
            )}
          </div>

          {/* Coaching status */}
          {reports.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest">Coaching Status</p>
                {coachingPending > 0 && (
                  <span className="bg-orange-500/20 text-orange-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    {coachingPending} pending
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Ready</span>
                  <span className="text-xs font-semibold text-green-400">{coachingReady}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all"
                    style={{ width: reports.length > 0 ? `${(coachingReady / reports.length) * 100}%` : '0%' }}
                  />
                </div>
                <p className="text-[10px] text-slate-400">{coachingReady} of {reports.length} SEs coached</p>
              </div>
              {coachingPending > 0 && (
                <button onClick={handleCoach} disabled={coaching}
                  className="mt-3 w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded transition-colors">
                  {coaching ? 'Generating…' : 'Generate Now'}
                </button>
              )}
            </div>
          )}

          {/* Zone debt summary */}
          {summary?.debtByZone && Object.keys(summary.debtByZone).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Debt by Zone</p>
              <p className="text-[10px] text-slate-400 mb-3">
                Shared regions are split across matching SEs before zone totals are added.
              </p>
              <div className="space-y-2">
                {Object.entries(summary.debtByZone).sort((a, b) => b[1] - a[1]).map(([zone, amt]) => (
                  <div key={zone} className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">{zone}</span>
                    <span className="text-xs font-semibold text-orange-400">₦{Number(amt).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                  <span className="text-xs text-slate-600 font-medium">Total</span>
                  <span className="text-xs font-bold text-orange-300">
                    ₦{Number(summary.outstandingDebtTotal).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick import shortcut */}
          {!summary && (
            <div className="bg-slate-100/50 border border-dashed border-slate-200 rounded-lg p-5 text-center">
              <p className="text-slate-500 text-xs mb-3">No data yet for this date</p>
              <button onClick={() => setUploadOpen(true)}
                className="bg-red-600 hover:bg-red-500 text-white text-xs font-medium px-4 py-1.5 rounded transition-colors">
                Import Data
              </button>
            </div>
          )}

        </aside>
        {/* end right panel */}

      </div>
      {/* end two-column body */}

    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildZoneGroups(ses, filterStatus, hasAnalytics) {
  const zoneMap = {};
  ses.forEach(se => {
    const zone = se.zone || 'Unassigned';
    if (!zoneMap[zone]) zoneMap[zone] = [];
    zoneMap[zone].push(se);
  });
  return Object.entries(zoneMap)
    .map(([name, zoneSEs]) => {
      const sorted = [...zoneSEs].sort((a, b) => {
        const aS = a.positionKey === 'senior_se' || a.positionKey === 'corporate_se';
        const bS = b.positionKey === 'senior_se' || b.positionKey === 'corporate_se';
        if (aS && !bS) return -1;
        if (!aS && bS) return 1;
        return (a.rank || 99) - (b.rank || 99);
      });
      const filtered   = hasAnalytics && filterStatus !== 'all'
        ? sorted.filter(s => s.status === filterStatus) : sorted;
      const fullInZone = zoneSEs.filter(s => s.isFullSE !== false && s.status !== 'trial');
      const avgScore   = fullInZone.length
        ? Math.round((fullInZone.reduce((s, e) => s + (e.total_score || 0), 0) / fullInZone.length) * 10) / 10
        : null;
      const totalValue = zoneSEs.reduce((s, e) => s + (e.value_of_orders || 0), 0);
      return { name, ses: filtered, avgScore, totalValue };
    })
    .filter(z => z.ses.length > 0)
    .sort((a, b) => {
      const ai = ZONE_ORDER.indexOf(a.name), bi = ZONE_ORDER.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
}

function ZoneSection({ zone, hasAnalytics }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3 pb-2 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wider">{zone.name}</h3>
        {zone.avgScore != null && (
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${zone.avgScore >= 75 ? 'bg-green-900/50 text-green-300' : zone.avgScore >= 50 ? 'bg-yellow-900/50 text-yellow-300' : 'bg-red-900/50 text-red-300'}`}>
            Avg {zone.avgScore}
          </span>
        )}
        {zone.totalValue > 0 && <span className="text-xs text-slate-500">₦{Number(zone.totalValue).toLocaleString()}</span>}
        <span className="text-xs text-slate-400 ml-auto">{zone.ses.length} SE{zone.ses.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="text-[10px] text-slate-400 mb-2">
        Debt amounts below are allocated shares where regions are owned by more than one SE.
      </p>
      <TrackingTable rows={zone.ses} hasAnalytics={hasAnalytics} />
    </div>
  );
}

function TrackingTable({ rows, hasAnalytics, showZone = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 uppercase border-b border-slate-200">
            <th className="text-left py-2 px-3">Rank</th>
            <th className="text-left py-2 px-3">Name</th>
            {showZone && <th className="text-left py-2 px-3">Zone</th>}
            <th className="text-right py-2 px-3">Resumption</th>
            <th className="text-right py-2 px-3">Stores</th>
            <th className="text-right py-2 px-3">Brands</th>
            <th className="text-right py-2 px-3">Orders</th>
            <th className="text-right py-2 px-3">Value (₦)</th>
            <th className="text-right py-2 px-3">Avg/Store (₦)</th>
            <th className="text-right py-2 px-3">Reports</th>
            <th className="text-right py-2 px-3">Debt (₦)</th>
            <th className="text-right py-2 px-3">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const rankDelta   = r.rankDeltaVsYesterday;
            const isSenior    = r.positionKey === 'senior_se' || r.positionKey === 'corporate_se';
            const avgPerStore = r.stores_visited > 0
              ? Math.round((r.value_of_orders || 0) / r.stores_visited) : 0;
            const effScore    = r.efficiency_score ?? null;

            return (
              <tr key={r.se_name}
                className={`border-b border-slate-200 hover:bg-slate-100/50 cursor-pointer ${isSenior ? 'bg-slate-100/20' : ''}`}
                onClick={() => window.location.href = `/coach?se=${encodeURIComponent(r.se_name)}`}>

                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600 font-medium">{r.rank || '—'}</span>
                    {rankDelta != null && rankDelta !== 0 && (
                      <span className={`text-xs ${rankDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {rankDelta > 0 ? `↑${rankDelta}` : `↓${Math.abs(rankDelta)}`}
                      </span>
                    )}
                  </div>
                </td>

                <td className="py-2.5 px-3 whitespace-nowrap">
                  <div className={`font-medium ${isSenior ? 'text-slate-900' : 'text-slate-700'}`}>{r.se_name}</div>
                  {r.positionLabel && r.positionLabel !== 'Sales Executive' && (
                    <div className="text-xs text-slate-500">{r.positionLabel}</div>
                  )}
                </td>

                {showZone && <td className="py-2.5 px-3 text-xs text-slate-500">{r.zone || '—'}</td>}

                <td className="py-2.5 px-3 text-right text-slate-600 text-xs">{r.resumption_time || '—'}</td>

                <td className="py-2.5 px-3 text-right">
                  <span className={r.expectations && !r.expectations.storesOk ? 'text-orange-400' : 'text-slate-300'}>
                    {r.stores_visited}
                  </span>
                </td>

                <td className="py-2.5 px-3 text-right">
                  <span className={r.expectations && !r.expectations.brandsOk ? 'text-orange-400' : 'text-slate-300'}>
                    {r.brands_ordered}
                    {r.brandPct != null && <span className="text-xs text-slate-400 ml-1">({r.brandPct}%)</span>}
                  </span>
                </td>

                <td className="py-2.5 px-3 text-right text-slate-600">{r.orders_generated ?? '—'}</td>

                <td className="py-2.5 px-3 text-right text-slate-600">
                  {Number(r.value_of_orders || 0).toLocaleString()}
                </td>

                <td className="py-2.5 px-3 text-right text-slate-500 text-xs">
                  {r.stores_visited > 0 ? Number(avgPerStore).toLocaleString() : '—'}
                </td>

                <td className="py-2.5 px-3 text-right text-xs">
                  {r.complete_report != null ? (
                    <div>
                      <span className="text-slate-600 font-medium">{r.complete_report}</span>
                      {effScore != null && (
                        <span className={`ml-1 ${effScore >= 12 ? 'text-green-500' : effScore >= 7.5 ? 'text-yellow-500' : 'text-red-400'}`}>
                          ({effScore}/15)
                        </span>
                      )}
                    </div>
                  ) : '—'}
                </td>

                <td className={"py-2.5 px-3 text-right text-xs " + (r.debt_amount > 0 ? "text-orange-400 font-medium" : "text-slate-400")}>
                  {r.debt_amount > 0 ? "₦" + Number(r.debt_amount).toLocaleString() : "—"}
                </td>

                <td className="py-2.5 px-3 text-right"><ScoreBadge score={r.total_score} /></td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={showZone ? 12 : 11} className="py-6 text-center text-slate-400 text-sm">No SEs match this filter.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function KpiCard({ label, value, delta, valueColor = 'text-slate-900', sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      {delta != null && (
        <p className={`text-xs mt-0.5 ${Number(delta) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {Number(delta) >= 0 ? '↑' : '↓'} {Math.abs(delta)} vs yesterday
        </p>
      )}
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function FileInput({ label, accept, onChange }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      <input type="file" accept={accept} onChange={e => onChange(e.target.files[0] || null)}
        className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300 cursor-pointer" />
    </label>
  );
}

function ScoreBadge({ score }) {
  const s = Number(score) || 0;
  return <span className={`font-bold ${s >= 75 ? 'text-green-400' : s >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{s.toFixed(1)}</span>;
}

function RangeTable({ rows }) {
  const byZone = {};
  for (const r of rows) {
    const z = r.zone || 'Unassigned';
    if (!byZone[z]) byZone[z] = [];
    byZone[z].push(r);
  }
  const zones = Object.keys(byZone).sort((a, b) => {
    const ai = ZONE_ORDER.indexOf(a), bi = ZONE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-6">
      {zones.map(zone => {
        const ses = byZone[zone];
        const zoneTotal = ses.reduce((s, e) => s + e.total_value, 0);
        const zoneAvgScore = ses.length
          ? Math.round(ses.reduce((s, e) => s + e.avg_score, 0) / ses.length * 10) / 10 : null;
        return (
          <div key={zone}>
            <div className="flex items-center gap-3 mb-3 pb-2 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wider">{zone}</h3>
              {zoneAvgScore != null && (
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${zoneAvgScore >= 75 ? 'bg-green-900/50 text-green-300' : zoneAvgScore >= 50 ? 'bg-yellow-900/50 text-yellow-300' : 'bg-red-900/50 text-red-300'}`}>
                  Avg {zoneAvgScore}
                </span>
              )}
              <span className="text-xs text-slate-500">₦{Number(zoneTotal).toLocaleString()}</span>
              <span className="text-xs text-slate-400 ml-auto">{ses.length} SE{ses.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase border-b border-slate-200">
                    <th className="text-left py-2 px-3">Rank</th>
                    <th className="text-left py-2 px-3">Name</th>
                    <th className="text-right py-2 px-3">Days</th>
                    <th className="text-right py-2 px-3">Attend%</th>
                    <th className="text-right py-2 px-3">Stores</th>
                    <th className="text-right py-2 px-3">Orders</th>
                    <th className="text-right py-2 px-3">Total Value (₦)</th>
                    <th className="text-right py-2 px-3">Avg/Day (₦)</th>
                    <th className="text-right py-2 px-3">Avg/Store (₦)</th>
                    <th className="text-right py-2 px-3">Debt (₦)</th>
                    <th className="text-right py-2 px-3">Avg Score</th>
                  </tr>
                </thead>
                <tbody>
                  {ses.map(r => {
                    const isSenior = r.positionKey === 'senior_se' || r.positionKey === 'corporate_se';
                    return (
                      <tr key={r.se_name}
                        className={`border-b border-slate-200 hover:bg-slate-100/50 cursor-pointer ${isSenior ? 'bg-slate-100/20' : ''}`}
                        onClick={() => window.location.href = `/coach?se=${encodeURIComponent(r.se_name)}`}>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">{r.range_rank}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className={`font-medium ${isSenior ? 'text-slate-900' : 'text-slate-700'}`}>{r.se_name}</div>
                          {r.positionKey && r.positionKey !== 'sales_executive' && (
                            <div className="text-xs text-slate-500 capitalize">{r.positionKey.replace(/_/g, ' ')}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 text-xs">{r.days_reported}</td>
                        <td className="py-2.5 px-3 text-right text-xs">
                          <span className={r.attendance_rate >= 80 ? 'text-green-500' : r.attendance_rate >= 60 ? 'text-yellow-500' : 'text-red-400'}>
                            {r.attendance_rate}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{r.total_stores.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{r.total_orders.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-800">{Number(r.total_value).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500 text-xs">{Number(r.avg_value_per_day).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500 text-xs">{r.avg_value_per_store > 0 ? Number(r.avg_value_per_store).toLocaleString() : '—'}</td>
                        <td className={"py-2.5 px-3 text-right text-xs " + (r.debt_amount > 0 ? "text-orange-400 font-medium" : "text-slate-400")}>
                          {r.debt_amount > 0 ? "₦" + Number(r.debt_amount).toLocaleString() : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right"><ScoreBadge score={r.avg_score} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RangeRankedList({ rows }) {
  const sorted = [...rows].sort((a, b) => a.range_rank - b.range_rank);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 uppercase border-b border-slate-200">
            <th className="text-left py-2 px-3">Rank</th>
            <th className="text-left py-2 px-3">Name</th>
            <th className="text-left py-2 px-3">Zone</th>
            <th className="text-right py-2 px-3">Days</th>
            <th className="text-right py-2 px-3">Attend%</th>
            <th className="text-right py-2 px-3">Stores</th>
            <th className="text-right py-2 px-3">Orders</th>
            <th className="text-right py-2 px-3">Total Value (₦)</th>
            <th className="text-right py-2 px-3">Avg/Day (₦)</th>
            <th className="text-right py-2 px-3">Avg/Store (₦)</th>
            <th className="text-right py-2 px-3">Reports</th>
            <th className="text-right py-2 px-3">Debt (₦)</th>
            <th className="text-right py-2 px-3">Avg Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => {
            const isSenior = r.positionKey === 'senior_se' || r.positionKey === 'corporate_se';
            return (
              <tr key={r.se_name}
                className={`border-b border-slate-200 hover:bg-slate-100/50 cursor-pointer ${isSenior ? 'bg-slate-100/20' : ''}`}
                onClick={() => window.location.href = `/coach?se=${encodeURIComponent(r.se_name)}`}>
                <td className="py-2.5 px-3 text-slate-600 font-medium">{r.range_rank}</td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <div className={`font-medium ${isSenior ? 'text-slate-900' : 'text-slate-700'}`}>{r.se_name}</div>
                  {r.positionKey && r.positionKey !== 'sales_executive' && (
                    <div className="text-xs text-slate-500 capitalize">{r.positionKey.replace(/_/g, ' ')}</div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-xs text-slate-500">{r.zone || '—'}</td>
                <td className="py-2.5 px-3 text-right text-slate-600 text-xs">{r.days_reported}</td>
                <td className="py-2.5 px-3 text-right text-xs">
                  <span className={r.attendance_rate >= 80 ? 'text-green-500' : r.attendance_rate >= 60 ? 'text-yellow-500' : 'text-red-400'}>
                    {r.attendance_rate}%
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-slate-600">{r.total_stores.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-slate-600">{r.total_orders.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right font-medium text-slate-800">{Number(r.total_value).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-slate-500 text-xs">{Number(r.avg_value_per_day).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-slate-500 text-xs">{r.avg_value_per_store > 0 ? Number(r.avg_value_per_store).toLocaleString() : '—'}</td>
                <td className="py-2.5 px-3 text-right text-xs">
                  {r.total_complete_report != null ? (
                    <div>
                      <span className="text-slate-600 font-medium">{r.total_complete_report}</span>
                      {r.avg_efficiency_score != null && (
                        <span className={`ml-1 ${r.avg_efficiency_score >= 12 ? 'text-green-500' : r.avg_efficiency_score >= 7.5 ? 'text-yellow-500' : 'text-red-400'}`}>
                          ({r.avg_efficiency_score}/15)
                        </span>
                      )}
                    </div>
                  ) : '—'}
                </td>
                <td className={"py-2.5 px-3 text-right text-xs " + (r.debt_amount > 0 ? "text-orange-400 font-medium" : "text-slate-400")}>
                  {r.debt_amount > 0 ? "₦" + Number(r.debt_amount).toLocaleString() : "—"}
                </td>
                <td className="py-2.5 px-3 text-right"><ScoreBadge score={r.avg_score} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function quarterStartStr(dateStr, quarter) {
  const year = new Date(dateStr + 'T00:00:00').getFullYear();
  const months = [null, '01', '04', '07', '10'];
  return `${year}-${months[quarter]}-01`;
}

function quarterDays(dateStr, quarter) {
  const end = new Date(dateStr + 'T00:00:00');
  const year = end.getFullYear();
  const qStarts = [null, 0, 3, 6, 9]; // month index (0-based)
  const qStart = new Date(year, qStarts[quarter], 1);
  const qEnd = new Date(year, qStarts[quarter] + 3, 0); // last day of quarter
  const effectiveEnd = end < qEnd ? end : qEnd;
  const diff = Math.max(1, Math.round((effectiveEnd - qStart) / 86400000) + 1);
  return diff;
}

function ytdDays(dateStr) {
  const end = new Date(dateStr + 'T00:00:00');
  const start = new Date(end.getFullYear(), 0, 1);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}
