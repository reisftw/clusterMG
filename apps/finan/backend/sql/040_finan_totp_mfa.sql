alter table if exists finan_users
	add column if not exists mfa_method text not null default 'email',
	add column if not exists totp_secret text,
	add column if not exists totp_enabled_at timestamptz;

update finan_users
set mfa_method = 'email'
where mfa_method is null or mfa_method not in ('email', 'totp');

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'finan_users_mfa_method_check'
	) then
		alter table finan_users
			add constraint finan_users_mfa_method_check
			check (mfa_method in ('email', 'totp'));
	end if;
end $$;
