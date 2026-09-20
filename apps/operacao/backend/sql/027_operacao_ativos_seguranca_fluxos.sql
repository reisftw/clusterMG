-- Operacao — Ativos & Seguranca: custodia, checklists executaveis,
-- ocorrencias, bloqueios e manutencoes. Additive-only.

create table if not exists rot_asset_transfers (
	id text primary key,
	asset_id text not null references rot_assets(id) on delete restrict,
	from_user_id text references rot_users(id) on delete set null,
	from_technician_id uuid references operacao_tecnicos(id) on delete set null,
	to_user_id text references rot_users(id) on delete set null,
	to_technician_id uuid references operacao_tecnicos(id) on delete set null,
	operation_scope text,
	regional_id text references regionais(id) on delete set null,
	reason text,
	condition text,
	checklist_execution_id text references rot_checklist_executions(id) on delete set null,
	evidence jsonb not null default '[]'::jsonb,
	notes text,
	requires_acceptance boolean not null default false,
	status text not null default 'COMPLETED',
	requested_by text references rot_users(id) on delete set null,
	accepted_by text references rot_users(id) on delete set null,
	accepted_at timestamptz,
	created_at timestamptz not null default now(),
	completed_at timestamptz,
	constraint rot_asset_transfers_status_chk check (status in ('PENDING_ACCEPTANCE','COMPLETED','CANCELED'))
);

create index if not exists idx_rot_asset_transfers_asset on rot_asset_transfers(asset_id, created_at desc);
create index if not exists idx_rot_asset_transfers_status on rot_asset_transfers(status, created_at desc);

create table if not exists rot_asset_returns (
	id text primary key,
	asset_id text not null references rot_assets(id) on delete restrict,
	from_user_id text references rot_users(id) on delete set null,
	from_technician_id uuid references operacao_tecnicos(id) on delete set null,
	destination_status_id text references rot_asset_statuses(id) on delete set null,
	condition text,
	problems text,
	checklist_execution_id text references rot_checklist_executions(id) on delete set null,
	evidence jsonb not null default '[]'::jsonb,
	notes text,
	status text not null default 'COMPLETED',
	returned_by text references rot_users(id) on delete set null,
	validated_by text references rot_users(id) on delete set null,
	validated_at timestamptz,
	created_at timestamptz not null default now(),
	completed_at timestamptz,
	constraint rot_asset_returns_status_chk check (status in ('PENDING_VALIDATION','COMPLETED','CANCELED'))
);

create index if not exists idx_rot_asset_returns_asset on rot_asset_returns(asset_id, created_at desc);

create table if not exists rot_asset_occurrences (
	id text primary key,
	asset_id text not null references rot_assets(id) on delete restrict,
	type text not null default 'Problema reportado',
	description text not null,
	criticality_id text references rot_asset_criticalities(id) on delete set null,
	status text not null default 'ABERTA',
	evidence jsonb not null default '[]'::jsonb,
	opened_by text references rot_users(id) on delete set null,
	assigned_to text references rot_users(id) on delete set null,
	closed_by text references rot_users(id) on delete set null,
	closed_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint rot_asset_occurrences_status_chk check (status in ('ABERTA','EM_TRATATIVA','RESOLVIDA','CANCELADA'))
);

create index if not exists idx_rot_asset_occurrences_asset on rot_asset_occurrences(asset_id, created_at desc);
create index if not exists idx_rot_asset_occurrences_status on rot_asset_occurrences(status, created_at desc);

drop trigger if exists rot_asset_occurrences_touch_updated_at on rot_asset_occurrences;
create trigger rot_asset_occurrences_touch_updated_at
before update on rot_asset_occurrences
for each row execute function touch_updated_at();

create table if not exists rot_asset_blocks (
	id text primary key,
	asset_id text not null references rot_assets(id) on delete restrict,
	occurrence_id text references rot_asset_occurrences(id) on delete set null,
	reason text not null,
	origin text not null default 'manual',
	evidence jsonb not null default '[]'::jsonb,
	blocked_by text references rot_users(id) on delete set null,
	blocked_at timestamptz not null default now(),
	released_by text references rot_users(id) on delete set null,
	released_at timestamptz,
	release_notes text,
	active boolean not null default true
);

create index if not exists idx_rot_asset_blocks_asset_active on rot_asset_blocks(asset_id, active);

