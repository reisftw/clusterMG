-- Chamados (Tickets/O.S.) — fiel a rot/src/pages/TicketsPage.tsx e ao
-- tipo TicketDocument (rot/src/types/firestore.ts): numero de ticket,
-- data, tipo de servico (com pontuacao, usado no ranking), cidade,
-- equipe (varios tecnicos). Precisa do catalogo de Tipos de Servico
-- (rot.service_types.manage, ja previsto no catalogo de permissoes).
-- Fora de escopo deliberado: import via planilha XLSX do legado —
-- cadastro manual cobre o mesmo resultado final sem a complexidade do
-- parser de workbook.

create table if not exists rot_service_types (
	id text primary key,
	name text not null,
	points numeric not null default 0,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

drop trigger if exists rot_service_types_touch_updated_at on rot_service_types;
create trigger rot_service_types_touch_updated_at
before update on rot_service_types
for each row execute function touch_updated_at();

create table if not exists rot_tickets (
	id text primary key,
	ticket_number text not null,
	date date not null,
	service_type_id text references rot_service_types(id) on delete set null,
	regional_id text references rot_regionals(id) on delete set null,
	city_id text references rot_cities(id) on delete set null,
	team_ids text[] not null default '{}',
	status text not null default 'aberto', -- aberto | concluido
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_tickets_regional on rot_tickets(regional_id, date desc);
-- Nao-unico de proposito — ver 013_rot_tickets_number_nao_unico.sql
-- (import dos dados reais do Firebase mostrou numero repetido na
-- pratica; so indice pra performance de busca, sem travar duplicata).
create index if not exists idx_rot_tickets_number_regional on rot_tickets(regional_id, ticket_number);

drop trigger if exists rot_tickets_touch_updated_at on rot_tickets;
create trigger rot_tickets_touch_updated_at
before update on rot_tickets
for each row execute function touch_updated_at();
