-- ================================================
-- Migration v3: Add onboarding flag to profiles
-- Run this in Supabase SQL Editor
-- ================================================

-- Add onboarded column (defaults to false for new users)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarded boolean DEFAULT false;

-- Mark ALL existing users as onboarded so they skip the flow
UPDATE public.profiles SET onboarded = true WHERE onboarded IS NULL OR onboarded = false;
