-- Retiradas / Tentativas: reservas temporarias e exclusivas de bairro.
-- Migration aditiva. Um rollback da aplicacao pode ignorar esta tabela sem perder dados.

create table if not exists tentativas_neighborhood_claims (
  cidade_normalizada text not null,
  bairro_grupo text not null,
  technician_user_id text not null,
  technician_email text,
  technician_name text,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (cidade_normalizada, bairro_grupo),
  constraint tentativas_neighborhood_claims_max_24h_chk
    check (expires_at > requested_at and expires_at <= requested_at + interval '24 hours')
);

create index if not exists tentativas_neighborhood_claims_expires_idx
  on tentativas_neighborhood_claims (expires_at);

create index if not exists tentativas_neighborhood_claims_technician_idx
  on tentativas_neighborhood_claims (technician_user_id, expires_at desc);
