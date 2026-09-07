-- Calendario Financeiro Inteligente (Fase 1 do roadmap de evolucao do
-- Finan) — versao inicial: so eventos avulsos (sem recorrencia ainda) e
-- sem regras de alerta/notificacao (isso fica pra uma proxima etapa, com a
-- base de eventos ja existindo). Tabela nova, sem FK/CHECK contra dados
-- ja existentes — aditiva e de baixo risco, mas seguindo a mesma
-- disciplina das migrations anteriores do Finan.

create table if not exists finan_financial_events (
	id text primary key,
	title text not null,
	description text,
	event_date date not null,
	-- Categoria do evento (vencimento, recebimento, fechamento,
	-- conferencia, rotina, auditoria) — texto livre validado no backend,
	-- nao enum de banco, pra nao precisar de migration toda vez que uma
	-- categoria nova for adicionada.
	event_type text not null default 'rotina',
	-- Mapeia direto pras 4 cores da secao 3.2 do documento de produto:
	-- critico=vermelho, atencao=amarelo, entrada=verde, informativo=azul.
	priority text not null default 'informativo',
	created_by text references finan_users(id) on delete set null,
	responsible_user_id text references finan_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists finan_financial_events_event_date_idx
	on finan_financial_events (event_date);
