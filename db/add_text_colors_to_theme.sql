-- Migration to add text color columns to user_settings
-- Run this in the Supabase SQL Editor

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS text_main text DEFAULT '#0f172a',
ADD COLUMN IF NOT EXISTS text_secondary text DEFAULT '#64748b';

-- Update existing rows to have default values if they are null
UPDATE public.user_settings 
SET text_main = '#0f172a' 
WHERE text_main IS NULL;

UPDATE public.user_settings 
SET text_secondary = '#64748b' 
WHERE text_secondary IS NULL;
