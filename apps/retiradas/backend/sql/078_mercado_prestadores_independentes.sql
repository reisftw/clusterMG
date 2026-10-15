create table if not exists mercado_prestadores (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa text not null check (tipo_pessoa in ('PF','PJ')),
  nome_exibicao text not null,
  razao_social text,
  nome_fantasia text,
  responsavel_nome text,
  cpf_cnpj text not null,
  cpf_cnpj_normalizado text not null unique,
  email text not null,
  email_normalizado text not null unique,
  telefone text not null,
  status_cadastro text not null default 'EMAIL_PENDENTE' check (status_cadastro in ('CADASTRO_INICIADO','EMAIL_PENDENTE','CADASTRO_COMPLETO','EM_ANALISE','REPROVADO')),
  status_habilitacao text not null default 'PENDENTE' check (status_habilitacao in ('PENDENTE','HABILITADO','REPROVADO','SUSPENSO')),
  termos_aceitos_em timestamptz not null,
  privacidade_aceita_em timestamptz not null,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mercado_prestador_cidades (
  prestador_id uuid not null references mercado_prestadores(id) on delete cascade,
  codigo_ibge text not null,
  nome text not null,
  created_at timestamptz not null default now(),
  primary key (prestador_id, codigo_ibge)
);

alter table mercado_accounts add column if not exists prestador_id uuid references mercado_prestadores(id) on delete cascade;
alter table mercado_accounts add column if not exists email_verified_at timestamptz;
create unique index if not exists mercado_accounts_prestador_unique_idx on mercado_accounts(prestador_id) where prestador_id is not null;

create table if not exists mercado_email_verifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mercado_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table mercado_lotes add column if not exists accepted_by_prestador_id uuid references mercado_prestadores(id);
create index if not exists mercado_lotes_prestador_status_idx on mercado_lotes(accepted_by_prestador_id, status);
alter table mercado_financeiro_apuracoes add column if not exists prestador_id uuid references mercado_prestadores(id);
create index if not exists mercado_financeiro_prestador_idx on mercado_financeiro_apuracoes(prestador_id, competencia);
