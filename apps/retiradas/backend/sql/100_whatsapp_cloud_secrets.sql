-- Cofre criptografado para credenciais da WhatsApp Cloud API.
-- Os valores nunca sao armazenados em texto puro nem retornados pela API.

create table if not exists whatsapp_cloud_secrets (
  secret_name text primary key
    check (secret_name in ('META_ACCESS_TOKEN', 'META_APP_SECRET')),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_id text not null,
  updated_by_id text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists whatsapp_cloud_secrets_touch_updated_at
  on whatsapp_cloud_secrets;
create trigger whatsapp_cloud_secrets_touch_updated_at
before update on whatsapp_cloud_secrets
for each row execute function touch_updated_at();

