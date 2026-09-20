-- Regras iniciais para Cockpit, Torre de Controle e Saude Operacional.
-- Tudo configuravel e additive-only.

create table if not exists operational_alert_rules (
	id text primary key,
	domain text,
	source text not null,
	rule_type text not null,
	title text not null,
	description text not null default '',
	severity text not null default 'medium',
	config jsonb not null default '{}'::jsonb,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	constraint operational_alert_rules_domain_chk check (domain is null or domain in ('ROT', 'FIELD', 'DELIVERY')),
	constraint operational_alert_rules_severity_chk check (severity in ('critical', 'high', 'medium', 'low'))
);

drop trigger if exists operational_alert_rules_touch_updated_at on operational_alert_rules;
create trigger operational_alert_rules_touch_updated_at
before update on operational_alert_rules
for each row execute function touch_updated_at();

create table if not exists operational_health_weights (
	id text primary key,
	domain text not null,
	component text not null,
	label text not null,
	weight numeric(8,4) not null default 0,
	config jsonb not null default '{}'::jsonb,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	unique(domain, component),
	constraint operational_health_weights_domain_chk check (domain in ('ROT', 'FIELD', 'DELIVERY'))
);

drop trigger if exists operational_health_weights_touch_updated_at on operational_health_weights;
create trigger operational_health_weights_touch_updated_at
before update on operational_health_weights
for each row execute function touch_updated_at();

insert into operational_alert_rules (id, domain, source, rule_type, title, description, severity, config)
values
	('rot.open_ticket_aging', 'ROT', 'rot_tickets', 'open_ticket_aging', 'Tickets ROT antigos', 'Alerta quando houver tickets ROT abertos acima do limite de dias.', 'high', '{"days":1}'::jsonb),
	('rot.backlog_volume', 'ROT', 'rot_tickets', 'backlog_volume', 'Backlog ROT elevado', 'Alerta quando a quantidade de tickets ROT abertos passar do limite.', 'medium', '{"openTickets":20}'::jsonb),
	('assets.blocked_any', null, 'rot_assets', 'blocked_assets', 'Ativos bloqueados', 'Alerta quando houver ativo bloqueado para uso.', 'high', '{"minimum":1}'::jsonb),
	('assets.open_occurrences', null, 'rot_asset_occurrences', 'open_occurrences', 'Ocorrências abertas', 'Alerta quando houver ocorrências abertas em ativos.', 'medium', '{"minimum":1}'::jsonb),
	('assets.open_maintenance', null, 'rot_maintenance_orders', 'open_maintenance', 'Manutenções abertas', 'Alerta quando houver ordens de manutenção não liberadas.', 'medium', '{"minimum":1}'::jsonb)
on conflict (id) do update set
	domain = excluded.domain,
	source = excluded.source,
	rule_type = excluded.rule_type,
	title = excluded.title,
	description = excluded.description,
	severity = excluded.severity,
	config = operational_alert_rules.config,
	active = true,
	updated_at = now();

insert into operational_health_weights (id, domain, component, label, weight, config)
values
	('rot-health-tickets', 'ROT', 'tickets', 'Tickets', 40, '{"openLimit":20,"agingLimitDays":1}'::jsonb),
	('rot-health-pending', 'ROT', 'pending', 'Pendências', 20, '{"pendingLimit":10}'::jsonb),
	('rot-health-assets', 'ROT', 'assets', 'Ativos & Segurança', 20, '{"blockedLimit":5,"occurrenceLimit":10}'::jsonb),
	('rot-health-maintenance', 'ROT', 'maintenance', 'Manutenções', 20, '{"maintenanceLimit":10}'::jsonb),
	('field-health-internal', 'FIELD', 'internal_process', 'Processos internos', 100, '{"hubsoftIgnoredUntilIntegrated":true}'::jsonb),
	('delivery-health-internal', 'DELIVERY', 'internal_process', 'Processos internos', 100, '{"hubsoftIgnoredUntilIntegrated":true}'::jsonb)
on conflict (domain, component) do update set
	label = excluded.label,
	weight = operational_health_weights.weight,
	config = operational_health_weights.config,
	active = true,
	updated_at = now();

insert into rot_role_permissions (role_id, permission_id)
select 'site_admin', id
from rot_permissions
where id in ('supervisor_cockpit.view', 'control_tower.view', 'health.view', 'health.configure', 'control_tower.configure')
on conflict do nothing;
