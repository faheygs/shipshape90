-- ================================================
-- Migration v4: Add 'submitted' flag to daily_logs
-- Run this in Supabase SQL Editor
-- ================================================

ALTER TABLE public.daily_logs
ADD COLUMN IF NOT EXISTS submitted boolean DEFAULT false;
