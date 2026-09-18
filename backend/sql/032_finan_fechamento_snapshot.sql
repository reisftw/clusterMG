-- Roteiro Finan #36 (Fase 4C — Snapshots financeiros de fechamento):
-- fotografia congelada do resumo orçamentário no momento do fechamento
-- do mês — mudanças posteriores nos lançamentos não alteram
-- silenciosamente um relatório já fechado. Base técnica mais simples da
-- onda 4C; #37 (versionamento) e #39 (comprometimento) se apoiam nela.
alter table finan_fechamentos_mensais add column if not exists snapshot jsonb;
