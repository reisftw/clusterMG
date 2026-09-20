-- Operacao — Ativos & Seguranca / Inspecoes & Ativos Operacionais.
-- Fundacao normalizada para cadastro de ativos, codigos, QR, custodia
-- atual e configuracoes basicas. As fases seguintes usam estas tabelas
-- para transferencia, checklists versionados, ocorrencias e manutencao.

create table if not exists rot_asset_categories (
	id text primary key,
	name text not null,
	description text,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists ux_rot_asset_categories_lower_name on rot_asset_categories (lower(name));

drop trigger if exists rot_asset_categories_touch_updated_at on rot_asset_categories;
create trigger rot_asset_categories_touch_updated_at
before update on rot_asset_categories
for each row execute function touch_updated_at();

create table if not exists rot_asset_types (
	id text primary key,
	category_id text references rot_asset_categories(id) on delete set null,
	name text not null,
	description text,
	requires_checklist boolean not null default false,
	default_inspection_frequency text,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_asset_types_category on rot_asset_types(category_id);
create unique index if not exists ux_rot_asset_types_lower_name on rot_asset_types (lower(name));

drop trigger if exists rot_asset_types_touch_updated_at on rot_asset_types;
create trigger rot_asset_types_touch_updated_at
before update on rot_asset_types
for each row execute function touch_updated_at();

create table if not exists rot_asset_statuses (
	id text primary key,
	name text not null,
	color text not null default '#2563eb',
	blocks_use boolean not null default false,
	blocks_transfer boolean not null default false,
	sort_order integer not null default 0,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists ux_rot_asset_statuses_lower_name on rot_asset_statuses (lower(name));

drop trigger if exists rot_asset_statuses_touch_updated_at on rot_asset_statuses;
create trigger rot_asset_statuses_touch_updated_at
before update on rot_asset_statuses
for each row execute function touch_updated_at();

create table if not exists rot_asset_criticalities (
	id text primary key,
	name text not null,
	color text not null default '#64748b',
	weight integer not null default 0,
	actions jsonb not null default '{}'::jsonb,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists ux_rot_asset_criticalities_lower_name on rot_asset_criticalities (lower(name));

drop trigger if exists rot_asset_criticalities_touch_updated_at on rot_asset_criticalities;
create trigger rot_asset_criticalities_touch_updated_at
before update on rot_asset_criticalities
for each row execute function touch_updated_at();

create table if not exists rot_asset_code_patterns (
	id text primary key,
	name text not null,
	prefix text not null,
	padding integer not null default 6,
	next_number bigint not null default 1,
	operation_scope text,
	category_id text references rot_asset_categories(id) on delete set null,
	type_id text references rot_asset_types(id) on delete set null,
	company_id uuid references operacao_empresas(id) on delete set null,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_asset_code_patterns_scope on rot_asset_code_patterns(operation_scope, category_id, type_id, company_id);

drop trigger if exists rot_asset_code_patterns_touch_updated_at on rot_asset_code_patterns;
create trigger rot_asset_code_patterns_touch_updated_at
before update on rot_asset_code_patterns
for each row execute function touch_updated_at();

create table if not exists rot_assets (
	id text primary key,
	code text not null unique,
	public_token text not null unique,
	name text not null,
	category_id text references rot_asset_categories(id) on delete set null,
	type_id text references rot_asset_types(id) on delete set null,
	description text,
	manufacturer text,
	model text,
	serial_number text,
	patrimony text,
	asset_value numeric(14,2),
	acquired_at date,
	company_id uuid references operacao_empresas(id) on delete set null,
	operation_scope text not null default 'ROT',
	regional_id text references regionais(id) on delete set null,
	status_id text references rot_asset_statuses(id) on delete set null,
	criticality_id text references rot_asset_criticalities(id) on delete set null,
	high_value boolean not null default false,
	critical_equipment boolean not null default false,
	requires_checklist boolean not null default false,
	inspection_frequency text,
	structural_responsible_type text not null default 'REGIONAL',
	structural_responsible_id text,
	custody_user_id text references rot_users(id) on delete set null,
	custody_technician_id uuid references operacao_tecnicos(id) on delete set null,
	last_movement_at timestamptz,
	last_inspection_at timestamptz,
	next_inspection_at timestamptz,
	notes text,
	active boolean not null default true,
	deleted_at timestamptz,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint rot_assets_operation_scope_chk check (operation_scope in ('ROT','FIELD','DELIVERY')),
	constraint rot_assets_structural_responsible_chk check (structural_responsible_type in ('OPERATION','REGIONAL','USER','TECHNICIAN','COMPANY'))
);

create index if not exists idx_rot_assets_category on rot_assets(category_id);
create index if not exists idx_rot_assets_type on rot_assets(type_id);
create index if not exists idx_rot_assets_status on rot_assets(status_id);
create index if not exists idx_rot_assets_regional on rot_assets(regional_id);
create index if not exists idx_rot_assets_company on rot_assets(company_id);
create index if not exists idx_rot_assets_custody_user on rot_assets(custody_user_id);
create index if not exists idx_rot_assets_custody_technician on rot_assets(custody_technician_id);
create index if not exists idx_rot_assets_active on rot_assets(active) where deleted_at is null;

drop trigger if exists rot_assets_touch_updated_at on rot_assets;
create trigger rot_assets_touch_updated_at
before update on rot_assets
for each row execute function touch_updated_at();

create table if not exists rot_asset_timeline (
	id bigserial primary key,
	asset_id text not null references rot_assets(id) on delete cascade,
	event_type text not null,
	title text not null,
	description text,
	before_data jsonb,
	after_data jsonb,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_asset_timeline_asset on rot_asset_timeline(asset_id, created_at desc);

create table if not exists rot_asset_documents (
	id text primary key,
	asset_id text not null references rot_assets(id) on delete cascade,
	file_name text not null,
	mime_type text,
	storage_provider text,
	storage_key text,
	size_bytes integer,
	uploaded_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	removed_at timestamptz
);

create index if not exists idx_rot_asset_documents_asset on rot_asset_documents(asset_id) where removed_at is null;

create table if not exists rot_checklist_templates (
	id text primary key,
	name text not null,
	description text,
	application jsonb not null default '{}'::jsonb,
	frequency jsonb not null default '{}'::jsonb,
	active_version_id text,
	active boolean not null default true,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

drop trigger if exists rot_checklist_templates_touch_updated_at on rot_checklist_templates;
create trigger rot_checklist_templates_touch_updated_at
before update on rot_checklist_templates
for each row execute function touch_updated_at();

create table if not exists rot_checklist_template_versions (
	id text primary key,
	template_id text not null references rot_checklist_templates(id) on delete restrict,
	version_number integer not null,
	snapshot jsonb not null default '{}'::jsonb,
	published_at timestamptz not null default now(),
	published_by text references rot_users(id) on delete set null,
	unique (template_id, version_number)
);

alter table rot_checklist_templates
	add constraint rot_checklist_templates_active_version_fk
	foreign key (active_version_id) references rot_checklist_template_versions(id)
	deferrable initially deferred;

create table if not exists rot_checklist_questions (
	id text primary key,
	version_id text not null references rot_checklist_template_versions(id) on delete cascade,
	sort_order integer not null default 0,
	label text not null,
	question_type text not null,
	required boolean not null default false,
	options jsonb not null default '[]'::jsonb,
	rules jsonb not null default '[]'::jsonb
);

create index if not exists idx_rot_checklist_questions_version on rot_checklist_questions(version_id, sort_order);

create table if not exists rot_checklist_executions (
	id text primary key,
	template_id text references rot_checklist_templates(id) on delete set null,
	version_id text references rot_checklist_template_versions(id) on delete restrict,
	asset_id text references rot_assets(id) on delete set null,
	executed_by text references rot_users(id) on delete set null,
	status text not null default 'DRAFT',
	result text,
	started_at timestamptz not null default now(),
	completed_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_checklist_executions_asset on rot_checklist_executions(asset_id, created_at desc);

create table if not exists rot_checklist_answers (
	id text primary key,
	execution_id text not null references rot_checklist_executions(id) on delete cascade,
	question_id text references rot_checklist_questions(id) on delete set null,
	value jsonb,
	label text,
	status text,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_checklist_answers_execution on rot_checklist_answers(execution_id);

insert into rot_asset_categories (id, name, description)
values
	('equipamentos-operacionais', 'Equipamentos operacionais', 'Equipamentos caros/criticos em circulacao operacional.'),
	('escadas', 'Escadas', 'Escadas e recursos de acesso em campo.'),
	('ferramentas', 'Ferramentas', 'Ferramentas e kits de apoio operacional.')
on conflict (id) do update set name = excluded.name, description = excluded.description, active = true;

insert into rot_asset_types (id, category_id, name, description, requires_checklist, default_inspection_frequency)
values
	('equipamento-rot', 'equipamentos-operacionais', 'Equipamento ROT', 'Equipamento de alto valor sob responsabilidade operacional do ROT/regional.', true, 'daily'),
	('escada-extensiva', 'escadas', 'Escada extensiva', 'Escada usada em atividades externas.', true, 'weekly'),
	('ferramenta-campo', 'ferramentas', 'Ferramenta de campo', 'Ferramenta ou kit de uso operacional.', false, 'on_demand')
on conflict (id) do update set
	category_id = excluded.category_id,
	name = excluded.name,
	description = excluded.description,
	requires_checklist = excluded.requires_checklist,
	default_inspection_frequency = excluded.default_inspection_frequency,
	active = true;

insert into rot_asset_statuses (id, name, color, blocks_use, blocks_transfer, sort_order)
values
	('disponivel', 'Disponivel', '#10b981', false, false, 10),
	('em_uso', 'Em uso', '#2563eb', false, false, 20),
	('aguardando_validacao', 'Aguardando validacao', '#f59e0b', true, true, 30),
	('com_ocorrencia', 'Com ocorrencia', '#f97316', true, true, 40),
	('manutencao', 'Em manutencao', '#7c3aed', true, true, 50),
	('bloqueado', 'Bloqueado para uso', '#dc2626', true, true, 60)
on conflict (id) do update set
	name = excluded.name,
	color = excluded.color,
	blocks_use = excluded.blocks_use,
	blocks_transfer = excluded.blocks_transfer,
	sort_order = excluded.sort_order,
	active = true;

insert into rot_asset_criticalities (id, name, color, weight, actions)
values
	('informativo', 'Informativo', '#64748b', 10, '{}'::jsonb),
	('atencao', 'Atencao', '#f59e0b', 20, '{}'::jsonb),
	('moderado', 'Moderado', '#f97316', 30, '{}'::jsonb),
	('alto', 'Alto', '#ef4444', 40, '{"notify":true}'::jsonb),
	('critico', 'Critico', '#dc2626', 50, '{"notify":true,"block":true}'::jsonb),
	('impeditivo', 'Impeditivo', '#7f1d1d', 60, '{"notify":true,"block":true,"requiresRelease":true}'::jsonb)
on conflict (id) do update set
	name = excluded.name,
	color = excluded.color,
	weight = excluded.weight,
	actions = excluded.actions,
	active = true;

insert into rot_asset_code_patterns (id, name, prefix, padding, next_number, operation_scope)
values
	('default-rot', 'Padrao ROT', 'ROT-EQP', 6, 1, 'ROT'),
	('default-field', 'Padrao FIELD', 'FIELD-ATV', 6, 1, 'FIELD'),
	('default-delivery', 'Padrao DELIVERY', 'DEL-ATV', 6, 1, 'DELIVERY')
on conflict (id) do update set
	name = excluded.name,
	prefix = excluded.prefix,
	padding = excluded.padding,
	operation_scope = excluded.operation_scope,
	active = true;

insert into rot_permissions (id, section_id, section_label, feature_id, feature_label, action, sort_order, description)
values
	('ativos.visualizar', 'ativos_seguranca', 'Ativos & Seguranca', 'ativos', 'Ativos', 'view', 800, 'Visualizar ativos operacionais.'),
	('ativos.criar', 'ativos_seguranca', 'Ativos & Seguranca', 'ativos', 'Ativos', 'manage', 801, 'Criar ativos operacionais.'),
	('ativos.editar', 'ativos_seguranca', 'Ativos & Seguranca', 'ativos', 'Ativos', 'manage', 802, 'Editar ativos operacionais.'),
	('ativos.transferir', 'ativos_seguranca', 'Ativos & Seguranca', 'custodia', 'Custodia', 'manage', 810, 'Transferir ativos entre responsaveis.'),
	('ativos.devolver', 'ativos_seguranca', 'Ativos & Seguranca', 'custodia', 'Custodia', 'manage', 811, 'Registrar devolucao de ativos.'),
	('ativos.bloquear', 'ativos_seguranca', 'Ativos & Seguranca', 'bloqueios', 'Bloqueios', 'manage', 820, 'Bloquear ativos.'),
	('ativos.liberar', 'ativos_seguranca', 'Ativos & Seguranca', 'bloqueios', 'Bloqueios', 'manage', 821, 'Liberar ativos bloqueados.'),
	('ativos.excluir', 'ativos_seguranca', 'Ativos & Seguranca', 'ativos', 'Ativos', 'manage', 830, 'Inativar ativos.'),
	('ativos.historico.visualizar', 'ativos_seguranca', 'Ativos & Seguranca', 'historico', 'Historico', 'view', 840, 'Visualizar timeline de ativos.'),
	('ativos.valor.visualizar', 'ativos_seguranca', 'Ativos & Seguranca', 'valores', 'Valores', 'view', 850, 'Visualizar valor de ativos.'),
	('ativos.qrcode.gerar', 'ativos_seguranca', 'Ativos & Seguranca', 'qrcode', 'QR Code', 'manage', 860, 'Gerar e visualizar QR Code de ativos.'),
	('checklists.visualizar', 'ativos_seguranca', 'Ativos & Seguranca', 'checklists', 'Checklists', 'view', 870, 'Visualizar checklists de ativos.'),
	('checklists.executar', 'ativos_seguranca', 'Ativos & Seguranca', 'checklists', 'Checklists', 'manage', 871, 'Executar checklists.'),
	('checklists.configurar', 'ativos_seguranca', 'Ativos & Seguranca', 'checklists', 'Checklists', 'manage', 872, 'Configurar checklists.'),
	('ocorrencias.visualizar', 'ativos_seguranca', 'Ativos & Seguranca', 'ocorrencias', 'Ocorrencias', 'view', 880, 'Visualizar ocorrencias.'),
	('ocorrencias.criar', 'ativos_seguranca', 'Ativos & Seguranca', 'ocorrencias', 'Ocorrencias', 'manage', 881, 'Criar ocorrencias.'),
	('ocorrencias.tratar', 'ativos_seguranca', 'Ativos & Seguranca', 'ocorrencias', 'Ocorrencias', 'manage', 882, 'Tratar ocorrencias.'),
	('manutencoes.visualizar', 'ativos_seguranca', 'Ativos & Seguranca', 'manutencoes', 'Manutencoes', 'view', 890, 'Visualizar manutencoes.'),
	('manutencoes.criar', 'ativos_seguranca', 'Ativos & Seguranca', 'manutencoes', 'Manutencoes', 'manage', 891, 'Criar manutencoes.'),
	('manutencoes.tratar', 'ativos_seguranca', 'Ativos & Seguranca', 'manutencoes', 'Manutencoes', 'manage', 892, 'Tratar manutencoes.')
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true;

insert into rot_role_permissions (role_id, permission_id)
select r.id, p.id
from rot_roles r
join rot_permissions p on p.id in (
	'ativos.visualizar',
	'ativos.historico.visualizar',
	'ativos.qrcode.gerar',
	'checklists.visualizar',
	'checklists.executar',
	'ocorrencias.visualizar',
	'ocorrencias.criar',
	'manutencoes.visualizar'
)
where r.id in ('manager','coordinator','regional_supervisor','tech_lead','tech_3','tech_2','tech_1')
on conflict do nothing;

insert into rot_role_permissions (role_id, permission_id)
select r.id, p.id
from rot_roles r
join rot_permissions p on p.section_id = 'ativos_seguranca'
where r.id in ('manager','coordinator','regional_supervisor')
on conflict do nothing;
