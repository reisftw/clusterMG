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

create table if not exists tentativas_neighborhood_claim_requests (
  id text primary key,
  cidade text not null,
  cidade_normalizada text not null,
  bairro_grupo text not null,
  bairro_nome text not null,
  requester_user_id text not null,
  requester_email text,
  requester_name text not null,
  current_owner_user_id text,
  current_owner_name text,
  requested_hours integer not null,
  status text not null default 'PENDING',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_id text,
  reviewed_by_name text,
  resolution_note text,
  constraint tentativas_neighborhood_claim_requests_hours_chk
    check (requested_hours between 1 and 24),
  constraint tentativas_neighborhood_claim_requests_status_chk
    check (status in ('PENDING', 'APPROVED', 'REJECTED'))
);

create unique index if not exists tentativas_neighborhood_claim_requests_pending_idx
  on tentativas_neighborhood_claim_requests (cidade_normalizada, bairro_grupo)
  where status = 'PENDING';

create index if not exists tentativas_neighborhood_claim_requests_status_idx
  on tentativas_neighborhood_claim_requests (status, requested_at desc);

create index if not exists tentativas_neighborhood_claim_requests_requester_idx
  on tentativas_neighborhood_claim_requests (requester_user_id, requested_at desc);
