# SE Coach — Project Overview
*Last updated: 2026-03-09*

---

## What Is This?

**SE Coach** is an internal web application built for **Speckless** to track, score, and AI-coach their field Sales Executives (SEs) on a daily basis. It ingests daily Excel exports from PepUp (a field sales platform), computes performance scores, and runs a multi-agent AI pipeline using Google Gemini to produce personalized coaching messages for each SE.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4 |
| Charts | Recharts |
| Database | Supabase (PostgreSQL) |
| Local DB file | SQLite (`db/se-coach.db`) |
| AI | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| File parsing | `xlsx` (Excel), `mammoth` (DOCX) |
| Language | JavaScript (no TypeScript) |

---

## Team Structure

The app is pre-configured for 9 SEs across 4 zones:

| SE Name | Zone | Position |
|---------|------|----------|
| Olajumoke Ganiyu | All Corporate | Corporate SE |
| Joseph Femi | Zone 1 | Senior SE |
| Bright Marcus | Zone 1 | Sales Executive |
| Toba Meafhase | Zone 2 | Senior SE |
| Folorunso Omotola | Zone 2 | Sales Executive |
| Omodolapo Alumona | Zone 3 | Sales Executive |
| Okonofua Amina | Zone 3 | Sales Executive |
| Adeola Ganiyu | Zone 4 | Sales Executive |
| Ngoyo Blessing Thomas | Trial | Trial |

**25 Brand Partners** tracked for coverage (AMAN Blessed, Atun Foods, AugustSecrets, Sooyah, Zayith, Zeef, Biniowan Enterprises, Dizauregi, Madala Beverages Limited, and 16 others).

---

## Application Pages

### 1. Dashboard (`/`) — `app/page.js`
The primary operations hub. Features:
- **Date picker** — view any historical date's report
- **Import Data panel** with two upload tabs:
  - **Daily PepUp Files** — 3 Excel files: Check-in/Check-out, Product Report, Feedback Detail Report
  - **Weekly Debt Sheet** — Excel with SE name, debt amount, week date
- **Debt score manual inputs** — pre-filled from last week's data, adjustable per SE
- **KPI Cards** — Team Avg Score (with delta vs yesterday), Reporting Count, Total Value (₦), Outstanding Debt
- **Zone Debt Breakdown** — debt by zone from latest weekly upload
- **View toggle** — "By Zone" table or "Ranked List"
- **Status filter** — filter SEs by: All / Rising / At Risk / Below Expectation / Watch / On Track
- **Zone Tables** — per-zone SE tables showing rank, resumption time, stores, brands, orders, value, avg/store, score, coaching status
- **Rank deltas** — ↑↓ movement vs previous day shown on each SE row
- **Performance Trends section** — 30-day line chart (orders + value) and weekly debt bar chart
- **Right sidebar** — Latest Report summary, Coaching Status progress bar, Debt by Zone breakdown
- **⚡ Generate Coaching** button — triggers the A2A AI pipeline

### 2. SE Detail Page (`/se/[name]`) — `app/se/[name]/page.js`
Drilldown for an individual SE on a given date. Features:
- **Score Breakdown** — animated bars for Brand Coverage (40pts), Debt (30pts), Efficiency (15pts), Visits (10pts), Punctuality (5pts)
- **Today's Metrics** — resumption time, stores, brands, orders, value, survey reports, avg per BP, avg per store, rank
- **Brand Coverage** — visual chips for Missed brands (red) and Covered brands (green)
- **Feedback Activity** — structured Q&A from the detailed feedback report, grouped by store → brand
- **Analyst Findings** — AI-generated gaps, strengths, trend label, priority action
- **AI Coaching Message** — full personalized coaching message with Generate / Regenerate button
- **7-Day Trend** — score history bars per day
- **SE Traits Profile** — upload a `.docx` personality profile file used to personalize AI coaching

### 3. SE Analytics (`/se-analytics`) — `app/se-analytics/page.js`
Team-level performance trends page. Features:
- **Time range selector** — 7d / 14d / 30d
- **KPI cards** — Total Orders, Total Value (₦M), Avg Daily Orders, Latest Team Debt with week-on-week delta
- **Daily Orders & Value area chart** — dual Y-axis with gradient fills
- **Outstanding Team Debt bar chart** — weekly view with zone breakdown for latest week

### 4. History Import (`/import`) — `app/import/page.js`
UI for importing historical data (page exists; content TBD).

### 5. Settings (`/settings`) — `app/settings/page.js`
Six-tab configuration panel:

