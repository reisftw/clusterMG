-- Regionais canônicas da Operação.
-- A fonte nova passa a ser `regionais` + filhos. As tabelas `rot_*` seguem
-- existindo como compatibilidade até todos os módulos consumirem o modelo novo.

create extension if not exists pgcrypto;

create table if not exists regionais (
	id text primary key,
	nome text not null,
	uf text,
	ativo boolean not null default true,
	legacy_path text,
	legacy_document_id text,
	source_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	updated_by text references rot_users(id) on delete set null,
	constraint regionais_nome_not_empty_chk check (btrim(nome) <> '')
);

create unique index if not exists idx_regionais_nome_unique
	on regionais(lower(nome));

create index if not exists idx_regionais_ativo_nome
	on regionais(ativo, lower(nome));

drop trigger if exists regionais_touch_updated_at on regionais;
create trigger regionais_touch_updated_at
before update on regionais
for each row execute function touch_updated_at();

create table if not exists regional_cidades (
	id uuid primary key default gen_random_uuid(),
	regional_id text not null references regionais(id) on delete cascade,
	nome text not null,
	tipo text,
	legacy_path text,
	legacy_document_id text,
	source_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	updated_by text references rot_users(id) on delete set null,
	constraint regional_cidades_nome_not_empty_chk check (btrim(nome) <> '')
);

create unique index if not exists idx_regional_cidades_nome_unique
	on regional_cidades(regional_id, lower(nome));

create index if not exists idx_regional_cidades_regional
	on regional_cidades(regional_id, lower(nome));

create index if not exists idx_regional_cidades_legacy_document
	on regional_cidades(legacy_document_id);

drop trigger if exists regional_cidades_touch_updated_at on regional_cidades;
create trigger regional_cidades_touch_updated_at
before update on regional_cidades
for each row execute function touch_updated_at();

create table if not exists regional_responsaveis (
	id uuid primary key default gen_random_uuid(),
	regional_id text not null references regionais(id) on delete cascade,
	tipo text not null,
	nome text,
	email text,
	telefone text,
	source_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	updated_by text references rot_users(id) on delete set null,
	constraint regional_responsaveis_tipo_chk check (tipo in ('lider', 'supervisor', 'backoffice', 'delivery', 'field_service'))
);

create index if not exists idx_regional_responsaveis_regional
	on regional_responsaveis(regional_id, tipo);

drop trigger if exists regional_responsaveis_touch_updated_at on regional_responsaveis;
create trigger regional_responsaveis_touch_updated_at
before update on regional_responsaveis
for each row execute function touch_updated_at();

create table if not exists regional_operation_scopes (
	regional_id text not null references regionais(id) on delete cascade,
	operation_type text not null references rot_operation_types(id) on delete restrict,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (regional_id, operation_type)
);

create index if not exists idx_regional_operation_scopes_operation
	on regional_operation_scopes(operation_type, regional_id);

insert into regionais (id, nome, ativo, legacy_path, legacy_document_id, source_payload, created_at, updated_at)
select
	r.id,
	r.name,
	true,
	'rot_regionals/' || r.id,
	r.id,
	jsonb_build_object(
		'legacyTable', 'rot_regionals',
		'responsaveis', coalesce(r.responsaveis, '[]'::jsonb)
	),
	r.created_at,
	r.updated_at
from rot_regionals r
on conflict (id) do update set
	nome = excluded.nome,
	ativo = excluded.ativo,
	legacy_path = excluded.legacy_path,
	legacy_document_id = excluded.legacy_document_id,
	source_payload = excluded.source_payload,
	updated_at = excluded.updated_at;

insert into regional_cidades (regional_id, nome, tipo, legacy_path, legacy_document_id, source_payload, created_at, updated_at)
select
	c.regional_id,
	c.name,
	null,
	'rot_cities/' || c.id,
	c.id,
	jsonb_build_object(
		'legacyTable', 'rot_cities',
		'lat', c.lat,
		'lng', c.lng
	),
	c.created_at,
	c.updated_at
from rot_cities c
join regionais r on r.id = c.regional_id
where not exists (
	select 1
	from regional_cidades rc
	where rc.regional_id = c.regional_id
	  and lower(rc.nome) = lower(c.name)
);

update regional_cidades rc
set
	nome = c.name,
	tipo = null,
	legacy_path = 'rot_cities/' || c.id,
	legacy_document_id = c.id,
	source_payload = jsonb_build_object(
		'legacyTable', 'rot_cities',
		'lat', c.lat,
		'lng', c.lng
	),
	updated_at = c.updated_at
from rot_cities c
where rc.regional_id = c.regional_id
  and lower(rc.nome) = lower(c.name);

delete from regional_responsaveis
where source_payload->>'legacyTable' = 'rot_regionals';

insert into regional_responsaveis (regional_id, tipo, telefone, source_payload, created_at, updated_at)
select
	r.id,
	case item.value->>'type'
		when 'supervisor_field' then 'field_service'
		else 'supervisor'
	end,
	nullif(btrim(coalesce(item.value->>'phone', '')), ''),
	jsonb_set(
		coalesce(item.value, '{}'::jsonb) || jsonb_build_object('legacyTable', 'rot_regionals'),
		'{papelOperacional}',
		to_jsonb('supervisor'::text),
		true
	),
	r.created_at,
	r.updated_at
from rot_regionals r
cross join lateral jsonb_array_elements(coalesce(r.responsaveis, '[]'::jsonb)) item
where item.value->>'type' in ('supervisor_rot', 'supervisor_field');

insert into regional_operation_scopes (regional_id, operation_type)
select regional_id, operation_type
from rot_regional_operation_scopes
on conflict do nothing;

insert into regional_operation_scopes (regional_id, operation_type)
select id, 'ROT'
from regionais
on conflict do nothing;
