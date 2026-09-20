-- ROT — núcleo: migrations, trigger helper, RBAC, usuários, organização.
-- Mesmo padrão de apps/finan/backend/sql/001_finan_core.sql, adaptado:
-- ROT tem regional/cidade como dimensão de primeira classe (existia no
-- Firestore original como campo em quase toda coleção — users.regionalId,
-- activities.regionalId, tickets.regionalId etc.), então isso já entra
-- na migration núcleo, não depois como no Finan.

create table if not exists rot_migrations (
	id text primary key,
	applied_at timestamptz not null default now()
);

create or replace function touch_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

-- RBAC: cargos hierárquicos por nível, igual roles.ts do sistema atual
-- (SITE_ADMIN=100 até AUX=5). Mantém "level" e "global" (cargo enxerga
-- todas as regionais ou só a própria) como no ROT original — é a base do
-- "shouldFilterByRegional"/"shouldSeeOnlyOwnData" do usePermissions.js
-- atual, agora aplicado no backend (RBAC de verdade, não só no cliente).
create table if not exists rot_roles (
	id text primary key,
	name text not null,
	description text,
	level integer not null default 0,
	is_global boolean not null default false,
	permissions jsonb not null default '[]'::jsonb,
	system_role boolean not null default false,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

drop trigger if exists rot_roles_touch_updated_at on rot_roles;
create trigger rot_roles_touch_updated_at
before update on rot_roles
for each row execute function touch_updated_at();

create table if not exists rot_regionals (
	id text primary key,
	name text not null unique,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

drop trigger if exists rot_regionals_touch_updated_at on rot_regionals;
create trigger rot_regionals_touch_updated_at
before update on rot_regionals
for each row execute function touch_updated_at();

create table if not exists rot_cities (
	id text primary key,
	name text not null,
	regional_id text not null references rot_regionals(id) on delete restrict,
	lat double precision,
	lng double precision,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_cities_regional on rot_cities(regional_id);

drop trigger if exists rot_cities_touch_updated_at on rot_cities;
create trigger rot_cities_touch_updated_at
before update on rot_cities
for each row execute function touch_updated_at();

create table if not exists rot_users (
	id text primary key,
	name text not null,
	username text not null unique,
	email text unique,
	password_hash text not null,
	role_id text not null references rot_roles(id),
	regional_id text references rot_regionals(id) on delete set null,
	city_id text references rot_cities(id) on delete set null,
	phone text,
	avatar_url text,
	status text not null default 'ativo',
	must_change_password boolean not null default false,
	-- login_provider registra como a sessao foi criada da ultima vez
	-- ("local" | "google") — nao restringe o metodo de login futuro, so
	-- fica pra auditoria/suporte.
	login_provider text,
	last_login_at timestamptz,
	last_login_ip text,
	created_by text references rot_users(id),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_users_role on rot_users(role_id);
create index if not exists idx_rot_users_regional on rot_users(regional_id);

drop trigger if exists rot_users_touch_updated_at on rot_users;
create trigger rot_users_touch_updated_at
before update on rot_users
for each row execute function touch_updated_at();

create table if not exists rot_password_resets (
	id text primary key,
	user_id text not null references rot_users(id) on delete cascade,
	token_hash text not null,
	expires_at timestamptz not null,
	consumed_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_password_resets_user on rot_password_resets(user_id);

-- Auditoria: mesmo padrao de finan_audit_logs — quem fez o que, quando,
-- antes/depois. UX_AUDIT.md do Finan (secao 11 do CLAUDE.md) documenta a
-- intencao: auditar acao humana relevante, nao rotina de sistema.
create table if not exists rot_audit_logs (
	id bigserial primary key,
	user_id text references rot_users(id) on delete set null,
	user_name text,
	action text not null,
	entity text not null,
	entity_id text,
	before_data jsonb,
	after_data jsonb,
	ip_address text,
	user_agent text,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_audit_logs_entity on rot_audit_logs(entity, entity_id);
create index if not exists idx_rot_audit_logs_created_at on rot_audit_logs(created_at desc);

-- Config OAuth (Google) — mesmo padrao de config_bases dinamica: pode
-- ser ajustada via admin sem redeploy, com fallback pras env vars
-- ROT_GOOGLE_OAUTH_* quando a linha nao existe ainda.
create table if not exists rot_settings (
	key text primary key,
	value jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now(),
	updated_by text references rot_users(id)
);

-- Seeds: cargos padrao, espelhando roles.ts do ROT atual (label, level,
-- global) — so troca "role" (chave de app) por "id" (chave de tabela) e
-- adiciona a lista de permissoes granulares por cargo, no mesmo formato
-- namespaced usado no ecossistema (ex.: "rot.dashboard.view").
insert into rot_roles (id, name, description, level, is_global, permissions, system_role)
values
	('site_admin', 'Administrador do Site', 'Acesso total ao sistema ROT.', 100, true,
		'["*"]'::jsonb, true),
	('manager', 'Gerente', 'Gestao global de todas as regionais.', 90, true,
		'["rot.dashboard.view","rot.activities.view","rot.activities.manage","rot.tickets.view","rot.tickets.manage","rot.shifts.view","rot.shifts.manage","rot.absences.view","rot.absences.manage","rot.timeoff.view","rot.timeoff.approve","rot.vacations.view","rot.vacations.approve","rot.holidays.manage","rot.notices.manage","rot.ranking.view","rot.fleet.view","rot.fleet.manage","rot.weather.view","rot.rain.view","rot.rain.manage","rot.equipments.view","rot.equipments.manage","rot.keys.view","rot.keys.manage","rot.materials.view","rot.materials.manage","rot.rompimentos.view","rot.rompimentos.manage","rot.qrcodes.view","rot.qrcodes.manage","rot.users.manage","rot.regionals.manage","rot.service_types.manage","rot.settings.manage","rot.logs.view"]'::jsonb, true),
	('coordinator', 'Coordenador', 'Coordenacao global, sem gestao de usuarios/config.', 80, true,
		'["rot.dashboard.view","rot.activities.view","rot.activities.manage","rot.tickets.view","rot.tickets.manage","rot.shifts.view","rot.shifts.manage","rot.absences.view","rot.absences.manage","rot.timeoff.view","rot.timeoff.approve","rot.vacations.view","rot.vacations.approve","rot.holidays.manage","rot.notices.manage","rot.ranking.view","rot.fleet.view","rot.fleet.manage","rot.weather.view","rot.rain.view","rot.rain.manage","rot.equipments.view","rot.equipments.manage","rot.keys.view","rot.keys.manage","rot.materials.view","rot.materials.manage","rot.rompimentos.view","rot.qrcodes.view","rot.qrcodes.manage"]'::jsonb, true),
	('regional_supervisor', 'Supervisor Regional', 'Gestao operacional da propria regional.', 70, false,
		'["rot.dashboard.view","rot.activities.view","rot.activities.manage","rot.tickets.view","rot.tickets.manage","rot.shifts.view","rot.shifts.manage","rot.absences.view","rot.absences.manage","rot.timeoff.view","rot.timeoff.approve","rot.vacations.view","rot.vacations.approve","rot.ranking.view","rot.fleet.view","rot.fleet.manage","rot.weather.view","rot.rain.view","rot.equipments.view","rot.equipments.manage","rot.keys.view","rot.materials.view","rot.materials.manage","rot.qrcodes.view"]'::jsonb, true),
	('tech_lead', 'Lider Tecnico', 'Lideranca operacional da propria regional.', 60, false,
		'["rot.dashboard.view","rot.activities.view","rot.activities.manage","rot.tickets.view","rot.tickets.manage","rot.shifts.view","rot.shifts.manage","rot.absences.view","rot.vacations.view","rot.ranking.view","rot.fleet.view","rot.weather.view","rot.rain.view","rot.equipments.view","rot.keys.view","rot.materials.view"]'::jsonb, true),
	('tech_3', 'Tecnico Nivel III', 'Operacao tecnica, propria regional.', 30, false,
		'["rot.dashboard.view","rot.activities.view","rot.tickets.view","rot.shifts.view","rot.absences.view","rot.vacations.view","rot.ranking.view","rot.weather.view","rot.rain.view","rot.equipments.view","rot.materials.view"]'::jsonb, true),
	('tech_2', 'Tecnico Nivel II', 'Operacao tecnica, propria regional.', 20, false,
		'["rot.dashboard.view","rot.activities.view","rot.tickets.view","rot.shifts.view","rot.absences.view","rot.vacations.view","rot.ranking.view","rot.weather.view","rot.rain.view","rot.equipments.view","rot.materials.view"]'::jsonb, true),
	('tech_1', 'Tecnico Nivel I', 'Operacao tecnica, propria regional.', 10, false,
		'["rot.dashboard.view","rot.activities.view","rot.tickets.view","rot.shifts.view","rot.absences.view","rot.vacations.view","rot.ranking.view","rot.weather.view","rot.rain.view","rot.equipments.view","rot.materials.view"]'::jsonb, true),
	('aux', 'Auxiliar Tecnico', 'Suporte operacional, propria regional.', 5, false,
		'["rot.dashboard.view","rot.activities.view","rot.tickets.view","rot.shifts.view","rot.absences.view","rot.weather.view","rot.rain.view"]'::jsonb, true)
on conflict (id) do update set
	name = excluded.name,
	description = excluded.description,
	level = excluded.level,
	is_global = excluded.is_global,
	permissions = excluded.permissions,
	system_role = true,
	updated_at = now();
