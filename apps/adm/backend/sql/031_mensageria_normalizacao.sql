create extension if not exists pgcrypto;

create table if not exists mensageria_templates (
  id text primary key,
  nome text,
  conteudo text,
  situacao text,
  required_central_button boolean not null default false,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists mensageria_templates_situacao_idx
  on mensageria_templates (situacao);

create table if not exists mensageria_fila (
  id text primary key,
  codigo_cliente text,
  cliente text,
  telefone text,
  telefone_digits text,
  os text,
  contrato text,
  cidade text,
  regional text,
  endereco text,
  status text,
  template_id text references mensageria_templates(id) on update cascade on delete set null,
  origem text,
  origem_tipo text,
  status_os text,
  tentativas integer not null default 0,
  ultimo_erro text,
  ultimo_envio_em timestamptz,
  prioridade_em timestamptz,
  envio_lock_id text,
  envio_lock_em timestamptz,
  criado_por text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists mensageria_fila_status_prioridade_idx
  on mensageria_fila (status, prioridade_em);

create index if not exists mensageria_fila_telefone_digits_idx
  on mensageria_fila (telefone_digits);

create index if not exists mensageria_fila_codigo_cliente_idx
  on mensageria_fila (codigo_cliente);

create index if not exists mensageria_fila_os_idx
  on mensageria_fila (os);

create index if not exists mensageria_fila_regional_idx
  on mensageria_fila (regional);

create index if not exists mensageria_fila_criado_em_idx
  on mensageria_fila (criado_em desc);

create index if not exists mensageria_fila_lock_idx
  on mensageria_fila (envio_lock_id, envio_lock_em)
  where envio_lock_id is not null and envio_lock_id <> '';

create unique index if not exists mensageria_fila_open_dedup_idx
  on mensageria_fila (telefone_digits, os, coalesce(template_id, ''), status)
  where telefone_digits is not null
    and telefone_digits <> ''
    and os is not null
    and os <> ''
    and coalesce(status, '') not in (
      'enviado',
      'agendado',
      'cancelado',
      'concluido',
      'concluído',
      'descartado',
      'ignorado'
    );

create table if not exists mensageria_historico (
  id text primary key,
  fila_id text references mensageria_fila(id) on update cascade on delete set null,
  codigo_cliente text,
  cliente text,
  telefone text,
  cidade text,
  os text,
  direction text,
  mensagem text,
  provider text,
  provider_status text,
  status text,
  erro text,
  payload jsonb,
  criado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists mensageria_historico_telefone_idx
  on mensageria_historico (telefone);

create index if not exists mensageria_historico_fila_id_idx
  on mensageria_historico (fila_id);

create index if not exists mensageria_historico_criado_em_idx
  on mensageria_historico (criado_em desc);

create table if not exists mensageria_callbacks (
  id text primary key,
  agendamento_id text,
  codigo_cliente text,
  cliente text,
  telefone text,
  os text,
  mensagem text,
  motivo text,
  agendado boolean,
  resposta_automatica text,
  payload jsonb,
  recebido_em timestamptz,
  criado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists mensageria_callbacks_telefone_idx
  on mensageria_callbacks (telefone);

create index if not exists mensageria_callbacks_recebido_em_idx
  on mensageria_callbacks (recebido_em desc);

create index if not exists mensageria_callbacks_criado_em_idx
  on mensageria_callbacks (criado_em desc);

create table if not exists mensageria_agendamento_conversas (
  id text primary key,
  telefone text,
  telefone_digits text,
  codigo_cliente text,
  cliente text,
  os text,
  contrato text,
  cidade text,
  regional text,
  stage text,
  agendamento_id text,
  selected_date date,
  selected_time text,
  started_at timestamptz,
  completed_at timestamptz,
  last_message_at timestamptz,
  atualizado_em timestamptz,
  item_payload jsonb,
  schedule_payload jsonb,
  date_options jsonb,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists mensageria_agendamento_conversas_telefone_digits_idx
  on mensageria_agendamento_conversas (telefone_digits);

create index if not exists mensageria_agendamento_conversas_stage_idx
  on mensageria_agendamento_conversas (stage);

create index if not exists mensageria_agendamento_conversas_last_message_at_idx
  on mensageria_agendamento_conversas (last_message_at desc);

create table if not exists mensageria_config (
  id text primary key default 'global',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  source_payload jsonb
);

drop trigger if exists mensageria_templates_touch_updated_at on mensageria_templates;
create trigger mensageria_templates_touch_updated_at
before update on mensageria_templates
for each row execute function touch_updated_at();

drop trigger if exists mensageria_fila_touch_updated_at on mensageria_fila;
create trigger mensageria_fila_touch_updated_at
before update on mensageria_fila
for each row execute function touch_updated_at();

drop trigger if exists mensageria_historico_touch_updated_at on mensageria_historico;
create trigger mensageria_historico_touch_updated_at
before update on mensageria_historico
for each row execute function touch_updated_at();

drop trigger if exists mensageria_callbacks_touch_updated_at on mensageria_callbacks;
create trigger mensageria_callbacks_touch_updated_at
before update on mensageria_callbacks
for each row execute function touch_updated_at();

drop trigger if exists mensageria_agendamento_conversas_touch_updated_at on mensageria_agendamento_conversas;
create trigger mensageria_agendamento_conversas_touch_updated_at
before update on mensageria_agendamento_conversas
for each row execute function touch_updated_at();
