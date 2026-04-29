-- Adiciona campos de alocação de rendimentos à tabela user_settings
alter table public.user_settings 
  add column if not exists emergency_fund_pct numeric default 0,
  add column if not exists investment_fund_pct numeric default 0,
  add column if not exists savings_fund_pct numeric default 0;

-- Garante que os valores estão entre 0 e 100
alter table public.user_settings
  add constraint chk_emergency_fund_pct check (emergency_fund_pct >= 0 and emergency_fund_pct <= 100),
  add constraint chk_investment_fund_pct check (investment_fund_pct >= 0 and investment_fund_pct <= 100),
  add constraint chk_savings_fund_pct check (savings_fund_pct >= 0 and savings_fund_pct <= 100);
