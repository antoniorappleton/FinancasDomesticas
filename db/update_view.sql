CREATE OR REPLACE VIEW public.v_monthly_summary AS 
SELECT 
  t.user_id, 
  date_trunc('month', t.date)::date AS month, 
  sum(CASE WHEN tt.code IN ('INCOME', 'TRANSFER_IN') THEN t.amount ELSE 0 END) AS income, 
  sum(CASE WHEN tt.code IN ('EXPENSE', 'TRANSFER_OUT') THEN -t.amount ELSE 0 END) AS expense, 
  sum(CASE WHEN tt.code = 'SAVINGS' THEN -t.amount ELSE 0 END) AS savings, 
  sum(t.signed_amount) AS net 
FROM public.transactions t 
JOIN public.transaction_types tt ON tt.id = t.type_id 
GROUP BY 1, 2;
ALTER VIEW public.v_monthly_summary SET (security_invoker = on);
