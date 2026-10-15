-- Mercado V5.1: dados cadastrais, endereço e documentação privada de prestadores.
-- Execute somente na base de homologação após backup e revisão da equipe responsável.

alter table mercado_prestadores
  add column if not exists status_documental text not null default 'NAO_ENVIADO'
    check (status_documental in ('NAO_ENVIADO','PENDENTE_ANALISE','EM_ANALISE','APROVADO','REPROVADO','CORRECAO_SOLICITADA')),
  add column if not exists responsavel_cpf text,
  add column if not exists responsavel_cpf_normalizado text,
  add column if not exists responsavel_email text;

create table if not exists mercado_enderecos (
  id uuid primary key default gen_random_uuid(),
  prestador_id uuid not null references mercado_prestadores(id) on delete cascade,
  tipo_endereco text not null default 'CADASTRAL' check (tipo_endereco in ('CADASTRAL')),
  cep text not null,
  logradouro text not null,
  numero text not null,
  complemento text,
  bairro text not null,
  cidade text not null,
  uf char(2) not null,
  codigo_ibge text,
  origem_consulta text not null default 'MANUAL' check (origem_consulta in ('MANUAL','VIACEP','CEP_BRASIL')),
  confirmado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prestador_id, tipo_endereco)
);

create table if not exists mercado_documentos (
  id uuid primary key default gen_random_uuid(),
  prestador_id uuid not null references mercado_prestadores(id) on delete cascade,
  tipo text not null check (tipo in (
    'DOCUMENTO_FRENTE','DOCUMENTO_VERSO','COMPROVANTE_CNPJ','CONTRATO_SOCIAL','CCMEI','PROCURACAO'
  )),
  armazenamento_chave text not null unique,
  nome_original text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  tamanho_bytes integer not null check (tamanho_bytes > 0),
  sha256 text not null,
  status text not null default 'PENDENTE_ANALISE' check (status in ('PENDENTE_ANALISE','APROVADO','REPROVADO','CORRECAO_SOLICITADA')),
  enviado_em timestamptz not null default now(),
  analisado_em timestamptz,
  analisado_por text,
  observacao_analise text,
  substitui_documento_id uuid references mercado_documentos(id),
  removido_em timestamptz
);
create index if not exists mercado_documentos_prestador_idx on mercado_documentos(prestador_id, tipo) where removido_em is null;

create table if not exists mercado_prestador_analises (
  id uuid primary key default gen_random_uuid(),
  prestador_id uuid not null references mercado_prestadores(id) on delete cascade,
  acao text not null check (acao in ('APROVADO','REPROVADO','CORRECAO_SOLICITADA','DOCUMENTO_ADICIONAL_SOLICITADO','HABILITADO','SUSPENSO')),
  justificativa text,
  criado_por text not null,
  created_at timestamptz not null default now()
);

create table if not exists mercado_documento_acessos (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references mercado_documentos(id) on delete cascade,
  acessado_por text not null,
  finalidade text not null,
  created_at timestamptz not null default now()
);
