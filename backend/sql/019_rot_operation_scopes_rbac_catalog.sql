-- Foundation additive-only para OPERAÇÃO como escopo operacional.
-- Não remove nem renomeia estruturas antigas (`rot_*`) e mantém
-- `rot_roles.permissions` como compatibilidade durante a transição.

create table if not exists rot_operation_types (
	id text primary key,
	label text not null,
	description text,
	active boolean not null default true,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint rot_operation_types_id_chk check (id in ('ROT', 'FIELD', 'DELIVERY'))
);

drop trigger if exists rot_operation_types_touch_updated_at on rot_operation_types;
create trigger rot_operation_types_touch_updated_at
before update on rot_operation_types
for each row execute function touch_updated_at();

insert into rot_operation_types (id, label, description, sort_order)
values
	('ROT', 'ROT', 'Frente operacional historica de ROT dentro de Operacao.', 10),
	('FIELD', 'FIELD', 'Frente operacional de campo/field service.', 20),
	('DELIVERY', 'DELIVERY', 'Frente operacional de entrega.', 30)
on conflict (id) do update set
	label = excluded.label,
	description = excluded.description,
	active = true,
	sort_order = excluded.sort_order,
	updated_at = now();

create table if not exists rot_user_operation_scopes (
	user_id text not null references rot_users(id) on delete cascade,
	operation_type text not null references rot_operation_types(id) on delete restrict,
	is_primary boolean not null default false,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (user_id, operation_type)
);

create index if not exists idx_rot_user_operation_scopes_operation
	on rot_user_operation_scopes(operation_type, user_id);

create unique index if not exists idx_rot_user_operation_scopes_primary
	on rot_user_operation_scopes(user_id)
	where is_primary = true;

create table if not exists rot_regional_operation_scopes (
	regional_id text not null references rot_regionals(id) on delete cascade,
	operation_type text not null references rot_operation_types(id) on delete restrict,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (regional_id, operation_type)
);

create index if not exists idx_rot_regional_operation_scopes_operation
	on rot_regional_operation_scopes(operation_type, regional_id);

create table if not exists rot_permissions (
	id text primary key,
	section_id text not null,
	section_label text not null,
	feature_id text not null,
	feature_label text not null,
	action text not null,
	description text,
	sort_order integer not null default 0,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint rot_permissions_id_not_empty_chk check (btrim(id) <> ''),
	constraint rot_permissions_action_chk check (action in ('view', 'manage', 'approve', 'system'))
);

drop trigger if exists rot_permissions_touch_updated_at on rot_permissions;
create trigger rot_permissions_touch_updated_at
before update on rot_permissions
for each row execute function touch_updated_at();

create table if not exists rot_role_permissions (
	role_id text not null references rot_roles(id) on delete cascade,
	permission_id text not null references rot_permissions(id) on delete cascade,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (role_id, permission_id)
);

create index if not exists idx_rot_role_permissions_permission
	on rot_role_permissions(permission_id, role_id);

