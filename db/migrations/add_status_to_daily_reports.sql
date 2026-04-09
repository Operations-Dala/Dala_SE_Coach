-- Migration: add status column to daily_reports
-- Run this once in the Supabase SQL Editor

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'full';
