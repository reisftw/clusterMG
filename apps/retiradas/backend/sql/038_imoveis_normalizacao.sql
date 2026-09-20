create table if not exists imoveis (
  id text primary key,
  senior_id text unique,
  nome text,
  base text,
  ativo boolean not null default true,
  situacao text,
  tipo_contrato text,
  classificacao text,
  endereco text,
  cidade text,
  estado text,
  bairro text,
  cep text,
  rua text,
  numero text,
  cnpj_cpf text,
  diretoria text,
  valor_aluguel numeric not null default 0,
  valor_original numeric not null default 0,
  valor_m2 numeric not null default 0,
  metros_quadrados numeric not null default 0,
  vencimento_aluguel_dia int,
  contrato_inicio date,
  contrato_fim date,
  mes_reajuste int,
  data_ultimo_reajuste date,
  encerramento date,
  data_inativacao date,
  motivo_inativacao text,
  observacao text,
  drive_root_folder_id text,
  drive_folder_id text,
  drive_folder_name text,
  maps_url text,
  street_view_url text,
  created_by text,
  updated_by text,
  created_by_name text,
  updated_by_name text,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists imoveis_ativo_idx on imoveis (ativo);
create index if not exists imoveis_cidade_idx on imoveis (cidade);
create index if not exists imoveis_base_idx on imoveis (base);
create index if not exists imoveis_tipo_contrato_idx on imoveis (tipo_contrato);
create index if not exists imoveis_contrato_fim_idx on imoveis (contrato_fim);

create table if not exists imoveis_anexos (
  id text primary key,
  imovel_id text references imoveis(id) on update cascade on delete cascade,
  source_collection text not null default 'imoveis_administrativos_anexos',
  tipo text,
  categoria text,
  nome text,
  url text,
  drive_file_id text,
  drive_folder_id text,
  mime_type text,
  tamanho numeric,
  observacao text,
  data date,
  created_by text,
  created_by_name text,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists imoveis_anexos_imovel_idx on imoveis_anexos (imovel_id);
create index if not exists imoveis_anexos_collection_idx on imoveis_anexos (source_collection);
create index if not exists imoveis_anexos_created_idx on imoveis_anexos (created_at desc);

create table if not exists imoveis_eventos_financeiros (
  id text primary key,
  imovel_id text references imoveis(id) on update cascade on delete cascade,
  source_collection text not null,
  tipo text,
  competencia text,
  ano int,
  mes int,
  valor numeric not null default 0,
  valor_anterior numeric,
  valor_novo numeric,
  vencimento date,
  data date,
  pago boolean,
  descricao text,
  observacao text,
  anexo_id text,
  drive_file_id text,
  payload jsonb,
  created_by text,
  created_by_name text,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists imoveis_eventos_imovel_idx on imoveis_eventos_financeiros (imovel_id);
create index if not exists imoveis_eventos_collection_idx on imoveis_eventos_financeiros (source_collection);
create index if not exists imoveis_eventos_tipo_idx on imoveis_eventos_financeiros (tipo);
create index if not exists imoveis_eventos_data_idx on imoveis_eventos_financeiros (data desc);
create index if not exists imoveis_eventos_competencia_idx on imoveis_eventos_financeiros (ano, mes);

create table if not exists imoveis_config (
  id text primary key default 'geral',
  data jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_by_name text,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);
