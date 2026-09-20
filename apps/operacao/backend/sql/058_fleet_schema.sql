-- Fase 1 da reestruturacao de Frotas — reaproveita e ESTENDE o que ja
-- existe (rot_vehicles, rot_vehicle_claims, rot_vehicle_maintenances,
-- rot_workshops, regionais, rot_users) em vez de criar um dominio
-- paralelo. Nada aqui duplica veiculo/colaborador/usuario/operacao/
-- regional/manutencao/sinistro/oficina.

-- --- rot_vehicles: status proprio (antes so calculado no frontend a
-- partir de manutencao aberta/responsavel) + KM central + ano/modelo.
alter table rot_vehicles add column if not exists status text;
alter table rot_vehicles add column if not exists current_km integer;
alter table rot_vehicles add column if not exists current_km_at timestamptz;
alter table rot_vehicles add column if not exists year integer;

-- Backfill de status a partir do estado ja observavel hoje (manutencao
-- OPEN -> em manutencao; tem responsavel -> em operacao; senao
-- disponivel na base) — sem inventar dado novo, so explicitando o que
-- ja era verdade implicitamente.
update rot_vehicles v set status = 'EM_MANUTENCAO'
 where status is null and exists (
	select 1 from rot_vehicle_maintenances m where m.vehicle_id = v.id and m.status = 'OPEN'
 );
update rot_vehicles v set status = 'EM_OPERACAO'
 where status is null and v.responsible_id is not null;
update rot_vehicles v set status = 'DISPONIVEL_BASE'
 where status is null;

alter table rot_vehicles alter column status set not null;
alter table rot_vehicles drop constraint if exists rot_vehicles_status_check;
alter table rot_vehicles add constraint rot_vehicles_status_check
	check (status in (
		'EM_OPERACAO', 'DISPONIVEL_BASE', 'AGUARDANDO_RECEBIMENTO', 'AGUARDANDO_MANUTENCAO',
		'EM_MANUTENCAO', 'BLOQUEADO', 'SINISTRO', 'RESERVA', 'INATIVO'
	));

create index if not exists idx_rot_vehicles_status on rot_vehicles(status);

-- --- Historico real de odometro (secao 5-9 do pedido). KM nulo no
-- veiculo = "ainda nao informado" (secao 57) ate a primeira leitura.
create table if not exists rot_vehicle_odometer_readings (
	id bigserial primary key,
	vehicle_id text not null references rot_vehicles(id) on delete cascade,
	km integer not null check (km >= 0),
	previous_km integer,
	origin text not null check (origin in (
		'CADASTRO', 'TRANSFERENCIA_ENTREGA', 'TRANSFERENCIA_RECEBIMENTO', 'DEVOLUCAO_BASE',
		'RETIRADA_BASE', 'ENTRADA_MANUTENCAO', 'RETORNO_MANUTENCAO', 'LEITURA_MANUAL',
		'CORRECAO_ADMINISTRATIVA', 'INATIVACAO', 'MIGRACAO_LEGADO'
	)),
	movement_id text,
	maintenance_id text references rot_vehicle_maintenances(id) on delete set null,
	note text,
	reason text,
	jump_confirmed boolean not null default false,
	recorded_by text references rot_users(id) on delete set null,
	recorded_at timestamptz not null default now()
);

create index if not exists idx_rot_vehicle_odometer_vehicle on rot_vehicle_odometer_readings(vehicle_id, recorded_at desc);

