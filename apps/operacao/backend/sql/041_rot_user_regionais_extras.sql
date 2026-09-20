-- Suporte a usuario (supervisor/lider) responsavel por mais de uma
-- regional. rot_users.regional_id continua sendo a regional principal
-- (usada por scopeRegionalFilter em todo o resto do sistema, sem mudar
-- esse contrato existente) — esta tabela guarda regionais ADICIONAIS,
-- hoje usada apenas para autorizar lancamento de plantao em mais de
-- uma regional (rot_shifts).

create table if not exists rot_user_regionais_extras (
	user_id text not null references rot_users(id) on delete cascade,
	regional_id text not null references regionais(id) on delete cascade,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (user_id, regional_id)
);

create index if not exists idx_rot_user_regionais_extras_regional
	on rot_user_regionais_extras(regional_id, user_id);
