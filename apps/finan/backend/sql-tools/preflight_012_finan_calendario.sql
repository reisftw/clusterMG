-- Pre-flight para a migration 012_finan_calendario.sql
--
-- SOMENTE LEITURA. A migration e puramente aditiva (tabela nova), risco
-- baixo — mesmo assim, rode contra producao/homolog antes do push, mesma
-- disciplina das migrations anteriores do Finan.
--
-- Uso sugerido:
--   psql "$FINAN_DATABASE_URL" -f apps/finan/backend/sql-tools/preflight_012_finan_calendario.sql

\echo '=== 1. Tabela finan_financial_events ja existe? (esperado: 0 linhas) ==='
select table_name
from information_schema.tables
where table_name = 'finan_financial_events';
