"""
One-time history import script.

Reads two Excel files from the Resources folder and populates:
  1. coaching_history  — historical coaching messages per SE (from SE Coach Feedback.xlsx)
  2. agent_memory      — Gemini-synthesized baseline memory per SE (from SE Feedback Detailed Report Log.xlsx)

Run: python scripts/import-history.py
"""

import zipfile
import xml.etree.ElementTree as ET
import json
import urllib.request
import urllib.error
import urllib.parse
import re
from datetime import datetime, timedelta

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL     = 'https://slmjwnjngfbcisudguxw.supabase.co'
SUPABASE_KEY     = 'SUPABASE_KEY_REMOVED'
GEMINI_API_KEY   = 'GEMINI_KEY_REMOVED'
GEMINI_MODEL     = 'gemini-2.5-flash'

COACH_FILE       = 'c:/Users/BIZDEV2/OneDrive/Desktop/Workflow Update/Resources/SE Coach Feedback.xlsx'
FEEDBACK_FILE    = 'c:/Users/BIZDEV2/OneDrive/Desktop/Workflow Update/Resources/SE Feedback Detailed Report Log.xlsx'

# ── Name normalisation map (partial/variant → canonical roster name) ──────────

NAME_MAP = {
    'ngoyo blessing':       'Ngoyo Blessing Thomas',
    'ngoyo blessing thomas':'Ngoyo Blessing Thomas',
    'joseph, your':         None,   # malformed — skip
    'the salesman':         None,   # error row — skip
    'steven micheal':       None,   # deleted SE — skip
    'steven micheal emeje': None,   # deleted SE — skip
    'ejim emmanuel':        None,   # not on current roster — skip
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def excel_to_date(val):
    """Convert Excel serial or 'DD-MM-YY' text to 'YYYY-MM-DD'."""
    if not val:
        return None
    try:
        serial = float(str(val).strip())
        return (datetime(1899, 12, 30) + timedelta(days=serial)).strftime('%Y-%m-%d')
    except Exception:
        pass
    try:
        parts = str(val).strip().split('-')
        if len(parts) == 3 and len(parts[2]) == 2:
            return f'20{parts[2]}-{parts[1]}-{parts[0]}'
    except Exception:
        pass
    return None


def read_xlsx(path):
    """Parse an .xlsx file and return a list of rows (list of strings)."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.parse(z.open('xl/sharedStrings.xml'))
            root = tree.getroot()
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in root.findall('ns:si', ns):
                parts = si.findall('.//ns:t', ns)
                shared.append(''.join(p.text or '' for p in parts))

        tree = ET.parse(z.open('xl/worksheets/sheet1.xml'))
        root = tree.getroot()
        ns   = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        rows = []
        for row in root.findall('.//ns:row', ns):
            cells = []
            for c in row.findall('ns:c', ns):
                t = c.get('t')
                v = c.find('ns:v', ns)
                if v is None:
                    cells.append('')
                elif t == 's':
                    cells.append(shared[int(v.text)])
                else:
                    cells.append(v.text or '')
            rows.append(cells)
        return rows


def normalise_name(raw):
    """Return canonical SE name or None if row should be skipped."""
    if not raw:
        return None
    cleaned = raw.strip().rstrip(',').strip()
    lower   = cleaned.lower()

    # Check explicit map first
    for pattern, canonical in NAME_MAP.items():
        if lower.startswith(pattern):
            return canonical  # None = skip

    return cleaned


def supabase_get(path, params=None):
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def supabase_upsert(table, rows, conflict):
    url  = f'{SUPABASE_URL}/rest/v1/{table}'
    data = json.dumps(rows).encode()
    req  = urllib.request.Request(url, data=data, method='POST', headers={
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type':  'application/json',
        'Prefer':        f'resolution=merge-duplicates,return=minimal',
    })
    req.add_header('Prefer', f'resolution=merge-duplicates,return=minimal')
    # Override upsert via on_conflict param
    url += f'?on_conflict={conflict}'
    req = urllib.request.Request(url, data=data, method='POST', headers={
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal',
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'  Upsert error {e.code}: {body[:200]}')
        return e.code


def gemini_generate(prompt):
    url  = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}'
    body = json.dumps({'contents': [{'parts': [{'text': prompt}]}]}).encode()
    req  = urllib.request.Request(url, data=body, method='POST',
                                   headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
        return result['candidates'][0]['content']['parts'][0]['text'].strip()


# ── Step 1: Load active roster ────────────────────────────────────────────────

print('Loading active roster from Supabase...')
roster_rows = supabase_get('team_roster', {'select': 'se_name,position,zone', 'deleted': 'eq.0'})
active_names = {r['se_name'].lower(): r['se_name'] for r in roster_rows}
print(f'  {len(active_names)} active SEs: {", ".join(r["se_name"] for r in roster_rows)}')


def resolve_name(raw):
    """Resolve raw name to canonical roster name, or None if not active/skippable."""
    canonical = normalise_name(raw)
    if canonical is None:
        return None
    # Exact match (case-insensitive)
    if canonical.lower() in active_names:
        return active_names[canonical.lower()]
    # Partial match — first name + last name
    parts = canonical.lower().split()
    for roster_lower, roster_canonical in active_names.items():
        roster_parts = roster_lower.split()
        if parts[0] == roster_parts[0] and (len(parts) == 1 or parts[-1] == roster_parts[-1]):
            return roster_canonical
    return None  # Not on active roster


# ── Step 2: Parse SE Coach Feedback → coaching_history ───────────────────────

print('\nParsing SE Coach Feedback.xlsx...')
coach_rows_raw = read_xlsx(COACH_FILE)
coach_records  = []

for row in coach_rows_raw[1:]:  # skip header
    if len(row) < 3 or not row[1] or not row[2]:
        continue
    date    = excel_to_date(row[0])
    se_name = resolve_name(row[1])
    message = row[2].strip()

    if not date or not se_name or len(message) < 30:
        continue

    coach_records.append({
        'report_date':      date,
        'se_name':          se_name,
        'coaching_message': message,
        'analysis_json':    None,
    })
    print(f'  Coach msg: {se_name} | {date}')

print(f'  {len(coach_records)} valid coaching records found.')

if coach_records:
    status = supabase_upsert('coaching_history', coach_records, 'report_date,se_name')
    print(f'  Upserted to coaching_history (status {status})')


# ── Step 3: Parse Feedback Detailed Log → group by SE ─────────────────────────

print('\nParsing SE Feedback Detailed Report Log.xlsx...')
feed_rows_raw = read_xlsx(FEEDBACK_FILE)
feed_by_se    = {}  # se_name → list of {date, details}

for row in feed_rows_raw[1:]:  # skip header
    if len(row) < 3 or not row[1] or not row[2]:
        continue
    date    = excel_to_date(row[0])
    se_name = resolve_name(row[1])
    details = row[2].strip()

    if not date or not se_name or len(details) < 20:
        continue

    if se_name not in feed_by_se:
        feed_by_se[se_name] = []
    feed_by_se[se_name].append({'date': date, 'details': details})

print(f'  Field feedback grouped for: {", ".join(feed_by_se.keys())}')


# ── Step 4: Also group coach messages by SE for context ───────────────────────

coach_by_se = {}
for rec in coach_records:
    se = rec['se_name']
    if se not in coach_by_se:
        coach_by_se[se] = []
    coach_by_se[se].append({'date': rec['report_date'], 'message': rec['coaching_message']})


# ── Step 5: Synthesize agent_memory per SE using Gemini ───────────────────────

print('\nSynthesizing agent_memory bootstraps using Gemini...')

# Check which SEs already have memory
existing_memory = supabase_get('agent_memory', {'select': 'se_name'})
existing_se_names = {r['se_name'] for r in existing_memory}
print(f'  SEs already with memory: {existing_se_names or "none"}')

all_ses_with_data = set(list(feed_by_se.keys()) + list(coach_by_se.keys()))

for se_name in sorted(all_ses_with_data):
    if se_name in existing_se_names:
        print(f'  Skipping {se_name} — memory already exists')
        continue

    feedback_entries = feed_by_se.get(se_name, [])
    coach_entries    = coach_by_se.get(se_name, [])

    feedback_text = '\n---\n'.join(
        f'[{e["date"]}] {e["details"][:600]}' for e in feedback_entries
    ) or 'No field feedback records.'

    coach_text = '\n---\n'.join(
        f'[{e["date"]}] {e["message"][:400]}' for e in coach_entries
    ) or 'No coaching history.'

    prompt = f"""You are the Recorder Agent for a sales coaching AI at Speckless.

Synthesize a baseline memory record for this field sales executive based on their historical data.

SE NAME: {se_name}

HISTORICAL FIELD FEEDBACK (store visits, product observations):
{feedback_text}

HISTORICAL COACHING MESSAGES SENT TO THEM:
{coach_text}

Based on all available evidence, create an initial memory record. Return JSON ONLY:
{{
  "behavioural_patterns": ["observed patterns across sessions (max 6 items)"],
  "performance_trend": "overall performance trajectory description from historical data",
  "coaching_response_history": ["how this SE tends to respond to coaching based on patterns"],
  "recurring_gaps": ["gaps that appear repeatedly in their history"],
  "strengths_confirmed": ["strengths consistently demonstrated in the data"],
  "communication_notes": ["notes on communication style and what seems to work"],
  "last_score": null,
  "last_rank": null,
  "sessions_tracked": {len(feedback_entries) + len(coach_entries)},
  "last_updated": "{max([e['date'] for e in feedback_entries + coach_entries], default='2026-03-06')}",
  "summary": "one paragraph summary of this SE's trajectory and what the coach should know going in"
}}"""

    print(f'  Synthesizing memory for {se_name}...')
    try:
        raw      = gemini_generate(prompt)
        raw      = raw.replace('```json', '').replace('```', '').strip()
        memory   = json.loads(raw)
        payload  = [{
            'se_name':      se_name,
            'memory_json':  memory,
            'last_updated': datetime.now().isoformat(),
        }]
        status = supabase_upsert('agent_memory', payload, 'se_name')
        print(f'    Saved memory for {se_name} (status {status})')
    except Exception as e:
        print(f'    Error for {se_name}: {e}')

print('\nImport complete.')
