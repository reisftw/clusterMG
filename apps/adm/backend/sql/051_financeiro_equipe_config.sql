create or replace function set_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

create table if not exists financeiro_equipe_config (
	id text primary key default 'global',
	responsavel_geral_id uuid null references financeiro_equipe_colaboradores(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text
);

drop trigger if exists trg_financeiro_equipe_config_updated_at on financeiro_equipe_config;
create trigger trg_financeiro_equipe_config_updated_at
	before update on financeiro_equipe_config
	for each row
	execute function set_updated_at();

insert into financeiro_equipe_config (id)
values ('global')
on conflict (id) do nothing;
