update app_users
set mfa_enabled = false,
    mfa_method = 'email',
    totp_secret = null,
    totp_enabled_at = null
where lower(trim(role)) = 'tecnico';

delete from email_mfa_challenges
where uid in (
  select uid
  from app_users
  where lower(trim(role)) = 'tecnico'
);
