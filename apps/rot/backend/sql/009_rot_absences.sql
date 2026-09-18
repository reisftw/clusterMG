-- Ausencias, Folgas e Ferias — consolida os 3 modelos do legado
-- (absences/timeOffRequests/vacationRequests, ver
-- rot/src/pages/AbsencesPage.tsx e TimeOffPage.tsx) numa unica tabela
-- com "type", no mesmo espirito da decisao ja tomada pra Turnos/Escala
-- (varios tipos legados -> 1 tabela com campo tipo). Cobre os 3 casos:
-- lancamento direto pelo gestor (status ja aprovado) e solicitacao pelo
-- proprio usuario (status pendente, precisa de aprovacao).
create table if not exists rot_absences (
	id text primary key,
	user_id text not null references rot_users(id) on delete cascade,
	regional_id text references rot_regionals(id) on delete set null,
	type text not null, -- ferias | folga | atestado
	start_date date not null,
	end_date date not null,
	reason text not null default '',
	status text not null default 'aprovado', -- pendente | aprovado | recusado
	requested_by text references rot_users(id) on delete set null,
	approved_by text references rot_users(id) on delete set null,
	approved_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_absences_user on rot_absences(user_id, start_date desc);
create index if not exists idx_rot_absences_regional on rot_absences(regional_id, start_date desc);
create index if not exists idx_rot_absences_status on rot_absences(status);

drop trigger if exists rot_absences_touch_updated_at on rot_absences;
create trigger rot_absences_touch_updated_at
before update on rot_absences
for each row execute function touch_updated_at();
