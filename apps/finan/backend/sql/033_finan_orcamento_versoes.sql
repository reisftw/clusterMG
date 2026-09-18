-- Roteiro Finan #37 (Fase 4C — Versionamento de orçamento, usa #36):
-- registro de versões (Original -> Revisão 1 -> Forecast Q3 -> Revisão
-- Diretoria), sem nunca sobrescrever a versão anterior. O modelo de
-- dado pra multiplas versoes JA EXISTIA (finan_orcamento_matriz.versao_id,
-- com unique(ano,mes,conta_id,centro_custo_id,versao_id) — ver
-- 002_finan_financial_tables.sql) — so nunca foi usado alem do valor
-- padrao "budget". Esta tabela e so o CATALOGO/METADADO de cada versao
-- (nome, de quem, baseada em qual); a matriz em si ja tinha onde
-- guardar os valores de cada versao separadamente.
create table if not exists finan_orcamento_versoes (
	id text primary key,
	ano integer not null,
	mes integer not null,
	nome text not null,
	versao_base_id text, -- de qual versao os valores foram copiados (null = criada do zero)
	is_padrao boolean not null default false, -- versao mostrada por padrao quando nenhuma e escolhida
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now(),
	unique (ano, mes, nome)
);

create index if not exists finan_orcamento_versoes_periodo_idx
	on finan_orcamento_versoes (ano, mes);

-- A versao "budget" (a unica que ja existia, implicita, usada por toda
-- importacao ate hoje) nao tem uma linha aqui ainda — GET /versoes
-- sempre inclui ela sintetizada na resposta (ver routes.js), pra nao
-- precisar de uma migration de dados retroativa cobrindo todo historico
-- ja importado.
