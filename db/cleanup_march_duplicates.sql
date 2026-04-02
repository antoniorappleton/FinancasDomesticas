-- =====================================================================
-- SCRIPT DE LIMPEZA DE DUPLICADOS - MARÇO 2026
-- =====================================================================
-- Instruções: Copie este código e execute-o no "SQL Editor" do Supabase.

-- 1. IDENTIFICAR (OPCIONAL - Apenas para ver o que será apagado)
SELECT count(*), date, amount, description
FROM public.transactions
WHERE date >= '2026-03-01' AND date <= '2026-03-31'
GROUP BY user_id, date, amount, description, account_id, type_id
HAVING count(*) > 1;

-- 2. APAGAR DUPLICADOS (Mantém apenas o registo mais antigo de cada grupo)
DELETE FROM public.transactions
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY user_id, date, amount, description, account_id, type_id
                   ORDER BY created_at ASC, id ASC
               ) as row_num
        FROM public.transactions
        WHERE date >= '2026-03-01' AND date <= '2026-03-31'
    ) t
    WHERE t.row_num > 1
);

-- =====================================================================
-- TOTAL DE DUPLICADOS IDENTIFICADOS: ~80 registos.
-- =====================================================================