create table if not exists rot_maintenance_orders (
	id text primary key,
	code text not null unique,
	asset_id text not null references rot_assets(id) on delete restrict,
	occurrence_id text references rot_asset_occurrences(id) on delete set null,
	criticality_id text references rot_asset_criticalities(id) on delete set null,
	responsible_id text references rot_users(id) on delete set null,
	description text not null,
	evidence jsonb not null default '[]'::jsonb,
	status text not null default 'REPORTADO',
	service_performed text,
	cost numeric(14,2),
	notes text,
	opened_by text references rot_users(id) on delete set null,
	closed_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	closed_at timestamptz,
	constraint rot_maintenance_orders_status_chk check (status in ('REPORTADO','TRIAGEM','AGUARDANDO_MANUTENCAO','EM_MANUTENCAO','AGUARDANDO_VALIDACAO','LIBERADO','CANCELADO'))
);

create index if not exists idx_rot_maintenance_orders_asset on rot_maintenance_orders(asset_id, created_at desc);
create index if not exists idx_rot_maintenance_orders_status on rot_maintenance_orders(status, created_at desc);

drop trigger if exists rot_maintenance_orders_touch_updated_at on rot_maintenance_orders;
create trigger rot_maintenance_orders_touch_updated_at
before update on rot_maintenance_orders
for each row execute function touch_updated_at();

create table if not exists rot_asset_custody_rules (
	id text primary key,
	name text not null,
	scope jsonb not null default '{}'::jsonb,
	rules jsonb not null default '{}'::jsonb,
	active boolean not null default true,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

drop trigger if exists rot_asset_custody_rules_touch_updated_at on rot_asset_custody_rules;
create trigger rot_asset_custody_rules_touch_updated_at
before update on rot_asset_custody_rules
for each row execute function touch_updated_at();

insert into rot_asset_custody_rules (id, name, scope, rules)
values
	('alto-valor-transferencia', 'Alto valor - transferencia com aceite', '{"highValue":true}'::jsonb, '{"requiresChecklist":true,"requiresPhoto":true,"requiresAcceptance":true}'::jsonb),
	('n-ok-bloqueia', 'N-OK bloqueia ativo', '{}'::jsonb, '{"whenAnswerStatus":"N-OK","blockAsset":true,"createOccurrence":true,"requirePhoto":true,"requireObservation":true}'::jsonb)
on conflict (id) do update set name = excluded.name, scope = excluded.scope, rules = excluded.rules, active = true;

insert into rot_checklist_templates (id, name, description, application, frequency, active)
values (
	'checklist-rapido-ativo',
	'Checklist rápido de ativo',
	'Checklist padrão inicial para inspeção rápida em campo.',
	'{"asset":true}'::jsonb,
	'{"type":"on_demand"}'::jsonb,
	true
)
on conflict (id) do update set name = excluded.name, description = excluded.description, application = excluded.application, frequency = excluded.frequency, active = true;

insert into rot_checklist_template_versions (id, template_id, version_number, snapshot)
values (
	'checklist-rapido-ativo-v1',
	'checklist-rapido-ativo',
	1,
	'{"name":"Checklist rápido de ativo","answers":["OK","N-OK","Não se aplica"]}'::jsonb
)
on conflict (id) do nothing;

update rot_checklist_templates
set active_version_id = 'checklist-rapido-ativo-v1'
where id = 'checklist-rapido-ativo' and active_version_id is null;

insert into rot_checklist_questions (id, version_id, sort_order, label, question_type, required, options, rules)
values
	('checklist-rapido-ativo-v1-presente', 'checklist-rapido-ativo-v1', 10, 'Ativo presente e identificado?', 'single_choice', true, '["OK","N-OK","Não se aplica"]'::jsonb, '[]'::jsonb),
	('checklist-rapido-ativo-funcionando', 'checklist-rapido-ativo-v1', 20, 'Funcionamento aparente está conforme?', 'single_choice', true, '["OK","N-OK","Não se aplica"]'::jsonb, '[{"when":"N-OK","requireObservation":true,"createOccurrence":true,"blockAsset":true}]'::jsonb),
	('checklist-rapido-ativo-avarias', 'checklist-rapido-ativo-v1', 30, 'Sem avarias, desgaste ou dano visível?', 'single_choice', true, '["OK","N-OK","Não se aplica"]'::jsonb, '[{"when":"N-OK","requirePhoto":true,"createOccurrence":true,"blockAsset":true}]'::jsonb),
	('checklist-rapido-ativo-acessorios', 'checklist-rapido-ativo-v1', 40, 'Acessórios necessários estão presentes?', 'single_choice', false, '["OK","N-OK","Não se aplica"]'::jsonb, '[]'::jsonb)
on conflict (id) do update set
	label = excluded.label,
	question_type = excluded.question_type,
	required = excluded.required,
	options = excluded.options,
	rules = excluded.rules;
