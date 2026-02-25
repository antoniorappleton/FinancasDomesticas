-- =====================================================================
-- COMPREHENSIVE SECURITY FIX: RLS, Search Paths, and Extensions
-- =====================================================================

-- 1. Enable RLS on backup tables
alter table if exists public.categories_backup_20260208 enable row level security;
alter table if exists public.transactions_backup_20260208 enable row level security;

-- 2. Move extensions to a dedicated schema
create schema if not exists extensions;
-- Move unaccent if it exists and is in public
do $$
begin
    if exists (select 1 from pg_extension where extname = 'unaccent') then
        alter extension unaccent set schema extensions;
    end if;
end $$;

-- 3. Robustly set search_path = public for flagged functions
-- This uses pg_proc to find the functions and their exact signatures
do $$
declare
    func_record record;
begin
    for func_record in 
        select n.nspname, p.proname, pg_get_function_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.proname IN (
            'trg_set_updated_at', 
            'to_slug', 
            'trg_set_signed_amount', 
            'tg_objectives_updated_at', 
            'tg_objectives_set_user', 
            'get_daily_digest', 
            'trg_set_expense_nature', 
            'f_unaccent', 
            'canon', 
            'name_norm', 
            'handle_new_user'
          )
    loop
        execute format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
                       func_record.nspname, func_record.proname, func_record.args);
    end loop;
end $$;
