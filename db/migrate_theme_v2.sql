-- Migration to enhance user_settings table to V2 Schema
-- Safe to run multiple times (idempotent)

-- 1. Add new columns if they don't exist
DO $$
BEGIN
  -- Background
  BEGIN ALTER TABLE public.user_settings ADD COLUMN bg_color text; EXCEPTION WHEN duplicate_column THEN END;
  BEGIN ALTER TABLE public.user_settings ADD COLUMN bg_blur_px integer; EXCEPTION WHEN duplicate_column THEN END;
  
  -- Overlay
  BEGIN ALTER TABLE public.user_settings ADD COLUMN overlay_color text; EXCEPTION WHEN duplicate_column THEN END;
  
  -- Cards
  BEGIN ALTER TABLE public.user_settings ADD COLUMN card_bg_rgba text; EXCEPTION WHEN duplicate_column THEN END;
  BEGIN ALTER TABLE public.user_settings ADD COLUMN card_border_rgba text; EXCEPTION WHEN duplicate_column THEN END;
  BEGIN ALTER TABLE public.user_settings ADD COLUMN card_blur_px integer; EXCEPTION WHEN duplicate_column THEN END;
  
  -- Structure
  BEGIN ALTER TABLE public.user_settings ADD COLUMN header_bg_rgba text; EXCEPTION WHEN duplicate_column THEN END;
  BEGIN ALTER TABLE public.user_settings ADD COLUMN menu_bg_rgba text; EXCEPTION WHEN duplicate_column THEN END;
  BEGIN ALTER TABLE public.user_settings ADD COLUMN fab_bg text; EXCEPTION WHEN duplicate_column THEN END;
END $$;

-- 2. Optional: Rename old columns to migrate data? 
-- For now we just keep old columns as legacy junk to avoid data loss. 
-- The app will just write to the new columns.
