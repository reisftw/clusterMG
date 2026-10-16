alter table app_users
  add column if not exists mfa_enabled boolean not null default true;

update app_users
   set mfa_enabled = true
 where mfa_enabled is null;
