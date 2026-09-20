alter table if exists finan_audit_logs
	add column if not exists user_name text,
	add column if not exists user_email text,
	add column if not exists setor_id text,
	add column if not exists department_id text,
	add column if not exists module text not null default 'finan',
	add column if not exists record_id text,
	add column if not exists ip_address text,
	add column if not exists user_agent text,
	add column if not exists changed_fields jsonb not null default '[]'::jsonb;

create index if not exists finan_audit_logs_created_at_idx
	on finan_audit_logs (created_at desc);

create index if not exists finan_audit_logs_module_idx
	on finan_audit_logs (module);

create table if not exists finan_email_logs (
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

create index if not exists finan_email_logs_created_at_idx
	on finan_email_logs (created_at desc);

create index if not exists finan_email_logs_status_idx
	on finan_email_logs (status);

create index if not exists finan_email_logs_type_idx
	on finan_email_logs (type);
