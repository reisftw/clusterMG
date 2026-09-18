-- Calendario Financeiro: configuracoes (tipos de evento, prioridades,
-- antecedencia de alerta, feriados e regras de recorrencia por dia util).
-- Tudo aditivo, com valores padrao inseridos via ON CONFLICT DO NOTHING
-- pra nao duplicar em re-execucao.

create table if not exists finan_calendar_event_types (
	id text primary key,
	label text not null,
	active boolean not null default true,
	created_at timestamptz not null default now()
);

create table if not exists finan_calendar_priorities (
	id text primary key,
	label text not null,
	-- Cor semantica fixa (secao 3.2 do documento de produto): vermelho =
	-- critico, amarelo = atencao, verde = entrada prevista, azul =
	-- informativo. Novas prioridades sempre mapeiam pra uma dessas 4 —
	-- da mais granularidade ("Urgente" vs "Critico", ambos vermelhos) sem
	-- quebrar a linguagem visual do calendario.
	color text not null check (color in ('vermelho', 'amarelo', 'verde', 'azul')),
	active boolean not null default true,
	created_at timestamptz not null default now()
);

create table if not exists finan_calendar_lead_times (
	id text primary key,
	days integer not null check (days > 0),
	label text not null,
	active boolean not null default true,
	created_at timestamptz not null default now()
);

create table if not exists finan_calendar_holidays (
	id text primary key,
	holiday_date date not null,
	name text not null,
	scope text not null default 'nacional' check (scope in ('nacional', 'municipal')),
	city text,
	source text not null default 'manual',
	created_at timestamptz not null default now()
);

-- Evita duplicar o mesmo feriado nacional ao re-sincronizar com a
-- BrasilAPI, e o mesmo feriado municipal pra mesma cidade. Precisa ser
-- indice (nao "unique(...)" inline), porque usa uma expressao (coalesce)
-- pra tratar cidade nula como string vazia.
create unique index if not exists finan_calendar_holidays_unique_idx
	on finan_calendar_holidays (holiday_date, scope, coalesce(city, ''));

create table if not exists finan_calendar_event_rules (
	id text primary key,
	title text not null,
	description text,
	event_type text not null,
	priority text not null,
	alert_days_before integer[] not null default '{}',
	-- Unica regra suportada por enquanto: "todo N-esimo dia util do mes".
	-- Dia util considera fins de semana + feriados NACIONAIS sempre, e
	-- feriados MUNICIPAIS de business_day_city quando informado (senao,
	-- so nacional).
	rule_type text not null default 'nth_business_day' check (rule_type = 'nth_business_day'),
	nth_business_day integer not null check (nth_business_day between 1 and 23),
	business_day_city text,
	active boolean not null default true,
	created_by text references finan_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

alter table finan_financial_events
	add column if not exists alert_days_before integer[] not null default '{}';

insert into finan_calendar_event_types (id, label) values
	('vencimento', 'Vencimento'),
	('recebimento', 'Recebimento'),
	('fechamento', 'Fechamento de caixa'),
	('conferencia', 'Conferência'),
	('rotina', 'Rotina interna'),
	('auditoria', 'Auditoria')
on conflict (id) do nothing;

insert into finan_calendar_priorities (id, label, color) values
	('critico', 'Crítico', 'vermelho'),
	('atencao', 'Atenção', 'amarelo'),
	('entrada', 'Entrada prevista', 'verde'),
	('informativo', 'Informativo', 'azul')
on conflict (id) do nothing;

insert into finan_calendar_lead_times (id, days, label) values
	('lead_2', 2, '2 dias antes'),
	('lead_7', 7, '7 dias antes'),
	('lead_15', 15, '15 dias antes')
on conflict (id) do nothing;