| Tab | What it controls |
|-----|-----------------|
| **General** | Min/Advanced store targets, cash inflow thresholds, surveys target, score weight sliders, Gemini API key |
| **Tier Expectations** | Rank band thresholds for each tier (min score, min brand %, min stores) |
| **Team Roster** | Add / remove SEs; assign position (Corporate SE, Senior SE, Sales Executive, Junior SE, Trial) |
| **Brand Partners** | Add / activate / deactivate / delete brand partners |
| **SE Profiles** | Upload per-SE `.docx` personality files used by the AI coach |
| **Integrations** | Telegram webhook URL and enable/disable toggle |

---

## Scoring System (`lib/scorer.js`)

Each SE is scored **out of 100** per day across five components:

| Component | Max Points | Logic |
|-----------|-----------|-------|
| **Time** | 5 | ≤ 08:50 → 5 pts · ≤ 09:00 → 3 pts · after 09:00 → 0 |
| **Visits** | 10 | Proportional between min target (8) and advanced target (10) |
| **Brand Coverage** | 40 | `(brands_ordered / total_active_brands) × 40` |
| **Efficiency** | 15 | `(complete_reports / surveys_target) × 15`, capped at 15 |
| **Debt** | 30 | Manual input (0–30), pre-filled from last weekly upload |

Rankings are assigned separately for full SEs and trial SEs.

---

## Tier & Status Engine (`lib/tier-engine.js`)

### Tiers (configurable via Settings)
| Tier | Label | Rank Band | Min Score | Min Brand % | Min Stores |
|------|-------|-----------|-----------|-------------|------------|
| T1 | Elite | 1–3 | 80 | 85% | 11 |
| T2 | Strong | 4–7 | 65 | 70% | 10 |
| T3 | Developing | 8–11 | 50 | 55% | 9 |
| T4 | At Risk | 12–15 | 40 | 40% | 8 |

### Position Adjustments (applied on top of tier thresholds)
| Position | Score Adj | Brand Adj | Stores Adj |
|----------|-----------|-----------|------------|
| Corporate SE | +10 | +8 | +1 |
| Senior SE | +5 | +5 | −5 (oversight role) |
| Sales Executive | 0 | 0 | 0 |
| Junior SE | −5 | −5 | −1 |
| Trial | exempt | exempt | exempt |

### Status Labels (5 levels)
- **Rising** — improved ≥1 tier vs 7 days ago
- **At Risk** — dropped ≥1 tier AND failing KPIs
- **Below Expectation** — within same tier but failing one or more KPIs
- **Watch** — meets KPIs but rank trending down
- **On Track** — all checks pass

---

## Data Pipeline (`lib/data-engine.js`)

When 3 PepUp Excel files are uploaded, the engine:

1. **Parses Check-in/Check-out report** — extracts stores visited and first check-in time per SE
2. **Parses Product Report** — extracts brands ordered, order IDs, and total order value per SE
3. **Parses Feedback Detail Report** — extracts survey completions and per-store Q&A per SE (excludes "Outlet Feedback" rows)
4. **Builds brand coverage matrix** — fuzzy name matching between PepUp brand names and registered brand partners (handles partial names like "Kitchen Smith International Foods Ltd" → "Kitchen Smith")
5. **Returns** `seMetrics[]` and `feedbackRows[]` for storage

Column mapping is hardcoded per report type (`COL` object in `data-engine.js`), matched to the exact PepUp export format.

---

## A2A Multi-Agent Coaching System

### Architecture

The coaching pipeline is a **6-agent, 4-phase A2A (Agent-to-Agent) system** powered by Google Gemini 2.5 Flash.

```
Phase 1 (parallel):
  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
  │ Performance     │  │ Behaviour       │  │ Debt         │  │ Recorder (read)  │
  │ Agent           │  │ Agent           │  │ Agent        │  │ + Coach Patterns │
  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘  └────────┬─────────┘
           └──────────────────────────────────────────────────────────┘
                                       │
Phase 2:                               ▼
                             ┌──────────────────┐
                             │ Resource Agent   │
                             └────────┬─────────┘
                                      │
Phase 3:                              ▼
                             ┌──────────────────┐
                             │   Coach Agent    │ ← synthesizes all inputs
                             └────────┬─────────┘
                                      │
Phase 4 (async):                      ▼
                             ┌──────────────────┐
                             │ Recorder (write) │ ← updates long-term memory
                             └──────────────────┘
```

### Agents

