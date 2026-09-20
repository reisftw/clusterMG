create table if not exists dre_lancamentos (
	id text primary key,
	competencia_mes integer not null check (competencia_mes between 1 and 12),
	competencia_ano integer not null check (competencia_ano between 2000 and 2100),
	linha_dre text not null,
	categoria_original text,
	descricao text,
	valor numeric(14, 2) not null default 0,
	origem_arquivo text,
	is_fake boolean not null default false,
	criado_em timestamptz not null default now(),
	criado_por text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create index if not exists idx_dre_lancamentos_competencia
	on dre_lancamentos (competencia_ano, competencia_mes, is_fake);

create index if not exists idx_dre_lancamentos_linha
	on dre_lancamentos (linha_dre);

create index if not exists idx_dre_lancamentos_fake
	on dre_lancamentos (is_fake);

create or replace function set_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

drop trigger if exists dre_lancamentos_touch_updated_at on dre_lancamentos;
create trigger dre_lancamentos_touch_updated_at
before update on dre_lancamentos
for each row execute function set_updated_at();
