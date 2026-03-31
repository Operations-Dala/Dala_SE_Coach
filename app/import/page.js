'use client';

import { useState } from 'react';

export default function ImportPage() {
  const [tab, setTab]             = useState('daily');
  const [date, setDate]           = useState(yesterdayStr());
  const [files, setFiles]         = useState({ checkin: null, product: null, feedback: null });
  const [debtFile, setDebtFile]   = useState(null);
  const [debtWeek, setDebtWeek]   = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingDebt, setUploadingDebt] = useState(false);
  const [expenseFile, setExpenseFile]     = useState(null);
  const [expenseDate, setExpenseDate]     = useState(yesterdayStr());
  const [uploadingExpense, setUploadingExpense] = useState(false);
  const [inflowFile, setInflowFile]       = useState(null);
  const [inflowDate, setInflowDate]       = useState(yesterdayStr());
  const [uploadingInflow, setUploadingInflow]   = useState(false);
  const [message, setMessage]     = useState(null);


  async function handleUpload(e) {
    e.preventDefault();
    if (!files.checkin || !files.product || !files.feedback) {
      setMessage({ type: 'error', text: 'Please select all 3 PepUp files.' });
      return;
    }
    setUploading(true);
    setMessage(null);
    const fd = new FormData();
    fd.append('checkin',  files.checkin);
    fd.append('product',  files.product);
    fd.append('feedback', files.feedback);
    fd.append('date',     date);
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: 'success', text: `Processed ${data.processed} SEs for ${data.date}. Go to Home to view results.` });
      setFiles({ checkin: null, product: null, feedback: null });
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
      setDebtFile(null);
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
      const res  = await fetch('/api/upload/expenses', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) {
        if (data.debug) console.warn('Expense upload debug:', JSON.stringify(data.debug, null, 2));
        if (data.skipped?.length) console.warn('Skipped names:', data.skipped);
        const debugHint = data.debug
          ? ` | Headers found: [${data.debug.detected_headers.join(', ')}] | Skipped: ${data.skipped?.length ?? 0} names | Roster size: ${data.debug.roster_count}`
          : '';
        throw new Error(data.error + debugHint);
      }
      setMessage({ type: 'success', text: `Expenses uploaded: ${data.imported} records | Total: ₦${Number(data.total_amount).toLocaleString()}${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}` });
      setExpenseFile(null);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
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
      const res  = await fetch('/api/upload/inflow', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: 'success', text: `Inflow uploaded: ${data.imported} records | Total: ₦${Number(data.total_amount).toLocaleString()}${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}` });
      setInflowFile(null);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setUploadingInflow(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Import Data</h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Upload a Tally Excel export to process daily reports and save to history.
        </p>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Left: Upload Form ── */}
        <div className="flex-1 min-w-0">
          {/* Tabs */}
          <div className="flex gap-1 mb-5 p-1 bg-slate-100/60 border border-slate-200 rounded-lg w-fit">
            {[['daily', 'Daily PepUp Files'], ['debt', 'Weekly Debt Sheet'], ['expenses', 'Daily Expenses'], ['inflow', 'Daily Inflow']].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`text-xs px-4 py-2 rounded-md font-medium transition-colors ${tab === key ? 'bg-red-600 text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Message */}
          {message && (
            <div className={`mb-5 px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-900/40 border border-red-700/60 text-red-300' : 'bg-green-900/40 border border-green-700/60 text-green-300'}`}>
              {message.text}
            </div>
          )}

          {tab === 'expenses' ? (
            <form onSubmit={handleExpenseUpload}>
              <div className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-5">
                  EXPENSE EXCEL SHEET (.XLS / .XLSX)
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  Format: <span className="text-slate-600 font-medium">Column A</span> = Date &nbsp;|&nbsp;
                  <span className="text-slate-600 font-medium">Column B</span> = SE Name &nbsp;|&nbsp;
                  <span className="text-slate-600 font-medium">Column C</span> = Amount (₦)
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 text-xs text-blue-900">
                  <p className="font-semibold mb-1">Expense budget thresholds</p>
                  <p>Senior SE &amp; Corporate SE: ₦25,000/week. All others: ₦20,000/week. Daily limit: ₦4,000. Alerts fire on budget overrun or daily spikes.</p>
                </div>
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <FileInput label="Expense Excel Sheet" accept=".xls,.xlsx"
                      onChange={f => setExpenseFile(f)} chosen={expenseFile?.name} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Default Date (if sheet has no date col)</label>
                    <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                      className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
                  </div>
                </div>
              </div>
              <button type="submit" disabled={uploadingExpense}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                {uploadingExpense ? (
                  <><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading…</>
                ) : 'Upload Expense Sheet'}
              </button>
            </form>
          ) : tab === 'inflow' ? (
            <form onSubmit={handleInflowUpload}>
              <div className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-5">
                  INFLOW EXCEL SHEET (.XLS / .XLSX)
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  Format: <span className="text-slate-600 font-medium">Column A</span> = Date &nbsp;|&nbsp;
                  <span className="text-slate-600 font-medium">Column B</span> = SE Name &nbsp;|&nbsp;
                  <span className="text-slate-600 font-medium">Column C</span> = Amount (₦)
                </p>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-5 text-xs text-green-900">
                  <p className="font-semibold mb-1">Inflow tracking</p>
                  <p>Records actual payments received per SE. Senior SE &amp; Corporate SE are flagged when inflow drops to zero for 2 consecutive days.</p>
                </div>
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <FileInput label="Inflow Excel Sheet" accept=".xls,.xlsx"
                      onChange={f => setInflowFile(f)} chosen={inflowFile?.name} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Default Date (if sheet has no date col)</label>
                    <input type="date" value={inflowDate} onChange={e => setInflowDate(e.target.value)}
                      className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
                  </div>
                </div>
              </div>
              <button type="submit" disabled={uploadingInflow}
                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                {uploadingInflow ? (
                  <><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading…</>
                ) : 'Upload Inflow Sheet'}
              </button>
            </form>
          ) : tab === 'daily' ? (
            <form onSubmit={handleUpload}>
              <div className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-5">
                  TALLY EXCEL FILE (.XLS / .XLSX)
                </p>

                <div className="grid grid-cols-1 gap-4 mb-6">
                  <FileInput label="Check-in / Check-out Report" accept=".xls,.xlsx"
                    onChange={f => setFiles(p => ({ ...p, checkin: f }))} chosen={files.checkin?.name} />
                  <FileInput label="Product Report" accept=".xls,.xlsx"
                    onChange={f => setFiles(p => ({ ...p, product: f }))} chosen={files.product?.name} />
                  <FileInput label="Feedback Detail Report" accept=".xls,.xlsx"
                    onChange={f => setFiles(p => ({ ...p, feedback: f }))} chosen={files.feedback?.name} />
                </div>

                <div className="flex items-center gap-4 mb-6">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">REPORT DATE</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                      className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
                  </div>
                </div>

              </div>

              <button type="submit" disabled={uploading}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                {uploading ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>⚡ Generate All Reports</>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleDebtUpload}>
              <div className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-5">
                  WEEKLY DEBT SHEET (.XLS / .XLSX)
                </p>

                <div className="bg-slate-200/40 border border-slate-200 rounded-lg p-4 mb-5 text-xs text-slate-500">
                  <p className="font-semibold text-slate-600 mb-2">Expected Format</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded p-2 text-center">
                      <p className="text-slate-500 text-[10px] uppercase mb-0.5">Column A</p>
                      <p className="text-slate-900 font-medium">SE Name</p>
                    </div>
                    <div className="bg-white rounded p-2 text-center">
                      <p className="text-slate-500 text-[10px] uppercase mb-0.5">Column B</p>
                      <p className="text-slate-900 font-medium">Debt Amount (₦)</p>
                    </div>
                    <div className="bg-white rounded p-2 text-center">
                      <p className="text-slate-500 text-[10px] uppercase mb-0.5">Column C</p>
                      <p className="text-slate-900 font-medium">Week Date <span className="text-slate-500">(optional)</span></p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5 text-xs text-amber-900">
                  <p className="font-semibold mb-1">Debt score rule</p>
                  <p>
                    This upload updates debt scores automatically using zone debt share.
                    10% of total team debt is the baseline. 25% is the maximum allowed per zone.
                  </p>
                </div>

                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <FileInput label="Debt Excel Sheet" accept=".xls,.xlsx"
                      onChange={f => setDebtFile(f)} chosen={debtFile?.name} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Week Date (optional)</label>
                    <input type="date" value={debtWeek} onChange={e => setDebtWeek(e.target.value)}
                      className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
                  </div>
                </div>
              </div>

              <button type="submit" disabled={uploadingDebt}
                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                {uploadingDebt ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>Upload Debt Sheet</>
                )}
              </button>
            </form>
          )}
        </div>


      </div>
    </div>
  );
}


function FileInput({ label, accept, onChange, chosen }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-2">{label}</label>
      <label className="flex items-center gap-3 bg-slate-200/50 border border-slate-300 border-dashed rounded-lg px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="text-slate-500 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span className={`text-sm truncate ${chosen ? 'text-slate-900' : 'text-slate-400'}`}>
          {chosen || 'Choose file…'}
        </span>
        <input type="file" accept={accept} onChange={e => onChange(e.target.files[0] || null)} className="hidden" />
      </label>
    </div>
  );
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
