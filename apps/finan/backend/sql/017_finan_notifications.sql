-- Central de notificacoes internas do Finan (mesmo conceito do
-- "system_notifications" do Retiradas, adaptado ao RBAC baseado em
-- permissions/cargos do Finan em vez de regional/empresa).
--
-- target_permissions/target_role_ids/target_user_ids vazios (default
-- '{}') significam "sem restricao naquele campo" — a notificacao fica
-- visivel a todo usuario autenticado quando os tres estao vazios.
-- target_user_ids, quando preenchido, restringe SOMENTE a esses
-- usuarios (mais especifico que os outros dois campos).
create table if not exists finan_notifications (
	id text primary key,
	type text not null default 'geral',
	title text not null,
	message text not null default '',
	severity text not null default 'info', -- info | success | warning | critical
	target_path text not null default '',
	target_permissions text[] not null default '{}',
	target_role_ids text[] not null default '{}',
	target_user_ids text[] not null default '{}',
	read_by jsonb not null default '{}', -- { userId: iso_timestamp }
	meta jsonb not null default '{}',
	dedupe_key text unique,
	created_by_id text,
	created_by_name text,
	created_at timestamptz not null default now()
);

create index if not exists finan_notifications_created_at_idx
	on finan_notifications (created_at desc);

-- Preferencias pessoais de notificacao (som, tipos habilitados, horario
-- silencioso) — uma linha por usuario, mesmo padrao de personalizacao
-- individual que o Retiradas ja tem em "notification_preferences".
create table if not exists finan_notification_preferences (
	user_id text primary key references finan_users(id) on delete cascade,
	sound text not null default 'ping',
	enabled_types jsonb not null default '{}'::jsonb,
	quiet_hours jsonb not null default '{"enabled":false,"start":"22:00","end":"07:00"}'::jsonb,
	updated_at timestamptz not null default now()
);
