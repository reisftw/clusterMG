-- ROT — e-mail (SMTP configuravel via rot_settings, mesmo padrao de
-- finan_email_logs) + MFA por e-mail no login (mesmo padrao de
-- finan_mfa_challenges). Pedido explicito: cadastro/troca de senha/reset
-- notificados por e-mail e login com MFA, igual o resto do ecossistema.

create table if not exists rot_email_logs (
	id text primary key,
	type text not null default 'system_notice',
	to_email text not null default '',
	subject text not null default '',
	status text not null,
	error_message text not null default '',
	provider_message_id text not null default '',
	meta jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists rot_email_logs_created_at_idx
	on rot_email_logs (created_at desc);

create index if not exists rot_email_logs_status_idx
	on rot_email_logs (status);

create table if not exists rot_mfa_challenges (
	id text primary key,
	user_id text not null references rot_users(id) on delete cascade,
	code_hash text not null,
	channel text not null default 'email',
	attempts integer not null default 0,
	expires_at timestamptz not null,
	consumed_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_mfa_challenges_user on rot_mfa_challenges(user_id);

-- mfa_enabled por usuario (default true, mesma decisao do Finan: MFA por
-- e-mail e o padrao pra todo mundo, nao opt-in por usuario).
alter table if exists rot_users
	add column if not exists mfa_enabled boolean not null default true;
