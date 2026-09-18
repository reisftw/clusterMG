-- Feriados, Avisos e Chaves — proximo lote de modulos operacionais do
-- ROT (fiel ao legado em rot/src/pages/HolidaysPage.tsx,
-- NoticesPage.tsx e KeysPage.tsx). Todos escopados por regional via
-- scopeRegionalFilter, seguindo o mesmo padrao ja aplicado a
-- regionais/qrcodes.

create table if not exists rot_holidays (
	id text primary key,
	title text not null,
	date date not null,
	type text not null default 'REGIONAL', -- NATIONAL | MUNICIPAL | REGIONAL
	regional_id text references rot_regionals(id) on delete set null,
	city_id text references rot_cities(id) on delete set null,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_holidays_regional on rot_holidays(regional_id);
create index if not exists idx_rot_holidays_date on rot_holidays(date);

drop trigger if exists rot_holidays_touch_updated_at on rot_holidays;
create trigger rot_holidays_touch_updated_at
before update on rot_holidays
for each row execute function touch_updated_at();

create table if not exists rot_notices (
	id text primary key,
	title text not null,
	content text not null default '',
	image_url text not null default '',
	-- 'GLOBAL' = visivel a todos autenticados; senao, id de regional.
	target_regional_id text not null default 'GLOBAL',
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_notices_target on rot_notices(target_regional_id);

drop trigger if exists rot_notices_touch_updated_at on rot_notices;
create trigger rot_notices_touch_updated_at
before update on rot_notices
for each row execute function touch_updated_at();

create table if not exists rot_keys (
	id text primary key,
	name text not null,
	address text not null default '',
	regional_id text references rot_regionals(id) on delete set null,
	status text not null default 'available', -- available | in_use | awaiting_approval | rejected
	current_user_id text references rot_users(id) on delete set null,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_keys_regional on rot_keys(regional_id);

drop trigger if exists rot_keys_touch_updated_at on rot_keys;
create trigger rot_keys_touch_updated_at
before update on rot_keys
for each row execute function touch_updated_at();

-- Historico de uso (resgate/devolucao/aprovacao/recusa) — mesmo espirito
-- do "Registro de Uso" do KeysPage.tsx legado.
create table if not exists rot_key_events (
	id text primary key,
	key_id text not null references rot_keys(id) on delete cascade,
	action text not null, -- taken | return_requested | return_approved | return_rejected
	user_id text references rot_users(id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_key_events_key on rot_key_events(key_id, created_at desc);
