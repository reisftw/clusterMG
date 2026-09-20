-- Atividades — fiel ao ActivityDocument do legado
-- (rot/src/types/firestore.ts + rot/src/services/firebase/activities.ts):
-- visita/atendimento comercial agendado (cliente, data/hora, prioridade,
-- descricao do servico, tecnico responsavel).
create table if not exists rot_activities (
	id text primary key,
	regional_id text references rot_regionals(id) on delete set null,
	city_id text references rot_cities(id) on delete set null,
	client_name text not null,
	company_contact text not null default '',
	date date not null,
	time text not null default '',
	location_url text not null default '',
	priority text not null default 'normal', -- baixa | normal | alta
	service_description text not null default '',
	status text not null default 'pendente', -- pendente | concluida | cancelada
	requested_by text not null default '',
	user_id text references rot_users(id) on delete set null, -- tecnico responsavel
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_activities_regional on rot_activities(regional_id, date desc);
create index if not exists idx_rot_activities_user on rot_activities(user_id, date desc);

drop trigger if exists rot_activities_touch_updated_at on rot_activities;
create trigger rot_activities_touch_updated_at
before update on rot_activities
for each row execute function touch_updated_at();
