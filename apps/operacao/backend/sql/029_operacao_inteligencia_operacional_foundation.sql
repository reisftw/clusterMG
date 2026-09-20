-- Plataforma de Inteligencia e Comando Operacional.
-- Fundacao additive-only: catalogo de indicadores, permissoes e status
-- de fontes. Nao duplica usuarios, tecnicos, empresas, regionais nem tickets.

create table if not exists operational_indicator_definitions (
	code text primary key,
	name text not null,
	description text not null default '',
	domain text,
	unit text not null default 'count',
	source text not null,
	provider text not null,
	formula text not null default '',
	availability text not null default 'AVAILABLE',
	desired_direction text not null default 'neutral',
	periodicity text not null default 'daily',
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint operational_indicator_domain_chk check (domain is null or domain in ('ROT', 'FIELD', 'DELIVERY')),
	constraint operational_indicator_availability_chk check (availability in ('AVAILABLE', 'PARTIAL', 'WAITING_INTEGRATION', 'UNAVAILABLE')),
	constraint operational_indicator_direction_chk check (desired_direction in ('up', 'down', 'neutral'))
);

drop trigger if exists operational_indicator_definitions_touch_updated_at on operational_indicator_definitions;
create trigger operational_indicator_definitions_touch_updated_at
before update on operational_indicator_definitions
for each row execute function touch_updated_at();

create table if not exists operational_event_log (
	id text primary key,
	event_type text not null,
	domain text,
	source text not null,
	title text not null,
	description text,
	entity_type text,
	entity_id text,
	company_id text,
	regional_id text references rot_regionals(id) on delete set null,
	technician_id text,
	user_id text references rot_users(id) on delete set null,
	occurred_at timestamptz not null default now(),
	payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	constraint operational_event_domain_chk check (domain is null or domain in ('ROT', 'FIELD', 'DELIVERY'))
);

create index if not exists idx_operational_event_log_domain_date
	on operational_event_log(domain, occurred_at desc);

create index if not exists idx_operational_event_log_regional_date
	on operational_event_log(regional_id, occurred_at desc);

create index if not exists idx_rot_tickets_status_date
	on rot_tickets(status, date desc);

create index if not exists idx_rot_tickets_team_ids_gin
	on rot_tickets using gin(team_ids);

with catalog(code, name, description, domain, unit, source, provider, formula, availability, desired_direction, periodicity) as (
	values
		('rot.tickets.total', 'Tickets ROT recebidos', 'Quantidade de tickets internos ROT registrados no periodo.', 'ROT', 'count', 'rot_tickets', 'TicketProvider', 'count(rot_tickets)', 'AVAILABLE', 'neutral', 'daily'),
		('rot.tickets.open', 'Tickets ROT abertos', 'Quantidade de tickets internos ROT ainda em aberto.', 'ROT', 'count', 'rot_tickets', 'TicketProvider', 'count(rot_tickets where status = aberto)', 'AVAILABLE', 'down', 'realtime'),
		('rot.tickets.completed', 'Tickets ROT concluidos', 'Quantidade de tickets internos ROT concluidos no periodo.', 'ROT', 'count', 'rot_tickets', 'TicketProvider', 'count(rot_tickets where status = concluido)', 'AVAILABLE', 'up', 'daily'),
		('rot.tickets.by_technician', 'Tickets por tecnico ROT', 'Distribuicao de tickets ROT por integrante informado na equipe.', 'ROT', 'count', 'rot_tickets.team_ids + rot_users', 'TicketProvider', 'unnest(team_ids) grouped by user', 'AVAILABLE', 'neutral', 'daily'),
		('rot.tickets.by_regional', 'Tickets por regional ROT', 'Distribuicao de tickets ROT por regional cadastrada.', 'ROT', 'count', 'rot_tickets + rot_regionals', 'TicketProvider', 'group by regional_id', 'AVAILABLE', 'neutral', 'daily'),
		('field.os.completed', 'O.S FIELD concluidas', 'Produtividade FIELD por ordens de servico Hubsoft. Aguardando integracao.', 'FIELD', 'count', 'Hubsoft', 'HubsoftOrderProvider', 'Hubsoft O.S concluidas por periodo', 'WAITING_INTEGRATION', 'up', 'daily'),
		('field.os.open', 'O.S FIELD abertas', 'Backlog FIELD por ordens de servico Hubsoft. Aguardando integracao.', 'FIELD', 'count', 'Hubsoft', 'HubsoftOrderProvider', 'Hubsoft O.S abertas', 'WAITING_INTEGRATION', 'down', 'realtime'),
		('delivery.os.completed', 'O.S DELIVERY concluidas', 'Produtividade DELIVERY por ordens de servico Hubsoft. Aguardando integracao.', 'DELIVERY', 'count', 'Hubsoft', 'HubsoftOrderProvider', 'Hubsoft O.S concluidas por periodo', 'WAITING_INTEGRATION', 'up', 'daily'),
		('delivery.os.open', 'O.S DELIVERY abertas', 'Backlog DELIVERY por ordens de servico Hubsoft. Aguardando integracao.', 'DELIVERY', 'count', 'Hubsoft', 'HubsoftOrderProvider', 'Hubsoft O.S abertas', 'WAITING_INTEGRATION', 'down', 'realtime'),
		('assets.blocked', 'Ativos bloqueados', 'Quantidade de ativos bloqueados em Ativos e Seguranca.', null, 'count', 'rot_assets', 'AssetsSecurityProvider', 'count(rot_assets where status = bloqueado)', 'AVAILABLE', 'down', 'realtime'),
		('checklists.pending', 'Checklists pendentes', 'Quantidade de checklists de ativos pendentes.', null, 'count', 'rot_asset_checklist_runs', 'AssetsSecurityProvider', 'count(checklists where status = pendente)', 'AVAILABLE', 'down', 'realtime')
)
insert into operational_indicator_definitions (
	code, name, description, domain, unit, source, provider, formula, availability, desired_direction, periodicity
)
select code, name, description, domain, unit, source, provider, formula, availability, desired_direction, periodicity
from catalog
on conflict (code) do update set
	name = excluded.name,
	description = excluded.description,
	domain = excluded.domain,
	unit = excluded.unit,
	source = excluded.source,
	provider = excluded.provider,
	formula = excluded.formula,
	availability = excluded.availability,
	desired_direction = excluded.desired_direction,
	periodicity = excluded.periodicity,
	active = true,
	updated_at = now();

