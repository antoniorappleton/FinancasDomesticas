-- Migration: mover os ajustes manuais de despesas fixas (projeção de cashflow do
-- Dashboard) de localStorage para a base de dados, para ficarem consistentes
-- entre dispositivos (browser/tablet).
-- Run this in the Supabase SQL Editor

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS fixed_projection_overrides jsonb DEFAULT '{}'::jsonb;

-- Estrutura esperada (chave = ano):
-- {
--   "2026": {
--     "enabled": true,
--     "items": [
--       { "label": "Renda", "amount": 850, "months": [1,2,3,4,5,6,7,8,9,10,11,12] }
--     ]
--   }
-- }
