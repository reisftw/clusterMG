alter table if exists finan_users
	add column if not exists avatar_url text;

alter table if exists finan_roles
	add column if not exists system_role boolean not null default false,
	add column if not exists active boolean not null default true;

update finan_users
set mfa_enabled = true,
	updated_at = now()
where mfa_enabled = false;
