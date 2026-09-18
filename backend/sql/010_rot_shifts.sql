-- Turnos/Escala (Plantoes) — fiel a rot/src/pages/GlobalShiftsPage.tsx,
-- MyShiftsPage.tsx e rot/src/components/shared/ShiftCards.tsx. O legado
-- tinha varias colecoes/telas pro mesmo conceito (plantao_sempre,
-- plantao_ativo, on_call, escala) — aqui fica tudo numa unica tabela
-- com "tipo", decisao ja confirmada anteriormente com o usuario pra
-- essa area do sistema.
create table if not exists rot_shifts (
	id text primary key,
	tipo text not null default 'plantao', -- plantao | escala | on_call
	start_at timestamptz not null,
	end_at timestamptz not null,
	regional_id text references rot_regionals(id) on delete set null,
	team_ids text[] not null default '{}',
	notes text not null default '',
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_shifts_regional on rot_shifts(regional_id, start_at desc);
create index if not exists idx_rot_shifts_range on rot_shifts(start_at, end_at);

drop trigger if exists rot_shifts_touch_updated_at on rot_shifts;
create trigger rot_shifts_touch_updated_at
before update on rot_shifts
for each row execute function touch_updated_at();
