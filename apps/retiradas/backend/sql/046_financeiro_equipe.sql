create extension if not exists pgcrypto;

create or replace function touch_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

create table if not exists financeiro_equipe_cargos (
	id uuid primary key default gen_random_uuid(),
	nome text not null,
	setor text not null,
	descricao text,
	ordem integer not null default 0,
	created_by text,
	updated_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists financeiro_equipe_cargos_nome_setor_uidx
	on financeiro_equipe_cargos (lower(nome), lower(setor));

create index if not exists financeiro_equipe_cargos_setor_idx
	on financeiro_equipe_cargos (setor, ordem, nome);

drop trigger if exists financeiro_equipe_cargos_touch_updated_at on financeiro_equipe_cargos;
create trigger financeiro_equipe_cargos_touch_updated_at
	before update on financeiro_equipe_cargos
	for each row
	execute function touch_updated_at();

create table if not exists financeiro_equipe_colaboradores (
	id uuid primary key default gen_random_uuid(),
	setor text not null,
	nome text not null,
	cargo_id uuid references financeiro_equipe_cargos(id) on delete restrict,
	formacao text,
	atividades text,
	gestor_id uuid references financeiro_equipe_colaboradores(id)
		on delete set null
		deferrable initially deferred,
	avatar_url text,
	pos_x numeric,
	pos_y numeric,
	ordem integer not null default 0,
	ativo boolean not null default true,
	created_by text,
	updated_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint financeiro_equipe_colaboradores_not_self_manager
		check (gestor_id is null or gestor_id <> id)
);

create index if not exists financeiro_equipe_colaboradores_setor_idx
	on financeiro_equipe_colaboradores (setor, ordem, nome)
	where ativo = true;

create index if not exists financeiro_equipe_colaboradores_cargo_idx
	on financeiro_equipe_colaboradores (cargo_id)
	where ativo = true;

create index if not exists financeiro_equipe_colaboradores_gestor_idx
	on financeiro_equipe_colaboradores (gestor_id, ordem, nome)
	where ativo = true;

drop trigger if exists financeiro_equipe_colaboradores_touch_updated_at on financeiro_equipe_colaboradores;
create trigger financeiro_equipe_colaboradores_touch_updated_at
	before update on financeiro_equipe_colaboradores
	for each row
	execute function touch_updated_at();

with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
	values
		(
			'financeiro.equipe.view',
			'financeiro',
			'Financeiro',
			'equipe',
			'Equipe',
			'view',
			1380,
			null,
			'Permite visualizar o organograma da equipe financeira.'
		),
		(
			'financeiro.equipe.manage',
			'financeiro',
			'Financeiro',
			'equipe',
			'Equipe',
			'manage',
			1381,
			null,
			'Permite cadastrar cargos, colaboradores e reorganizar o organograma financeiro.'
		)
)
insert into app_permissions (
	id,
	section_id,
	section_label,
	feature_id,
	feature_label,
	action,
	sort_order,
	legacy_permission,
	description,
	active,
	deprecated
)
select
	id,
	section_id,
	section_label,
	feature_id,
	feature_label,
	action,
	sort_order,
	legacy_permission,
	description,
	true,
	false
from permissions
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	legacy_permission = excluded.legacy_permission,
	description = excluded.description,
	active = true,
	deprecated = false;
