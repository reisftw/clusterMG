create table if not exists ordens_servico (
  id text primary key,
  source_collection text not null,
  source text,
  num_os text,
  codigo_cliente text,
  nome_cliente text,
  telefone text,
  telefones text[],
  empresa text,
  tipo text,
  status text,
  servico text,
  tecnico text,
  cidade text,
  regional text,
  endereco text,
  endereco_resumo text,
  bairro text,
  numero text,
  latitude numeric,
  longitude numeric,
  coordenadas text,
  data_abertura timestamptz,
  data_cadastro timestamptz,
  mac_addr text,
  phy_addr text,
  macs_equipamento jsonb,
  agente boolean,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create unique index if not exists ordens_servico_collection_source_os_idx
  on ordens_servico (source_collection, source, num_os)
  where num_os is not null and num_os <> '';

create index if not exists ordens_servico_num_os_idx on ordens_servico (num_os);
create index if not exists ordens_servico_codigo_cliente_idx on ordens_servico (codigo_cliente);
create index if not exists ordens_servico_status_idx on ordens_servico (status);
create index if not exists ordens_servico_tipo_idx on ordens_servico (tipo);
create index if not exists ordens_servico_regional_idx on ordens_servico (regional);
create index if not exists ordens_servico_cidade_idx on ordens_servico (cidade);
create index if not exists ordens_servico_data_abertura_idx on ordens_servico (data_abertura);
create index if not exists ordens_servico_source_idx on ordens_servico (source);
create index if not exists ordens_servico_collection_idx on ordens_servico (source_collection);

create table if not exists ordens_match_relacionamentos (
  id text primary key,
  source_collection text not null default 'match_os_abertas',
  ordem_principal_id text references ordens_servico(id) on update cascade on delete cascade,
  ordem_relacionada_id text references ordens_servico(id) on update cascade on delete cascade,
  cidade text,
  distance_meters numeric,
  same_street boolean,
  payload jsonb,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists ordens_match_principal_idx
  on ordens_match_relacionamentos (ordem_principal_id);
create index if not exists ordens_match_relacionada_idx
  on ordens_match_relacionamentos (ordem_relacionada_id);
create index if not exists ordens_match_cidade_idx
  on ordens_match_relacionamentos (cidade);

create table if not exists ordens_import_runs (
  id text primary key,
  tipo text,
  fonte text,
  source_collection text,
  periodo_inicio date,
  periodo_fim date,
  total_os int not null default 0,
  removidas int not null default 0,
  ignoradas int not null default 0,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb,
  source_payload jsonb
);

create index if not exists ordens_import_runs_tipo_idx on ordens_import_runs (tipo);
create index if not exists ordens_import_runs_fonte_idx on ordens_import_runs (fonte);
create index if not exists ordens_import_runs_created_idx on ordens_import_runs (created_at desc);