| Agent | File | Role |
|-------|------|------|
| **Performance Agent** | `lib/agents/performance-agent.js` | Analyses scores, trends, zone comparison, brand coverage gaps, risk flags. Returns structured JSON with `performance_level`, `score_trend`, `week_trajectory`, `key_gaps`, `missed_brands_priority`, etc. |
| **Behaviour Agent** | `lib/agents/behaviour-agent.js` | Analyses personality, communication style, motivation drivers, coaching resistance. Returns tone and personalization hooks. |
| **Debt Agent** | `lib/agents/debt-agent.js` | Assesses debt status, zone-level debt standing, flags zone debt alerts. For Senior SEs: evaluates zone debt accountability. |
| **Resource Agent** | `lib/agents/resource-agent.js` | Uses Phase 1 outputs to identify relevant coaching resources. |
| **Coach Agent** | `lib/agents/coach-agent.js` | Synthesizes all specialist outputs + traits profile + feedback Q&A + coaching knowledge base → generates 150–250 word personalized coaching message. |
| **Recorder Agent** | `lib/agents/recorder-agent.js` | Reads/writes long-term SE memory (`agent_memory` table in Supabase). Maintains behavioural patterns, coaching response history, recurring gaps, confirmed strengths. |
| **Orchestrator** | `lib/agents/orchestrator.js` | Runs the full pipeline per SE; `runTeamPipeline` runs all SEs in parallel via `Promise.all`. |

### Legacy Two-Step Pipeline (`lib/ai-coach.js`)
An earlier, simpler pipeline (Step 1: Analyst Agent → Step 2: Coach Agent) still exists in the codebase but has been superseded by the A2A orchestrator. The `POST /api/coach` route now calls `runTeamPipeline` from the orchestrator.

---

## Coaching Knowledge Base (`lib/coaching-knowledge-base.md`)

A structured markdown file loaded into the Coach Agent at generation time. Contains:

- **Speckless-specific role coaching context** — KPIs, coaching angles, and phrases for Corporate SE, Senior SE, Junior SE, and Trial SE roles
- **Zone accountability model** — how zone performance is layered across Seniors and Juniors
- **GROW Model** (Whitmore) — coaching conversation framework
- **SBI Feedback Model** (CCL) — Situation → Behavior → Impact
- **WOOP Framework** (Oettingen) — Wish → Outcome → Obstacle → Plan
- **Self-Determination Theory** (Ryan & Deci) — Autonomy, Competence, Relatedness
- **Locke & Latham Goal-Setting Theory** — specific, challenging, committed goals
- **Growth Mindset** (Dweck) — fixed vs growth mindset language shifts
- **Feedback delivery by tier** — high performer, mid-range, underperformer techniques
- **Reattribution Technique** — redirecting external blame to controllable actions
- **Implementation Intentions** (Gollwitzer) — if-then commitment plans
- **High-Impact Coaching Phrases** — curated per-scenario phrase library
- **Framework Hint System** — `buildFrameworkHint()` selects the right psychological tools based on analyst `risk_level` and `trend`

