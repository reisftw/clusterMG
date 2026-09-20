-- DRE (Demonstrativo de Resultado do Exercicio) do Finan — backend e
-- frontend ja implementados desde o roteiro original (financeiroReportsRepository.js,
-- BudgetDreView.jsx), so faltava esta tabela, que nunca foi portada junto
-- (ver CLAUDE.md secao 11 e UX_AUDIT.md secao 4.8). Schema IDENTICO ao
-- ja usado em producao pelo app principal (vps/sql/044_dre_lancamentos.sql),
-- so muda o banco (Finan tem banco Postgres dedicado, separado do
-- Retiradas) — mesma estrutura ja validada, mesmas colunas que o codigo
-- do Finan (normalizeDreLancamento) ja espera.
create table if not exists dre_lancamentos (
	id text primary key,
	competencia_mes integer not null check (competencia_mes between 1 and 12),
	competencia_ano integer not null check (competencia_ano between 2000 and 2100),
	linha_dre text not null,
	categoria_original text,
	descricao text,
	valor numeric(14, 2) not null default 0,
	origem_arquivo text,
	is_fake boolean not null default false,
	criado_em timestamptz not null default now(),
	criado_por text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create index if not exists idx_dre_lancamentos_competencia
	on dre_lancamentos (competencia_ano, competencia_mes, is_fake);

create index if not exists idx_dre_lancamentos_linha
	on dre_lancamentos (linha_dre);

create index if not exists idx_dre_lancamentos_fake
	on dre_lancamentos (is_fake);

-- touch_updated_at() ja existe desde 006_finan_financeiro_real_compat.sql —
-- reaproveita em vez de duplicar.
drop trigger if exists dre_lancamentos_touch_updated_at on dre_lancamentos;
create trigger dre_lancamentos_touch_updated_at
before update on dre_lancamentos
for each row execute function touch_updated_at();
