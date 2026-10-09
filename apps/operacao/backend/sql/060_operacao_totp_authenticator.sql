alter table if exists rot_users
	add column if not exists mfa_method text not null default 'email',
	add column if not exists totp_secret text,
	add column if not exists totp_enabled_at timestamptz;

update rot_users
set mfa_method = 'totp'
where totp_secret is not null
	and totp_secret <> ''
	and mfa_method <> 'totp';

create index if not exists idx_rot_users_mfa_method
	on rot_users (mfa_method);