The KB is refreshable via the `/refresh-coaching-kb` Claude Code slash command.

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/upload` | POST | Parse 3 PepUp Excel files + debt scores → score, rank, upsert to Supabase |
| `/api/upload/debt` | POST | Upload weekly debt Excel sheet → store in `weekly_debt` table |
| `/api/coach` | POST | Run A2A pipeline for all SEs (or one SE) → store in `coaching_history` |
| `/api/reports` | GET | Fetch daily reports by date and/or SE name |
| `/api/analytics` | GET | Team analytics for a date range (summary + enriched SE list with tier/status) |
| `/api/trends` | GET | 30-day daily trend + weekly debt trend data |
| `/api/feedback` | GET | Feedback Q&A details per SE for a date |
| `/api/se-profile/[name]` | GET/POST/DELETE | SE traits profile (stores extracted DOCX text in Supabase) |
| `/api/settings` | GET/PUT | Read / update settings key-value store |
| `/api/settings/roster` | GET/POST | Read all SEs / add new SE |
| `/api/settings/roster/[id]` | PATCH/DELETE | Update position / remove SE |
| `/api/settings/brands` | GET/POST | Read brands / add brand |
| `/api/settings/brands/[id]` | PATCH/DELETE | Toggle active / delete brand |
| `/api/telegram` | POST | Send coaching message via Telegram webhook |
| `/api/seed` | GET | Seed default roster, brands, and settings into Supabase |

---

## Database (Supabase)

Key tables:

| Table | Purpose |
|-------|---------|
| `daily_reports` | One row per SE per day — all metrics, scores, rank, brand coverage JSON |
| `coaching_history` | AI coaching message + analysis JSON per SE per day |
| `feedback_details` | Per-row feedback Q&A (store, brand, question, answer, date, SE) |
| `team_roster` | SE names, zones, regions, positions, status (full/trial) |
| `brand_partners` | Brand names with active/deleted flags |
| `settings` | Key-value store for all configuration |
| `se_profiles` | SE name → traits_text (extracted from uploaded DOCX) + file_name |
| `agent_memory` | Long-term SE memory JSON maintained by the Recorder Agent |
| `weekly_debt` | Weekly debt amounts per SE per week date |

---

## Scripts

### `scripts/import-history.py`
A one-time Python script that bootstraps historical data into Supabase. It:
1. Parses `SE Coach Feedback.xlsx` → inserts historical coaching messages into `coaching_history`
2. Parses `SE Feedback Detailed Report Log.xlsx` → groups field feedback by SE
3. Calls Gemini to synthesize a baseline `agent_memory` record per SE from all historical data
4. Uses fuzzy name normalization to map variant SE names to canonical roster names

---

## Configuration & Environment

**`.env.local`** — contains Supabase URL and anon key.

Key settings stored in the DB (`settings` table, editable via the Settings page):

| Key | Default | Purpose |
|-----|---------|---------|
| `min_store_target` | 8 | Minimum stores for partial visit score |
| `advanced_store_target` | 10 | Target for full visit score |
| `surveys_target` | 15 | Denominator for efficiency score |
| `score_time` | 5 | Max time score |
| `score_visits` | 10 | Max visit score |
| `score_brands` | 40 | Max brand score |
| `score_efficiency` | 15 | Max efficiency score |
| `score_debt` | 30 | Max debt score |
| `gemini_api_key` | — | Google Gemini API key |
| `telegram_webhook_url` | — | Telegram bot webhook |
| `telegram_enabled` | false | Toggle Telegram delivery |
| `tier_config` | JSON array | Tier band definitions |

---

## Component Structure

```
app/
  layout.js                  Root layout (Sidebar + main content)
  page.js                    Dashboard (Home)
  components/
    Sidebar.js               Left nav sidebar
  se/[name]/page.js          SE detail drilldown
  se-analytics/page.js       Team analytics
  import/page.js             History import UI
  history/page.js            History browser
  settings/page.js           Settings (6 tabs)
  api/
    upload/route.js          PepUp Excel upload + scoring
    upload/debt/route.js     Weekly debt upload
    coach/route.js           A2A coaching pipeline trigger
    reports/route.js         Daily report queries
    analytics/route.js       Analytics aggregation
    trends/route.js          Trend data
    feedback/route.js        Feedback Q&A
    se-profile/[name]/       SE profile CRUD
    settings/                Settings + roster + brands CRUD
    telegram/route.js        Telegram delivery
    seed/route.js            Initial data seed

lib/
  data-engine.js             Excel parsing + metric extraction
  scorer.js                  Scoring (out of 100) + ranking
  tier-engine.js             Tier assignment + status evaluation
  parameters.js              Default roster, brands, settings
  supabase.js                Supabase client
  ai-coach.js                Legacy 2-step coaching pipeline
  coaching-knowledge-base.md  AI coaching reference document
  doc-parser.js              DOCX → text extractor (mammoth)
  agents/
    orchestrator.js          A2A pipeline runner
    performance-agent.js     Score/trend analysis
    behaviour-agent.js       Personality/motivation analysis
    debt-agent.js            Debt status analysis
    resource-agent.js        Coaching resource lookup
    coach-agent.js           Final message generation
    recorder-agent.js        Long-term SE memory R/W

scripts/
  import-history.py          One-time historical data bootstrap
```

---

## Claude Code Skills

Two custom slash commands are registered in `.claude/commands/`:

| Command | Purpose |
|---------|---------|
| `/coach-se` | SE Coaching Advisor — in-context coaching analysis tool |
| `/refresh-coaching-kb` | Rebuilds `lib/coaching-knowledge-base.md` from web research |

---

## Git History Summary

| Commit | What was done |
|--------|--------------|
| `e74e39a` | Initial commit from Create Next App |
| `e56f2be` | Stable version: zone/ranked-list toggle, updated brand partners, Ngoyo added as trial SE |
| `a1ff0c2` | Built A2A multi-agent coaching system (6 agents + orchestrator) |
| `0e96f64` | Added history import script for SE historical data |
