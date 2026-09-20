create table if not exists financeiro_equipe_setores (
	id uuid primary key default gen_random_uuid(),
	nome text not null,
	descricao text,
	cor text,
	responsavel_id uuid null,
	ordem integer not null default 0,
	created_by text,
	updated_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists financeiro_equipe_setores_nome_uidx
	on financeiro_equipe_setores (lower(nome));

create index if not exists financeiro_equipe_setores_ordem_idx
	on financeiro_equipe_setores (ordem, nome);

drop trigger if exists trg_financeiro_equipe_setores_updated_at on financeiro_equipe_setores;
create trigger trg_financeiro_equipe_setores_updated_at
	before update on financeiro_equipe_setores
	for each row execute function touch_updated_at();

insert into financeiro_equipe_setores (nome, ordem, created_by, updated_by)
select distinct trim(setor), 0, 'migration', 'migration'
from financeiro_equipe_cargos
where trim(coalesce(setor, '')) <> ''
on conflict do nothing;

alter table financeiro_equipe_cargos
	add column if not exists setor_id uuid null references financeiro_equipe_setores(id) on delete restrict;

update financeiro_equipe_cargos cargo
set setor_id = setor.id
from financeiro_equipe_setores setor
where cargo.setor_id is null
	and lower(trim(cargo.setor)) = lower(trim(setor.nome));

create index if not exists financeiro_equipe_cargos_setor_id_idx
	on financeiro_equipe_cargos (setor_id, ordem, nome);

create unique index if not exists financeiro_equipe_cargos_nome_setor_id_uidx
	on financeiro_equipe_cargos (lower(nome), setor_id)
	where setor_id is not null;

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'financeiro_equipe_setores_responsavel_id_fkey'
	) then
		alter table financeiro_equipe_setores
			add constraint financeiro_equipe_setores_responsavel_id_fkey
			foreign key (responsavel_id)
			references financeiro_equipe_colaboradores(id)
			on delete set null;
	end if;
end
$$;
