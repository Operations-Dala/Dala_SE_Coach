'use client';

import { useState, useEffect } from 'react';
import { parseTierConfig, TIER_META, POSITIONS } from '@/lib/tier-engine';

const POSITION_OPTIONS = Object.entries(POSITIONS).map(([key, val]) => ({ key, label: val.label }));

const TABS = ['General', 'Tier Expectations', 'Team Roster', 'Brand Partners', 'SE Profiles', 'Integrations'];

export default function Settings() {
  const [tab,      setTab]      = useState('General');
  const [settings, setSettings] = useState({});
  const [roster,   setRoster]   = useState([]);
  const [brands,   setBrands]   = useState([]);
  const [profiles, setProfiles] = useState({});
  const [msg,      setMsg]      = useState(null);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings);
    fetch('/api/settings/roster').then(r => r.json()).then(setRoster);
    fetch('/api/settings/brands').then(r => r.json()).then(setBrands);
  }, []);

  async function saveSettings(updates) {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setMsg({ type: 'success', text: 'Settings saved.' });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded text-sm ${
          msg.type === 'error'
            ? 'bg-red-900/50 border border-red-700 text-red-300'
            : 'bg-green-900/50 border border-green-700 text-green-300'
        }`}>{msg.text}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-500 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'General' && (
        <GeneralTab settings={settings} onSave={saveSettings} />
      )}
      {tab === 'Tier Expectations' && (
        <TierTab key={settings?.tier_config || 'tier-config'} settings={settings} onSave={saveSettings} />
      )}
      {tab === 'Team Roster' && (
        <RosterTab roster={roster} setRoster={setRoster} setMsg={setMsg} />
      )}
      {tab === 'Brand Partners' && (
        <BrandsTab brands={brands} setBrands={setBrands} setMsg={setMsg} />
      )}
      {tab === 'SE Profiles' && (
        <ProfilesTab roster={roster} setMsg={setMsg} />
      )}
      {tab === 'Integrations' && (
        <IntegrationsTab settings={settings} onSave={saveSettings} />
      )}
    </div>
  );
}

// ── Tier Expectations Tab ────────────────────────────────────────────────────
function TierTab({ settings, onSave }) {
  const [tiers, setTiers] = useState(() => parseTierConfig(settings?.tier_config));

  function updateTier(i, field, value) {
    setTiers(prev => prev.map((t, idx) =>
      idx === i ? { ...t, [field]: field === 'label' ? value : Number(value) } : t
    ));
  }

  function updateRankRange(i, pos, value) {
    setTiers(prev => prev.map((t, idx) => {
      if (idx !== i) return t;
      const newRange = [...t.rankRange];
      newRange[pos] = Number(value);
      return { ...t, rankRange: newRange };
    }));
  }

  function handleSave() {
    onSave({ tier_config: JSON.stringify(tiers) });
  }

  const numField = (label, val, onChange, min = 0, max = 100) => (
    <label className="block text-center">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      <input
        type="number" min={min} max={max}
        value={val}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-200 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900 text-center"
      />
    </label>
  );

  return (
    <div>
      <p className="text-sm text-slate-400 mb-6">
        Define the minimum performance expectations for each rank tier.
        Each SE is evaluated against their tier&apos;s thresholds — if they fall short, they receive a
        <strong className="text-orange-300"> Below Expectation</strong> or
        <strong className="text-red-300"> At Risk</strong> status on the dashboard.
      </p>

      <div className="space-y-4">
        {tiers.map((t, i) => {
          const meta = TIER_META[t.tier] || TIER_META[0];
          return (
            <div key={t.tier} className={`rounded-lg border p-4 ${meta.bg} ${meta.border}`}>
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${meta.bg} ${meta.text} ${meta.border}`}>
                  T{t.tier}
                </span>
                <input
                  value={t.label}
                  onChange={e => updateTier(i, 'label', e.target.value)}
                  className="bg-slate-200 border border-slate-300 rounded px-2 py-1 text-sm text-slate-900 font-semibold w-32"
                />
              </div>

              <div className="grid grid-cols-5 gap-3">
                <label className="block text-center">
                  <span className="text-xs text-slate-400 mb-1 block">Rank From</span>
                  <input
                    type="number" min={1} max={15}
                    value={t.rankRange[0]}
                    onChange={e => updateRankRange(i, 0, e.target.value)}
                    className="w-full bg-slate-200 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900 text-center"
                  />
                </label>
                <label className="block text-center">
                  <span className="text-xs text-slate-400 mb-1 block">Rank To</span>
                  <input
                    type="number" min={1} max={15}
                    value={t.rankRange[1]}
                    onChange={e => updateRankRange(i, 1, e.target.value)}
                    className="w-full bg-slate-200 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900 text-center"
                  />
                </label>
                {numField('Min Score', t.minScore,    v => updateTier(i, 'minScore', v),    0, 100)}
                {numField('Min Brand %', t.minBrandPct, v => updateTier(i, 'minBrandPct', v), 0, 100)}
                {numField('Min Stores',  t.minStores,   v => updateTier(i, 'minStores', v),   0, 20)}
              </div>

              <p className={`text-xs mt-3 ${meta.text} opacity-70`}>
                Ranks {t.rankRange[0]}–{t.rankRange[1]} must score ≥{t.minScore}, cover ≥{t.minBrandPct}% brands, visit ≥{t.minStores} stores.
              </p>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        className="mt-6 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded transition-colors"
      >
        Save Tier Expectations
      </button>
    </div>
  );
}

