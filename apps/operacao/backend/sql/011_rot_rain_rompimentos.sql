-- Alertas de Chuva + Rompimentos — fiel a rot/src/pages/RainPage.tsx e
-- RompimentosPage.tsx (versao simplificada: materiais como texto livre
-- em vez do catalogo completo do legado, e sem o modulo de relatorios
-- em PDF separado — os dados ja ficam visiveis/filtraveis na tela).

create table if not exists rot_rain_alerts (
	id text primary key,
	regional_id text references rot_regionals(id) on delete set null,
	city text not null default '',
	district text not null default '',
	tech_id text references rot_users(id) on delete set null,
	start_time timestamptz not null default now(),
	end_time timestamptz,
	active boolean not null default true,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_rain_alerts_regional on rot_rain_alerts(regional_id, start_time desc);

create table if not exists rot_rompimento_bases (
	regional_id text primary key references rot_regionals(id) on delete cascade,
	lat double precision not null,
	lng double precision not null,
	updated_at timestamptz not null default now()
);

create table if not exists rot_rompimentos (
	id text primary key,
	regional_id text references rot_regionals(id) on delete set null,
	cliente_nome text not null default '',
	cidade text not null default '',
	ponto_a_lat double precision,
	ponto_a_lng double precision,
	ponto_b_lat double precision,
	ponto_b_lng double precision,
	distancia_base numeric,
	materiais text not null default '',
	fibra_tipo text not null default '',
	fibra_metros numeric,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_rompimentos_regional on rot_rompimentos(regional_id, created_at desc);

drop trigger if exists rot_rompimentos_touch_updated_at on rot_rompimentos;
create trigger rot_rompimentos_touch_updated_at
before update on rot_rompimentos
for each row execute function touch_updated_at();
