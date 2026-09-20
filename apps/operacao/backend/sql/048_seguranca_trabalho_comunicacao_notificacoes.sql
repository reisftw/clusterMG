-- Fase D do dominio Seguranca do Trabalho: comunicacao estruturada
-- dentro do protocolo + notificacoes internas.
--
-- rot_notifications e generico de proposito (nao especifico de SST):
-- o Operacao nao tinha nenhum sistema de notificacao interna ate agora
-- (so o caso bespoke de rot_apr_alerts, so pra APR). Fica pronto pra
-- qualquer dominio futuro usar, nao so Seguranca do Trabalho.

create table if not exists sst_protocol_messages (
	id text primary key,
	protocol_id text not null references sst_protocols(id) on delete cascade,
	author_id text references rot_users(id) on delete set null,
	visibility text not null check (visibility in ('interno', 'compartilhado')),
	body text not null,
	created_at timestamptz not null default now()
);

create index if not exists idx_sst_protocol_messages_protocol on sst_protocol_messages(protocol_id, created_at);

create table if not exists sst_information_requests (
	id text primary key,
	protocol_id text not null references sst_protocols(id) on delete cascade,
	requested_by text references rot_users(id) on delete set null,
	target_user_id text not null references rot_users(id) on delete cascade,
	question text not null,
	status text not null default 'pending' check (status in ('pending', 'answered')),
	answer text,
	answered_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_sst_information_requests_protocol on sst_information_requests(protocol_id, created_at);
create index if not exists idx_sst_information_requests_target on sst_information_requests(target_user_id, status);

create table if not exists rot_notifications (
	id text primary key,
	user_id text not null references rot_users(id) on delete cascade,
	type text not null,
	title text not null,
	body text,
	entity_type text,
	entity_id text,
	deep_link text,
	read_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_notifications_user on rot_notifications(user_id, read_at, created_at desc);
