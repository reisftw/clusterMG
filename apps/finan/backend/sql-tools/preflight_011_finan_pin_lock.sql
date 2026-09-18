-- Pre-flight para a migration 011_finan_pin_lock.sql
--
-- SOMENTE LEITURA. Nenhum UPDATE/DELETE/INSERT/ALTER/DROP/TRUNCATE.
-- A migration 011 e puramente aditiva (colunas nullable/com default em
-- finan_users e finan_roles, tabela nova finan_pin_recovery), entao o
-- risco de quebra e baixo — mas mesmo assim, rode isto manualmente contra
-- o Postgres de PRODUCAO (ou pelo menos homolog) antes de aplicar a
-- migration, seguindo a mesma disciplina da 010.
--
-- Uso sugerido:
--   psql "$FINAN_DATABASE_URL" -f apps/finan/backend/sql-tools/preflight_011_finan_pin_lock.sql

\echo '=== 1. Colunas novas ja existem em finan_users? (esperado: 0 linhas) ==='
select column_name
from information_schema.columns
where table_name = 'finan_users'
  and column_name in (
	'pin_hash', 'pin_secret_word_hash', 'pin_failed_attempts',
	'pin_locked_at', 'pin_configured_at'
  );

\echo '=== 2. Coluna hierarchy_level ja existe em finan_roles? (esperado: 0 linhas) ==='
select column_name
from information_schema.columns
where table_name = 'finan_roles'
  and column_name = 'hierarchy_level';

\echo '=== 3. Tabela finan_pin_recovery ja existe? (esperado: 0 linhas) ==='
select table_name
from information_schema.tables
where table_name = 'finan_pin_recovery';

\echo '=== 4. Quantos usuarios/cargos existem hoje (contexto de volume) ==='
select
	(select count(*) from finan_users) as total_usuarios,
	(select count(*) from finan_roles) as total_cargos;

\echo '=== 5. Cargos existentes (para revisar hierarchy_level default=999 apos a migration) ==='
select id, name, is_admin, system_role, active
from finan_roles
order by is_admin desc, name;
