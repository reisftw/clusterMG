-- Regras configuraveis para pendencias/alertas operacionais.
-- Nao duplica tickets: as pendencias iniciais sao calculadas em tempo
-- real a partir das entidades existentes.

create table if not exists operational_pending_rules (
	id text primary key,
	domain text,
	source text not null,
	rule_type text not null,
	title text not null,
	description text not null default '',
	severity text not null default 'medium',
	priority text not null default 'media',
	config jsonb not null default '{}'::jsonb,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	constraint operational_pending_rules_domain_chk check (domain is null or domain in ('ROT', 'FIELD', 'DELIVERY')),
	constraint operational_pending_rules_severity_chk check (severity in ('critical', 'high', 'medium', 'low')),
	constraint operational_pending_rules_priority_chk check (priority in ('critica', 'alta', 'media', 'baixa'))
);

drop trigger if exists operational_pending_rules_touch_updated_at on operational_pending_rules;
create trigger operational_pending_rules_touch_updated_at
before update on operational_pending_rules
for each row execute function touch_updated_at();

insert into operational_pending_rules (
	id, domain, source, rule_type, title, description, severity, priority, config
)
values
	(
		'rot.ticket.open_older_than_days',
		'ROT',
		'rot_tickets',
		'open_older_than_days',
		'Ticket ROT aberto há muitos dias',
		'Gera pendencia para tickets ROT abertos ha mais tempo que o limite configurado.',
		'high',
		'alta',
		'{"days": 1}'::jsonb
	)
on conflict (id) do update set
	domain = excluded.domain,
	source = excluded.source,
	rule_type = excluded.rule_type,
	title = excluded.title,
	description = excluded.description,
	severity = excluded.severity,
	priority = excluded.priority,
	config = operational_pending_rules.config,
	active = true,
	updated_at = now();

with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('pending.assign', 'inteligencia_operacional', 'Inteligencia Operacional', 'pendencias', 'Pendencias operacionais', 'manage', 842, 'Atribuir pendencias operacionais.'),
		('pending.resolve', 'inteligencia_operacional', 'Inteligencia Operacional', 'pendencias', 'Pendencias operacionais', 'manage', 843, 'Concluir pendencias operacionais.'),
		('capacity.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'capacidade', 'Capacidade operacional', 'view', 880, 'Visualizar capacidade operacional.'),
		('closing.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'fechamentos', 'Fechamentos operacionais', 'view', 890, 'Visualizar fechamentos operacionais.'),
		('closing.execute', 'inteligencia_operacional', 'Inteligencia Operacional', 'fechamentos', 'Fechamentos operacionais', 'manage', 891, 'Executar fechamentos operacionais.'),
		('handover.view', 'inteligencia_operacional', 'Inteligencia Operacional', 'passagem', 'Passagem operacional', 'view', 900, 'Visualizar passagem operacional.'),
		('handover.create', 'inteligencia_operacional', 'Inteligencia Operacional', 'passagem', 'Passagem operacional', 'manage', 901, 'Criar passagem operacional.'),
		('handover.accept', 'inteligencia_operacional', 'Inteligencia Operacional', 'passagem', 'Passagem operacional', 'approve', 902, 'Aceitar passagem operacional.')
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
where id in (
	'pending.assign',
	'pending.resolve',
	'capacity.view',
	'closing.view',
	'closing.execute',
	'handover.view',
	'handover.create',
	'handover.accept'
)
on conflict do nothing;
