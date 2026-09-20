-- Feature: aba "Ordens Fechadas" dentro de Movimentacoes — usuario sobe uma
-- planilha (nome + cidade do cliente, mesmo padrao do upload do Mapa) de
-- O.S. que foram fechadas num periodo, e o sistema confronta cada linha
-- contra TODAS as movimentacoes do Portal de Movimentacoes no periodo (nao
-- so "Retirada"/"Devolucao de comodato" — aqui e qualquer tipo_operacao),
-- pra ver se o cliente teve alguma movimentacao de entrega de equipamento
-- registrada. Gera cards de "entregues" x "nao entregues" pra analise.

create table if not exists movimentacoes_ordens_fechadas_jobs (
	id text primary key,
	status text not null default 'queued'
		check (status in ('queued', 'running', 'completed', 'failed')),
	stage text,
	percent integer not null default 0,
	total integer not null default 0,
	entregues integer not null default 0,
	nao_entregues integer not null default 0,
	periodo_inicio timestamptz,
	periodo_fim timestamptz,
	resultado jsonb,
	error text,
	created_at timestamptz not null default now(),
	started_at timestamptz,
	finished_at timestamptz,
	created_by text,
	created_by_name text
);

create index if not exists movimentacoes_ordens_fechadas_jobs_created_at_idx
	on movimentacoes_ordens_fechadas_jobs (created_at desc);
