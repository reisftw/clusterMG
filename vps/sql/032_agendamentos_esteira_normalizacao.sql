create table if not exists agendamento_esteira_blocos (
  id text primary key,
  document_id_original text,
  filial_id text,
  empresa text,
  cidade text,
  regional text,
  nome text,
  tipo text,
  status text,
  atendente_id text,
  atendente_nome text,
  arquivo text,
  total int not null default 0,
  pendentes int not null default 0,
  agendados int not null default 0,
  retirados int not null default 0,
  multas int not null default 0,
  lojas int not null default 0,
  clientes jsonb,
  iniciado_em timestamptz,
  iniciado_em_local timestamptz,
  finalizado_em timestamptz,
  criado_por_id text,
  criado_por_nome text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists agendamento_esteira_blocos_filial_idx
  on agendamento_esteira_blocos (filial_id);

create index if not exists agendamento_esteira_blocos_status_idx
  on agendamento_esteira_blocos (status);

create index if not exists agendamento_esteira_blocos_cidade_idx
  on agendamento_esteira_blocos (cidade);

create index if not exists agendamento_esteira_blocos_regional_idx
  on agendamento_esteira_blocos (regional);

create table if not exists agendamento_esteira_clientes (
  id text primary key,
  document_id_original text,
  cliente_id_original text,
  bloco_id text references agendamento_esteira_blocos(id) on update cascade on delete set null,
  bloco_document_id_original text,
  codigo_cliente text,
  nome text,
  cidade text,
  regional text,
  filial_id text,
  empresa text,
  status text,
  ordem int,
  telefones jsonb,
  tentativas int not null default 0,
  terminal_at timestamptz,
  privacy_expires_at timestamptz,
  agendamento_id text,
  origem_agendamento_id text,
  reagendamento_numero int,
  motivo_nao_recolhimento text,
  data_retirada date,
  equipamento_retirado boolean,
  retirado_por_id text,
  retirado_por_nome text,
  entrega_loja boolean,
  entrega_loja_comentario text,
  entrega_loja_data date,
  entrega_loja_por_id text,
  entrega_loja_por_nome text,
  entrega_loja_registrada_em_local timestamptz,
  criado_em timestamptz,
  atualizado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists agendamento_esteira_clientes_bloco_idx
  on agendamento_esteira_clientes (bloco_id);

create index if not exists agendamento_esteira_clientes_codigo_cliente_idx
  on agendamento_esteira_clientes (codigo_cliente);

create index if not exists agendamento_esteira_clientes_filial_idx
  on agendamento_esteira_clientes (filial_id);

create index if not exists agendamento_esteira_clientes_status_idx
  on agendamento_esteira_clientes (status);

create index if not exists agendamento_esteira_clientes_regional_idx
  on agendamento_esteira_clientes (regional);

create table if not exists agendamento_esteira_cliente_index (
  id text primary key,
  document_id_original text,
  bloco_id text references agendamento_esteira_blocos(id) on update cascade on delete set null,
  bloco_document_id_original text,
  codigo_cliente text,
  filial_id text,
  status text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists agendamento_esteira_cliente_index_bloco_idx
  on agendamento_esteira_cliente_index (bloco_id);

create index if not exists agendamento_esteira_cliente_index_codigo_cliente_idx
  on agendamento_esteira_cliente_index (codigo_cliente);

create index if not exists agendamento_esteira_cliente_index_filial_idx
  on agendamento_esteira_cliente_index (filial_id);

create index if not exists agendamento_esteira_cliente_index_status_idx
  on agendamento_esteira_cliente_index (status);

create table if not exists agendamentos (
  id text primary key,
  document_id_original text,
  codigo_cliente text,
  cliente_nome text,
  telefone text,
  telefones jsonb,
  cidade text,
  regional text,
  empresa text,
  data date,
  hora time,
  turno text,
  status text,
  tecnico_nome text,
  observacao text,
  origem text,
  os text,
  filial_id text,
  bloco_id text references agendamento_esteira_blocos(id) on update cascade on delete set null,
  bloco_document_id_original text,
  atendente_id text,
  atendente_nome text,
  usuario_id text,
  usuario_nome text,
  criado_por_id text,
  criado_por_nome text,
  agendado_por_id text,
  agendado_por_nome text,
  atualizado_por_id text,
  atualizado_por_nome text,
  recolhido_em timestamptz,
  motivo_recolhido text,
  nao_recolhido_em timestamptz,
  motivo_nao_recolhido text,
  desfecho_em timestamptz,
  desfecho_por_id text,
  desfecho_por_nome text,
  equipamento_retirado boolean,
  motivo_nao_recolhimento text,
  bloco_reagendamento_id text,
  reagendamento_numero int,
  enviado_reagendamento boolean,
  mercado_compra_id text,
  mercado_compra_status text,
  mercado_comprado_em timestamptz,
  mercado_empresa_id text,
  mercado_empresa_nome text,
  verificacao_mapa jsonb,
  criado_em timestamptz,
  atualizado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists agendamentos_data_status_idx
  on agendamentos (data, status);

create index if not exists agendamentos_codigo_cliente_idx
  on agendamentos (codigo_cliente);

create index if not exists agendamentos_cidade_idx
  on agendamentos (cidade);

create index if not exists agendamentos_regional_idx
  on agendamentos (regional);

create index if not exists agendamentos_os_idx
  on agendamentos (os);

create index if not exists agendamentos_bloco_idx
  on agendamentos (bloco_id);

create table if not exists agendamentos_logs (
  id text primary key,
  document_id_original text,
  tipo text,
  agendamento_id text references agendamentos(id) on update cascade on delete set null,
  agendamento_document_id_original text,
  codigo_cliente text,
  cliente_nome text,
  cidade text,
  data_agendamento date,
  hora time,
  origem text,
  criterio text,
  resultado text,
  status_anterior text,
  status_novo text,
  motivo text,
  os_encontrada text,
  criado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists agendamentos_logs_agendamento_idx
  on agendamentos_logs (agendamento_id);

create index if not exists agendamentos_logs_criado_em_idx
  on agendamentos_logs (criado_em desc);

create table if not exists agendamento_esteira_logs (
  id text primary key,
  document_id_original text,
  tipo text,
  filial_id text,
  request_id text,
  usuario_id text,
  usuario_nome text,
  usuario_role text,
  arquivo text,
  bloco_id text references agendamento_esteira_blocos(id) on update cascade on delete set null,
  bloco_document_id_original text,
  cliente_id text references agendamento_esteira_clientes(id) on update cascade on delete set null,
  cliente_document_id_original text,
  agendamento_id text references agendamentos(id) on update cascade on delete set null,
  agendamento_document_id_original text,
  codigo_cliente text,
  cliente_nome text,
  cidade text,
  regional text,
  empresa text,
  data date,
  hora time,
  turno text,
  tentativa int,
  quantidade_blocos int,
  quantidade_clientes int,
  quantidade_ignorados int,
  clientes_total int,
  agendados int,
  recolhidos int,
  retirados int,
  multas int,
  lojas int,
  nao_recolhidos int,
  entregas_loja int,
  motivo text,
  comentario text,
  payload jsonb,
  criado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists agendamento_esteira_logs_tipo_idx
  on agendamento_esteira_logs (tipo);

create index if not exists agendamento_esteira_logs_filial_idx
  on agendamento_esteira_logs (filial_id);

create index if not exists agendamento_esteira_logs_request_idx
  on agendamento_esteira_logs (request_id);

create index if not exists agendamento_esteira_logs_criado_em_idx
  on agendamento_esteira_logs (criado_em desc);

create table if not exists agendamento_esteira_metricas (
  mes text primary key,
  agendamentos int not null default 0,
  recolhidos int not null default 0,
  recolhidos_diretos int not null default 0,
  nao_recolhidos int not null default 0,
  tentativas int not null default 0,
  multas int not null default 0,
  entregas_loja int not null default 0,
  cidades jsonb,
  usuarios jsonb,
  agendamentos_por_cidade jsonb,
  agendamentos_por_usuario jsonb,
  recolhidos_por_cidade jsonb,
  tentativas_por_cidade jsonb,
  tentativas_por_usuario jsonb,
  multas_por_usuario jsonb,
  nao_recolhidos_por_cidade jsonb,
  entregas_loja_por_cidade jsonb,
  entregas_loja_por_usuario jsonb,
  atualizado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create index if not exists agendamento_esteira_metricas_atualizado_em_idx
  on agendamento_esteira_metricas (atualizado_em desc);

create table if not exists agendamento_esteira_catalogo (
  id text primary key,
  document_id_original text,
  blocos jsonb,
  atualizado_em timestamptz,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

drop trigger if exists agendamento_esteira_blocos_touch_updated_at on agendamento_esteira_blocos;
create trigger agendamento_esteira_blocos_touch_updated_at
before update on agendamento_esteira_blocos
for each row execute function touch_updated_at();

drop trigger if exists agendamento_esteira_clientes_touch_updated_at on agendamento_esteira_clientes;
create trigger agendamento_esteira_clientes_touch_updated_at
before update on agendamento_esteira_clientes
for each row execute function touch_updated_at();

drop trigger if exists agendamento_esteira_cliente_index_touch_updated_at on agendamento_esteira_cliente_index;
create trigger agendamento_esteira_cliente_index_touch_updated_at
before update on agendamento_esteira_cliente_index
for each row execute function touch_updated_at();

drop trigger if exists agendamentos_touch_updated_at on agendamentos;
create trigger agendamentos_touch_updated_at
before update on agendamentos
for each row execute function touch_updated_at();

drop trigger if exists agendamentos_logs_touch_updated_at on agendamentos_logs;
create trigger agendamentos_logs_touch_updated_at
before update on agendamentos_logs
for each row execute function touch_updated_at();

drop trigger if exists agendamento_esteira_logs_touch_updated_at on agendamento_esteira_logs;
create trigger agendamento_esteira_logs_touch_updated_at
before update on agendamento_esteira_logs
for each row execute function touch_updated_at();

drop trigger if exists agendamento_esteira_metricas_touch_updated_at on agendamento_esteira_metricas;
create trigger agendamento_esteira_metricas_touch_updated_at
before update on agendamento_esteira_metricas
for each row execute function touch_updated_at();

drop trigger if exists agendamento_esteira_catalogo_touch_updated_at on agendamento_esteira_catalogo;
create trigger agendamento_esteira_catalogo_touch_updated_at
before update on agendamento_esteira_catalogo
for each row execute function touch_updated_at();
