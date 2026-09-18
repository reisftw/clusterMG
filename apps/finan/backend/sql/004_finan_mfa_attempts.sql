alter table if exists finan_mfa_challenges
	add column if not exists attempts integer not null default 0;

update finan_users
set mfa_enabled = true,
	updated_at = now()
where mfa_enabled = false;