// ── General Tab ──────────────────────────────────────────────────────────────
function GeneralTab({ settings, onSave }) {
  const [form, setForm] = useState({});
  useEffect(() => { setForm(settings); }, [settings]);

  const field = (key, label, type = 'text') => (
    <label key={key} className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      <input
        type={type}
        value={form[key] || ''}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Store Targets</h2>
      {field('min_store_target',     'Minimum Store Target', 'number')}
      {field('advanced_store_target','Advanced Store Target', 'number')}
      {field('min_cash_inflow',      'Minimum Cash Inflow (₦)', 'number')}
      {field('advanced_cash_inflow', 'Advanced Cash Inflow (₦)', 'number')}
      {field('surveys_target',       'Surveys Target', 'number')}

      <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide pt-2">Score Weights</h2>
      <div className="grid grid-cols-5 gap-2">
        {[
          ['score_time', 'Time'],
          ['score_visits', 'Visits'],
          ['score_brands', 'Brands'],
          ['score_efficiency', 'Efficiency'],
          ['score_debt', 'Debt'],
        ].map(([key, label]) => (
          <label key={key} className="block text-center">
            <span className="text-xs text-slate-400 mb-1 block">{label}</span>
            <input
              type="number"
              value={form[key] || ''}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              className="w-full bg-slate-200 border border-slate-300 rounded px-2 py-2 text-sm text-slate-900 text-center"
            />
          </label>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide pt-2">Gemini API Key</h2>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">
          {form.gemini_api_key_set === 'true' ? 'API key is set (enter new key to replace)' : 'No API key set'}
        </span>
        <input
          type="password"
          placeholder={form.gemini_api_key_set === 'true' ? '••••••••••••' : 'Enter Gemini API key'}
          onChange={e => setForm(p => ({ ...p, gemini_api_key: e.target.value }))}
          className="w-full bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900"
        />
      </label>

      <button
        onClick={() => onSave(form)}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded transition-colors"
      >
        Save Settings
      </button>
    </div>
  );
}

// ── Roster Tab ───────────────────────────────────────────────────────────────
function RosterTab({ roster, setRoster, setMsg }) {
  const [newSE, setNewSE] = useState({ se_name: '', region: '', zone: '', status: 'full', position: 'sales_executive' });

  async function addSE() {
    if (!newSE.se_name.trim()) return;
    const res  = await fetch('/api/settings/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSE),
    });
    const data = await res.json();
    if (data.error) { setMsg({ type: 'error', text: data.error }); return; }
    setRoster(p => [...p, { ...newSE, id: data.id }]);
    setNewSE({ se_name: '', region: '', zone: '', status: 'full', position: 'sales_executive' });
    setMsg({ type: 'success', text: `${newSE.se_name} added to roster.` });
  }

  async function updatePosition(id, position) {
    await fetch(`/api/settings/roster/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position }),
    });
    setRoster(p => p.map(r => r.id === id ? { ...r, position } : r));
    setMsg({ type: 'success', text: 'Position updated.' });
  }

  async function removeSE(id, name) {
    if (!confirm(`Remove ${name} from the active roster? Their historical data will be preserved.`)) return;
    await fetch(`/api/settings/roster/${id}`, { method: 'DELETE' });
    setRoster(p => p.filter(r => r.id !== id));
    setMsg({ type: 'success', text: `${name} removed.` });
  }

  const full  = roster.filter(r => r.status === 'full');
  const trial = roster.filter(r => r.status === 'trial');

  return (
    <div>
      {/* Add new SE */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Add New SE</h3>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <input placeholder="SE Name" value={newSE.se_name}
            onChange={e => setNewSE(p => ({ ...p, se_name: e.target.value }))}
            className="bg-slate-100 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900 col-span-2"
          />
          <input placeholder="Region" value={newSE.region}
            onChange={e => setNewSE(p => ({ ...p, region: e.target.value }))}
            className="bg-slate-100 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900"
          />
          <input placeholder="Zone" value={newSE.zone}
            onChange={e => setNewSE(p => ({ ...p, zone: e.target.value }))}
            className="bg-slate-100 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={newSE.status} onChange={e => setNewSE(p => ({ ...p, status: e.target.value }))}
            className="bg-slate-100 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900"
          >
            <option value="full">Full</option>
            <option value="trial">Trial</option>
          </select>
          <select value={newSE.position} onChange={e => setNewSE(p => ({ ...p, position: e.target.value }))}
            className="bg-slate-100 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900"
          >
            {POSITION_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <button onClick={addSE}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded transition-colors"
          >
            Add SE
          </button>
        </div>
      </div>

      <SEList label="Full SEs"  rows={full}  onRemove={removeSE} onPositionChange={updatePosition} />
      <SEList label="Trial SEs" rows={trial} onRemove={removeSE} onPositionChange={updatePosition} className="mt-6" />
    </div>
  );
}

function SEList({ label, rows, onRemove, onPositionChange, className = '' }) {
  return (
    <div className={className}>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{label} ({rows.length})</h3>
      <div className="space-y-1">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between bg-white border border-slate-200 rounded px-3 py-2">
            <div>
              <span className="text-sm text-slate-900 font-medium">{r.se_name}</span>
              <span className="text-xs text-slate-500 ml-2">{r.region} · {r.zone}</span>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={r.position || 'sales_executive'}
                onChange={e => onPositionChange(r.id, e.target.value)}
                className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs text-slate-900"
              >
                {POSITION_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <button onClick={() => onRemove(r.id, r.se_name)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Brands Tab ───────────────────────────────────────────────────────────────
function BrandsTab({ brands, setBrands, setMsg }) {
  const [newBrand, setNewBrand] = useState('');

  async function addBrand() {
    if (!newBrand.trim()) return;
    const res  = await fetch('/api/settings/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_name: newBrand.trim() }),
    });
    const data = await res.json();
    if (data.error) { setMsg({ type: 'error', text: data.error }); return; }
    setBrands(p => [...p, { id: data.id, brand_name: data.brand_name, active: 1, deleted: 0 }]);
    setNewBrand('');
    setMsg({ type: 'success', text: `${newBrand} added.` });
  }

  async function toggleActive(id, current) {
    await fetch(`/api/settings/brands/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: current ? 0 : 1 }),
    });
    setBrands(p => p.map(b => b.id === id ? { ...b, active: current ? 0 : 1 } : b));
  }

  async function deleteBrand(id, name) {
    if (!confirm(`Delete "${name}"? Historical data will be preserved.`)) return;
    await fetch(`/api/settings/brands/${id}`, { method: 'DELETE' });
    setBrands(p => p.filter(b => b.id !== id));
    setMsg({ type: 'success', text: `${name} deleted.` });
  }

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <input
          value={newBrand}
          onChange={e => setNewBrand(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addBrand()}
          placeholder="New brand name…"
          className="flex-1 bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900"
        />
        <button onClick={addBrand}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded transition-colors"
        >
          Add Brand
        </button>
      </div>

      <div className="space-y-1">
        {brands.map(b => (
          <div key={b.id} className={`flex items-center justify-between rounded px-3 py-2 border ${
            b.active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
          }`}>
            <span className={`text-sm ${b.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
              {b.brand_name}
            </span>
            <div className="flex gap-2">
              <button onClick={() => toggleActive(b.id, b.active)}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  b.active
                    ? 'text-yellow-400 hover:text-yellow-300'
                    : 'text-green-400 hover:text-green-300'
                }`}
              >
                {b.active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => deleteBrand(b.id, b.brand_name)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SE Profiles Tab ──────────────────────────────────────────────────────────
function ProfilesTab({ roster, setMsg }) {
  const [profileStatus, setProfileStatus] = useState({});
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    Promise.all(
      roster.map(se =>
        fetch(`/api/se-profile/${encodeURIComponent(se.se_name)}`)
          .then(r => r.json())
          .then(p => [se.se_name, p])
      )
    ).then(pairs => {
      setProfileStatus(Object.fromEntries(pairs));
    });
  }, [roster]);

  async function uploadProfile(seName, file) {
    setUploading(seName);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`/api/se-profile/${encodeURIComponent(seName)}`, {
        method: 'POST', body: fd,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProfileStatus(p => ({ ...p, [seName]: { ...p[seName], file_name: file.name } }));
      setMsg({ type: 'success', text: `Traits uploaded for ${seName}` });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
    setUploading(null);
  }

  async function deleteProfile(seName) {
    await fetch(`/api/se-profile/${encodeURIComponent(seName)}`, { method: 'DELETE' });
    setProfileStatus(p => ({ ...p, [seName]: { ...p[seName], file_name: null } }));
    setMsg({ type: 'success', text: `Profile removed for ${seName}` });
  }

  return (
    <div>
      <p className="text-sm text-slate-400 mb-4">
        Upload a .docx file per SE describing their personality, motivation style, and how to get the best from them.
        This is used by the AI Coach to personalize messages.
      </p>
      <div className="space-y-2">
        {roster.map(se => {
          const p = profileStatus[se.se_name];
          return (
            <div key={se.se_name} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{se.se_name}</p>
                {p?.file_name
                  ? <p className="text-xs text-green-400">{p.file_name}</p>
                  : <p className="text-xs text-slate-500">No profile</p>
                }
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer text-xs bg-slate-200 hover:bg-slate-300 text-slate-600 px-3 py-1.5 rounded transition-colors">
                  {uploading === se.se_name ? 'Uploading…' : p?.file_name ? 'Replace' : 'Upload .docx'}
                  <input
                    type="file" accept=".docx"
                    className="hidden"
                    disabled={uploading === se.se_name}
                    onChange={e => e.target.files[0] && uploadProfile(se.se_name, e.target.files[0])}
                  />
                </label>
                {p?.file_name && (
                  <button onClick={() => deleteProfile(se.se_name)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Integrations Tab ─────────────────────────────────────────────────────────
function IntegrationsTab({ settings, onSave }) {
  const [form, setForm] = useState({});
  useEffect(() => { setForm(settings); }, [settings]);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Telegram</h2>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.telegram_enabled === 'true'}
          onChange={e => setForm(p => ({ ...p, telegram_enabled: e.target.checked ? 'true' : 'false' }))}
          className="w-4 h-4"
        />
        <span className="text-sm text-slate-600">Enable Telegram delivery</span>
      </label>
      <label className="block">
        <span className="text-xs text-slate-400 mb-1 block">Webhook URL</span>
        <input
          type="text"
          value={form.telegram_webhook_url || ''}
          placeholder="https://api.telegram.org/bot.../sendMessage?chat_id=..."
          onChange={e => setForm(p => ({ ...p, telegram_webhook_url: e.target.value }))}
          className="w-full bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900"
        />
      </label>
      <button
        onClick={() => onSave({
          telegram_enabled:     form.telegram_enabled,
          telegram_webhook_url: form.telegram_webhook_url,
        })}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded transition-colors"
      >
        Save Integrations
      </button>
    </div>
  );
}