-- --- Movimentacoes de custodia: transferencia (com aceite explicito),
-- devolucao a base, retirada da base (secoes 10-14). Manutencao
-- continua em rot_vehicle_maintenances (estendida abaixo) — nao
-- duplicada aqui.
create table if not exists rot_vehicle_movements (
	id text primary key,
	vehicle_id text not null references rot_vehicles(id) on delete cascade,
	type text not null check (type in ('TRANSFERENCIA', 'DEVOLUCAO_BASE', 'RETIRADA_BASE')),
	status text not null default 'CONCLUIDO' check (status in ('PENDENTE', 'CONFIRMADO', 'CANCELADO', 'CONCLUIDO')),
	operation_scope text not null,
	regional_id text references regionais(id) on delete set null,
	from_responsible_id text references rot_users(id) on delete set null,
	to_responsible_id text references rot_users(id) on delete set null,
	km_out integer,
	km_in integer,
	reason text,
	note text,
	created_by text references rot_users(id) on delete set null,
	confirmed_by text references rot_users(id) on delete set null,
	confirmed_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_vehicle_movements_vehicle on rot_vehicle_movements(vehicle_id, created_at desc);
create index if not exists idx_rot_vehicle_movements_status on rot_vehicle_movements(status);

alter table rot_vehicle_odometer_readings
	add constraint rot_vehicle_odometer_readings_movement_id_fkey
	foreign key (movement_id) references rot_vehicle_movements(id) on delete set null;

-- --- Cadeia de custodia (secoes 28-29): quem ficou com o veiculo, de
-- quando a quando, quanto rodou.
create table if not exists rot_vehicle_custody (
	id bigserial primary key,
	vehicle_id text not null references rot_vehicles(id) on delete cascade,
	responsible_id text not null references rot_users(id) on delete cascade,
	operation_scope text not null,
	regional_id text references regionais(id) on delete set null,
	started_at timestamptz not null default now(),
	started_km integer,
	ended_at timestamptz,
	ended_km integer,
	start_movement_id text references rot_vehicle_movements(id) on delete set null,
	end_movement_id text references rot_vehicle_movements(id) on delete set null
);

create index if not exists idx_rot_vehicle_custody_vehicle on rot_vehicle_custody(vehicle_id, started_at desc);
create index if not exists idx_rot_vehicle_custody_responsible on rot_vehicle_custody(responsible_id, started_at desc);
create unique index if not exists uq_rot_vehicle_custody_open on rot_vehicle_custody(vehicle_id) where ended_at is null;

-- --- Historico de status (base da Timeline, secao 27): toda transicao
-- de status relevante, com motivo quando aplicavel (bloqueio, parada).
create table if not exists rot_vehicle_status_history (
	id bigserial primary key,
	vehicle_id text not null references rot_vehicles(id) on delete cascade,
	from_status text,
	to_status text not null,
	reason text,
	note text,
	movement_id text references rot_vehicle_movements(id) on delete set null,
	maintenance_id text references rot_vehicle_maintenances(id) on delete set null,
	claim_id text references rot_vehicle_claims(id) on delete set null,
	changed_by text references rot_users(id) on delete set null,
	changed_at timestamptz not null default now()
);

create index if not exists idx_rot_vehicle_status_history_vehicle on rot_vehicle_status_history(vehicle_id, changed_at desc);

-- --- Documentos do veiculo (secao 23; alerta de vencimento fica pra
-- proxima fase). Arquivo via rot_image_attachments generico
-- (059_fleet_attachments.sql), sem tabela de arquivo propria.
create table if not exists rot_vehicle_documents (
	id text primary key,
	vehicle_id text not null references rot_vehicles(id) on delete cascade,
	type text not null,
	number text,
	issued_at date,
	expires_at date,
	note text,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_vehicle_documents_vehicle on rot_vehicle_documents(vehicle_id);
create index if not exists idx_rot_vehicle_documents_expires on rot_vehicle_documents(expires_at);

drop trigger if exists rot_vehicle_documents_touch_updated_at on rot_vehicle_documents;
create trigger rot_vehicle_documents_touch_updated_at
before update on rot_vehicle_documents
for each row execute function touch_updated_at();

-- --- Manutencao (secoes 15-19): ESTENDE a tabela existente, nao
-- duplica. KM obrigatorio na entrada/retorno, referencia de proxima
-- revisao por KM.
alter table rot_vehicle_maintenances add column if not exists km_in integer;
alter table rot_vehicle_maintenances add column if not exists km_out integer;
alter table rot_vehicle_maintenances add column if not exists reason text;
alter table rot_vehicle_maintenances add column if not exists maintenance_type text;
alter table rot_vehicle_maintenances add column if not exists next_km integer;
alter table rot_vehicle_maintenances add column if not exists interval_km integer;
alter table rot_vehicle_maintenances add column if not exists previous_status text;
alter table rot_vehicle_maintenances add column if not exists released_by text references rot_users(id) on delete set null;

-- --- Bloqueio (secoes 21-22): motivo obrigatorio guardado direto no
-- veiculo pra exibir sem join; historico completo fica em
-- rot_vehicle_status_history.
alter table rot_vehicles add column if not exists blocked_reason text;
alter table rot_vehicles add column if not exists blocked_at timestamptz;
alter table rot_vehicles add column if not exists previous_status text;

-- --- Baixa/inativacao (secao 43).
alter table rot_vehicles add column if not exists inactivated_reason text;
alter table rot_vehicles add column if not exists inactivated_at timestamptz;
alter table rot_vehicles add column if not exists final_km integer;

-- --- Reserva (secao 42) — so o modelo, sem tela nesta fase (pedido
-- explicito: "preparar o modelo para futura implementacao sem causar
-- complexidade desnecessaria").
create table if not exists rot_vehicle_reservations (
	id text primary key,
	vehicle_id text not null references rot_vehicles(id) on delete cascade,
	responsible_id text references rot_users(id) on delete set null,
	operation_scope text not null,
	start_date date not null,
	end_date date not null,
	reason text,
	note text,
	status text not null default 'RESERVADO' check (status in ('RESERVADO', 'CANCELADO', 'CONCLUIDO')),
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_vehicle_reservations_vehicle on rot_vehicle_reservations(vehicle_id, start_date);
