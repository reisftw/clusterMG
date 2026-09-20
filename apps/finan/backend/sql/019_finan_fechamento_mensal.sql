-- Roteiro Finan #12 (Fechamento Mensal): status de fechamento por
-- ano/mes do orçamento, com trilha de quem fechou/reabriu e o motivo da
-- reabertura (reabertura sempre exige justificativa registrada). Tabela
-- nova, aditiva, sem FK pra nao acoplar em finan_orcamento_lancamentos
-- (o periodo é so ano/mes, nao um id de linha).
create table if not exists finan_fechamentos_mensais (
	ano integer not null,
	mes integer not null,
	status text not null default 'aberto',
	fechado_por_id text,
	fechado_por_nome text,
	fechado_em timestamptz,
	reaberto_por_id text,
	reaberto_por_nome text,
	reaberto_em timestamptz,
	motivo_reabertura text,
	updated_at timestamptz not null default now(),
	primary key (ano, mes)
);
