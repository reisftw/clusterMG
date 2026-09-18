create table if not exists rot_image_attachments (
	id text primary key,
	entidade_tipo text not null check (entidade_tipo in ('APR','ROMPIMENTO')),
	entidade_id text not null,
	storage_key text not null,
	storage_provider text not null,
	mime_type text not null,
	tamanho_bytes integer not null default 0,
	largura integer,
	altura integer,
	nome_original text not null default '',
	status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','FAILED','EXPIRED','REMOVED')),
	enviado_por text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null default (now() + interval '15 minutes'),
	confirmed_at timestamptz,
	removido_em timestamptz
);

create index if not exists idx_rot_image_attachments_entity
	on rot_image_attachments(entidade_tipo, entidade_id, created_at desc);

create unique index if not exists uq_rot_image_attachments_storage_key
	on rot_image_attachments(storage_provider, storage_key)
	where removido_em is null;
