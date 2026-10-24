create table if not exists tentativas_neighborhood_locks (
  cidade_normalizada text not null,
  bairro_grupo text not null,
  technician_user_id text not null,
  technician_email text,
  technician_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cidade_normalizada, bairro_grupo)
);

create index if not exists tentativas_neighborhood_locks_technician_idx
  on tentativas_neighborhood_locks (technician_user_id, cidade_normalizada);

