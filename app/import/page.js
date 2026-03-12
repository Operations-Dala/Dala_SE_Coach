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
            {[['daily', 'Daily PepUp Files'], ['debt', 'Weekly Debt Sheet']].map(([key, label]) => (
              <button key={key} onClick={() => setUploadTab(tab, setTab, key)}
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

          {tab === 'daily' ? (
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

function setUploadTab(current, setter, next) {
  setter(next);
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
