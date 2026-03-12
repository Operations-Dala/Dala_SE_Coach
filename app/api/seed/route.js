import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { seedDefaults } from '@/lib/parameters';

const PROJECT_REF = 'slmjwnjngfbcisudguxw';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS daily_reports (
  id BIGSERIAL PRIMARY KEY,
  report_date TEXT NOT NULL,
  se_name TEXT NOT NULL,
  region TEXT, zone TEXT, resumption_time TEXT,
  stores_visited INT DEFAULT 0, brands_ordered INT DEFAULT 0,
  orders_generated INT DEFAULT 0, value_of_orders FLOAT DEFAULT 0,
  complete_report INT DEFAULT 0, avg_value_per_bp FLOAT DEFAULT 0,
  avg_value_per_store FLOAT DEFAULT 0, at_risk_debt FLOAT DEFAULT 0,
  time_score FLOAT DEFAULT 0, visit_score FLOAT DEFAULT 0,
  brand_score FLOAT DEFAULT 0, efficiency_score FLOAT DEFAULT 0,
  debt_score FLOAT DEFAULT 30, total_score FLOAT DEFAULT 0,
  rank INT, brand_coverage TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_date, se_name)
);
CREATE TABLE IF NOT EXISTS coaching_history (
  id BIGSERIAL PRIMARY KEY, report_date TEXT NOT NULL, se_name TEXT NOT NULL,
  analysis_json TEXT, coaching_message TEXT, generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_date, se_name)
);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS team_roster (
  id BIGSERIAL PRIMARY KEY, se_name TEXT NOT NULL, region TEXT, zone TEXT,
  status TEXT DEFAULT 'full', deleted INT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS brand_partners (
  id BIGSERIAL PRIMARY KEY, brand_name TEXT NOT NULL, active INT DEFAULT 1, deleted INT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS se_profiles (
  id BIGSERIAL PRIMARY KEY, se_name TEXT NOT NULL UNIQUE,
  traits_text TEXT, file_name TEXT, uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS feedback_details (
  id BIGSERIAL PRIMARY KEY,
  report_date TEXT NOT NULL,
  se_name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  survey_name TEXT,
  question TEXT,
  answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add position column to team_roster if missing (idempotent migration)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_roster' AND column_name = 'position'
  ) THEN
    ALTER TABLE team_roster ADD COLUMN position TEXT DEFAULT 'sales_executive';
  END IF;
END $$;

-- Add unique constraints if missing (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_roster_se_name_key'
      AND conrelid = 'team_roster'::regclass
  ) THEN
    ALTER TABLE team_roster ADD CONSTRAINT team_roster_se_name_key UNIQUE (se_name);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_partners_brand_name_key'
      AND conrelid = 'brand_partners'::regclass
  ) THEN
    ALTER TABLE brand_partners ADD CONSTRAINT brand_partners_brand_name_key UNIQUE (brand_name);
  END IF;
END $$;
`;

async function createTables() {
  // Try service role key first, then a dedicated access token if provided
  const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SCHEMA_SQL }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    // If the service role key was rejected, guide the user to get a PAT
    throw new Error(
      `Could not auto-create tables (${res.status}): ${body}\n\n` +
      `To fix: go to https://supabase.com/dashboard/account/tokens, ` +
      `create a Personal Access Token, then add it to .env.local as:\n` +
      `SUPABASE_ACCESS_TOKEN=your_token_here\n` +
      `and restart the dev server.`
    );
  }
}

export async function GET() {
  try {
    await createTables();
    await seedDefaults(supabase);
    return NextResponse.json({
      success: true,
      message: 'Tables created and database seeded with defaults.',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
