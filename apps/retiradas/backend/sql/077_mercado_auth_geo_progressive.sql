create extension if not exists pgcrypto;

create table if not exists mercado_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  password_hash text not null,
  password_algorithm text not null default 'argon2id',
  disabled boolean not null default false,
  session_version integer not null default 1,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  mfa_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mercado_accounts_email_unique_idx
  on mercado_accounts(lower(email));

create table if not exists mercado_account_empresas (
  account_id uuid not null references mercado_accounts(id) on delete cascade,
  empresa_id text not null references mercado_empresa_habilitacoes(empresa_id),
  role text not null check (role in ('ADMINISTRADOR','GESTOR','BACKOFFICE','FINANCEIRO','PRESTADOR','AUDITOR')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (account_id, empresa_id)
);

create table if not exists mercado_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mercado_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists mercado_password_resets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mercado_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists mercado_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  empresa_id text not null references mercado_empresa_habilitacoes(empresa_id),
  role text not null check (role in ('ADMINISTRADOR','GESTOR','BACKOFFICE','FINANCEIRO','PRESTADOR','AUDITOR')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table mercado_lote_os add column if not exists ordem_execucao integer;
alter table mercado_lote_os add column if not exists grupo_liberacao integer not null default 1;
alter table mercado_lote_os add column if not exists liberada_em timestamptz;
alter table mercado_lote_os add column if not exists liberada_por text;
create unique index if not exists mercado_lote_os_lote_ordem_execucao_idx on mercado_lote_os(lote_id, ordem_execucao) where ordem_execucao is not null;
create index if not exists mercado_lote_os_liberacao_idx on mercado_lote_os(lote_id, grupo_liberacao, liberada_em);

with ranked as (
  select id, lote_id,
    row_number() over (partition by lote_id order by bairro nulls last, num_os nulls last, id) as ordem,
    ceil(row_number() over (partition by lote_id order by bairro nulls last, num_os nulls last, id) / 3.0)::int as grupo
  from mercado_lote_os
  where ordem_execucao is null
)
update mercado_lote_os os
   set ordem_execucao = ranked.ordem,
       grupo_liberacao = ranked.grupo,
       liberada_em = case when ranked.grupo = 1 then coalesce(os.liberada_em, now()) else os.liberada_em end
  from ranked
 where os.id = ranked.id;

create table if not exists mercado_lote_liberacoes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references mercado_lotes(id) on delete cascade,
  grupo integer not null,
  liberado_em timestamptz not null default now(),
  motivo text not null default 'CONCLUSAO_GRUPO_ANTERIOR',
  created_by_id uuid references mercado_accounts(id) on delete set null,
  unique(lote_id, grupo)
);