with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('operational_metrics.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'metricas_operacionais', 'Metricas operacionais', 'view', 800, 'Visualizar metricas reais e disponibilidade das fontes operacionais.'),
		('operational_metrics.configure', 'inteligencia_operacional', 'Inteligencia Operacional', 'metricas_operacionais', 'Metricas operacionais', 'manage', 801, 'Configurar catalogo de metricas operacionais.'),
		('operational_events.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'eventos_operacionais', 'Eventos operacionais', 'view', 810, 'Visualizar eventos operacionais consolidados.'),
		('command_center.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'centro_comando', 'Centro de Comando', 'view', 820, 'Visualizar centro de comando operacional.'),
		('supervisor_cockpit.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'cockpit_supervisor', 'Cockpit do supervisor', 'view', 830, 'Visualizar cockpit do supervisor.'),
		('pending.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'pendencias', 'Pendencias operacionais', 'view', 840, 'Visualizar pendencias operacionais.'),
		('pending.manage', 'inteligencia_operacional', 'Inteligencia Operacional', 'pendencias', 'Pendencias operacionais', 'manage', 841, 'Gerenciar pendencias operacionais.'),
		('control_tower.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'torre_controle', 'Torre de controle', 'view', 850, 'Visualizar torre de controle.'),
		('control_tower.configure', 'inteligencia_operacional', 'Inteligencia Operacional', 'torre_controle', 'Torre de controle', 'manage', 851, 'Configurar torre de controle.'),
		('journey.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'jornada_tecnico', 'Jornada do tecnico', 'view', 860, 'Visualizar propria jornada operacional.'),
		('journey.team_view', 'inteligencia_operacional', 'Inteligencia Operacional', 'jornada_tecnico', 'Jornada do tecnico', 'view', 861, 'Visualizar jornada da equipe.'),
		('health.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'saude_operacional', 'Saude operacional', 'view', 870, 'Visualizar saude operacional.'),
		('health.configure', 'inteligencia_operacional', 'Inteligencia Operacional', 'saude_operacional', 'Saude operacional', 'manage', 871, 'Configurar saude operacional.')
)
insert into rot_permissions (
	id, section_id, section_label, feature_id, feature_label, action, sort_order, description
)
select id, section_id, section_label, feature_id, feature_label, action, sort_order, description
from permissions
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true,
	updated_at = now();

insert into rot_role_permissions (role_id, permission_id)
select 'site_admin', id
from rot_permissions
where section_id = 'inteligencia_operacional'
on conflict do nothing;
