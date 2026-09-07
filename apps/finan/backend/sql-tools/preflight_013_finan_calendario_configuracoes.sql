-- Pre-flight para 013_finan_calendario_configuracoes.sql
-- SOMENTE LEITURA. Aditiva (tabelas novas + coluna nova em
-- finan_financial_events), risco baixo — rode contra producao/homolog
-- antes do push mesmo assim.

\echo '=== 1. Alguma das tabelas novas ja existe? (esperado: 0 linhas) ==='
select table_name
from information_schema.tables
where table_name in (
	'finan_calendar_event_types', 'finan_calendar_priorities',
	'finan_calendar_lead_times', 'finan_calendar_holidays',
	'finan_calendar_event_rules'
);

\echo '=== 2. Coluna alert_days_before ja existe em finan_financial_events? (esperado: 0 linhas) ==='
select column_name
from information_schema.columns
where table_name = 'finan_financial_events' and column_name = 'alert_days_before';

\echo '=== 3. Quantos eventos ja existem hoje (contexto de volume) ==='
select count(*) from finan_financial_events;
