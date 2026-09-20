-- Base de origem do ativo (cidade/base operacional, ex: BMO = Brumadinho).
-- Usada como segmento do codigo do ativo, alem da regional: FIELD-BMO-ATV-000001.

create table if not exists rot_asset_bases (
	id text primary key,
	regional_id text references regionais(id) on delete set null,
	name text not null,
	code text not null,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists ux_rot_asset_bases_upper_code on rot_asset_bases (upper(code));
create index if not exists idx_rot_asset_bases_regional on rot_asset_bases(regional_id);

drop trigger if exists rot_asset_bases_touch_updated_at on rot_asset_bases;
create trigger rot_asset_bases_touch_updated_at
before update on rot_asset_bases
for each row execute function touch_updated_at();

alter table rot_assets add column if not exists base_id text references rot_asset_bases(id) on delete set null;

create index if not exists idx_rot_assets_base on rot_assets(base_id);
