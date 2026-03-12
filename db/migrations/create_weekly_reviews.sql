-- Run this in your Supabase SQL editor to enable the Weekly Review feature

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id              BIGSERIAL PRIMARY KEY,
  se_name         TEXT NOT NULL,
  week_ending     DATE NOT NULL,
  week_start      DATE,
  review_text     TEXT,
  review_json     JSONB,
  avg_score       NUMERIC,
  high_score      NUMERIC,
  low_score       NUMERIC,
  days_on_record  INTEGER,
  generated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(se_name, week_ending)
);

CREATE INDEX IF NOT EXISTS weekly_reviews_se_name_idx ON weekly_reviews(se_name);
CREATE INDEX IF NOT EXISTS weekly_reviews_week_ending_idx ON weekly_reviews(week_ending);