with catalog(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('*', 'sistema', 'Sistema', 'all', 'Acesso total', 'system', 0, 'Permissao administrativa total.'),
		('rot.dashboard.view', 'visao_geral', 'Visao geral', 'dashboard', 'Dashboard', 'view', 100, 'Visualizar dashboard.'),
		('rot.activities.view', 'operacao', 'Operacao', 'activities', 'Agenda', 'view', 200, 'Visualizar agenda operacional.'),
		('rot.activities.manage', 'operacao', 'Operacao', 'activities', 'Agenda', 'manage', 201, 'Gerenciar agenda operacional.'),
		('rot.apr.view', 'operacao', 'Operacao', 'apr', 'APR', 'view', 210, 'Visualizar APR.'),
		('rot.apr.manage', 'operacao', 'Operacao', 'apr', 'APR', 'manage', 211, 'Gerenciar APR.'),
		('rot.tickets.view', 'operacao', 'Operacao', 'tickets', 'Chamados', 'view', 220, 'Visualizar chamados.'),
		('rot.tickets.manage', 'operacao', 'Operacao', 'tickets', 'Chamados', 'manage', 221, 'Gerenciar chamados.'),
		('rot.shifts.view', 'operacao', 'Operacao', 'shifts', 'Turnos / Escala', 'view', 230, 'Visualizar turnos e escala.'),
		('rot.shifts.manage', 'operacao', 'Operacao', 'shifts', 'Turnos / Escala', 'manage', 231, 'Gerenciar turnos e escala.'),
		('rot.absences.view', 'rh', 'RH', 'absences', 'Faltas', 'view', 300, 'Visualizar faltas.'),
		('rot.absences.manage', 'rh', 'RH', 'absences', 'Faltas', 'manage', 301, 'Gerenciar faltas.'),
		('rot.timeoff.view', 'rh', 'RH', 'timeoff', 'Folgas', 'view', 310, 'Visualizar folgas.'),
		('rot.timeoff.approve', 'rh', 'RH', 'timeoff', 'Folgas', 'approve', 311, 'Aprovar folgas.'),
		('rot.vacations.view', 'rh', 'RH', 'vacations', 'Ferias', 'view', 320, 'Visualizar ferias.'),
		('rot.vacations.approve', 'rh', 'RH', 'vacations', 'Ferias', 'approve', 321, 'Aprovar ferias.'),
		('rot.holidays.manage', 'rh', 'RH', 'holidays', 'Feriados', 'manage', 330, 'Gerenciar feriados.'),
		('rot.fleet.view', 'recursos', 'Recursos', 'fleet', 'Frota', 'view', 400, 'Visualizar frota.'),
		('rot.fleet.manage', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 401, 'Gerenciar frota.'),
		('rot.equipments.view', 'estoque', 'Estoque', 'equipments', 'Equipamentos', 'view', 410, 'Visualizar equipamentos.'),
		('rot.equipments.manage', 'estoque', 'Estoque', 'equipments', 'Equipamentos', 'manage', 411, 'Gerenciar equipamentos.'),
		('rot.keys.view', 'recursos', 'Recursos', 'keys', 'Chaves', 'view', 420, 'Visualizar chaves.'),
		('rot.keys.manage', 'recursos', 'Recursos', 'keys', 'Chaves', 'manage', 421, 'Gerenciar chaves.'),
		('rot.materials.view', 'estoque', 'Estoque', 'materials', 'Materiais / Insumos', 'view', 430, 'Visualizar materiais.'),
		('rot.materials.manage', 'estoque', 'Estoque', 'materials', 'Materiais / Insumos', 'manage', 431, 'Gerenciar materiais.'),
		('rot.notices.manage', 'operacao', 'Operacao', 'notices', 'Avisos', 'manage', 500, 'Gerenciar avisos.'),
		('rot.ranking.view', 'analises', 'Analises', 'ranking', 'Ranking', 'view', 510, 'Visualizar ranking.'),
		('rot.weather.view', 'analises', 'Analises', 'weather', 'Clima', 'view', 520, 'Visualizar clima.'),
		('rot.rain.view', 'operacao', 'Operacao', 'rain', 'Chuva', 'view', 530, 'Visualizar alertas de chuva.'),
		('rot.rain.manage', 'operacao', 'Operacao', 'rain', 'Chuva', 'manage', 531, 'Gerenciar alertas de chuva.'),
		('rot.rompimentos.view', 'operacao', 'Operacao', 'rompimentos', 'Rompimentos', 'view', 540, 'Visualizar rompimentos.'),
		('rot.rompimentos.manage', 'operacao', 'Operacao', 'rompimentos', 'Rompimentos', 'manage', 541, 'Gerenciar rompimentos.'),
		('rot.qrcodes.view', 'operacao', 'Operacao', 'qrcodes', 'QR Codes', 'view', 550, 'Visualizar QR Codes.'),
		('rot.qrcodes.manage', 'operacao', 'Operacao', 'qrcodes', 'QR Codes', 'manage', 551, 'Gerenciar QR Codes.'),
		('rot.users.manage', 'gestao', 'Gestao', 'users', 'Usuarios, Cargos e Permissoes', 'manage', 600, 'Gerenciar usuarios, cargos e permissoes.'),
		('rot.regionals.manage', 'gestao', 'Gestao', 'regionals', 'Regionais / Cidades', 'manage', 610, 'Gerenciar regionais e cidades.'),
		('rot.service_types.manage', 'gestao', 'Gestao', 'service_types', 'Tipos de Servico', 'manage', 620, 'Gerenciar tipos de servico.'),
		('rot.settings.manage', 'configuracoes', 'Configuracoes', 'settings', 'Configuracoes / Integracoes', 'manage', 700, 'Gerenciar configuracoes e integracoes.'),
		('rot.logs.view', 'configuracoes', 'Configuracoes', 'logs', 'Logs de Auditoria', 'view', 710, 'Visualizar logs de auditoria.')
)
insert into rot_permissions (
	id, section_id, section_label, feature_id, feature_label, action, sort_order, description
)
select id, section_id, section_label, feature_id, feature_label, action, sort_order, description
from catalog
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

insert into rot_permissions (id, section_id, section_label, feature_id, feature_label, action, description)
select distinct permission_id, 'legado', 'Legado', 'legacy', permission_id, 'system', 'Permissao descoberta no JSONB legado.'
from (
	select jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as permission_id
	from rot_roles
) legacy
where btrim(permission_id) <> ''
on conflict (id) do nothing;

insert into rot_role_permissions (role_id, permission_id)
select distinct r.id, legacy.permission_id
from rot_roles r
cross join lateral jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as legacy(permission_id)
join rot_permissions p on p.id = legacy.permission_id
on conflict do nothing;

insert into rot_user_operation_scopes (user_id, operation_type, is_primary)
select id, 'ROT', true
from rot_users
on conflict (user_id, operation_type) do nothing;

insert into rot_regional_operation_scopes (regional_id, operation_type)
select id, 'ROT'
from rot_regionals
on conflict (regional_id, operation_type) do nothing;
