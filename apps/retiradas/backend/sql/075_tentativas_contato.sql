create extension if not exists pgcrypto;

create table if not exists tentativas_settings (
  id text primary key default 'global',
  coverage_goal numeric not null default 90,
  min_interval_hours integer not null default 12,
  max_attempts integer not null default 3,
  default_campaign_size integer not null default 30,
  allowed_start_time text not null default '08:00',
  allowed_end_time text not null default '18:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into tentativas_settings (id)
values ('global')
on conflict (id) do nothing;

create table if not exists tentativas_templates (
  id text primary key,
  name text not null,
  body text not null,
  attempt_number integer not null default 1,
  active boolean not null default true,
  is_default boolean not null default false,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tentativas_templates_default_attempt_idx
  on tentativas_templates (attempt_number)
  where active = true and is_default = true;

insert into tentativas_templates (
  id, name, body, attempt_number, active, is_default
) values
  (
    'tentativas_template_primeira',
    'Primeira tentativa',
    'Olá, {{primeiro_nome}}! Tudo bem? Sou {{tecnico}}, da equipe responsável pela retirada de equipamentos da {{empresa}}. Estou entrando em contato para combinarmos a retirada dos equipamentos referentes à O.S. {{os}} em {{cidade}}. Podemos realizar a retirada hoje?',
    1,
    true,
    true
  ),
  (
    'tentativas_template_retorno',
    'Retorno de contato',
    'Olá, {{primeiro_nome}}. Tentamos contato anteriormente referente à retirada dos equipamentos da {{empresa}} na O.S. {{os}}. Gostaríamos de combinar o melhor horário para realizarmos a retirada. Quando podemos passar?',
    2,
    true,
    true
  )
on conflict (id) do nothing;

create table if not exists tentativas_opportunities (
  id text primary key,
  ordem_id text references ordens_servico(id) on update cascade on delete set null,
  os text not null,
  codigo_cliente text,
  cliente text,
  telefone text,
  telefone_digits text,
  cidade text,
  cidade_normalizada text,
  regional text,
  empresa text,
  tipo_os text,
  origem text not null default 'match',
  match_entered_at timestamptz,
  os_opened_at timestamptz,
  os_age_days integer not null default 0,
  status text not null default 'PENDING',
  priority text not null default 'MEDIA',
  active boolean not null default true,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  last_result text,
  next_attempt_at timestamptz,
  responded_at timestamptz,
  scheduled_at timestamptz,
  completed_at timestamptz,
  removed_from_match_at timestamptz,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tentativas_opportunities_os_idx
  on tentativas_opportunities (os);
create index if not exists tentativas_opportunities_city_status_idx
  on tentativas_opportunities (cidade_normalizada, active, status);
create index if not exists tentativas_opportunities_phone_idx
  on tentativas_opportunities (telefone_digits);
create index if not exists tentativas_opportunities_priority_idx
  on tentativas_opportunities (priority, os_opened_at desc);
create index if not exists tentativas_opportunities_next_attempt_idx
  on tentativas_opportunities (next_attempt_at);

create table if not exists tentativas_technician_cities (
  id text primary key,
  user_id text,
  user_email text,
  user_name text,
  cidade text not null,
  cidade_normalizada text not null,
  valid_from date,
  valid_until date,
  permanent boolean not null default true,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tentativas_technician_cities_active_idx
  on tentativas_technician_cities (coalesce(user_id, ''), lower(coalesce(user_email, '')), cidade_normalizada, coalesce(valid_from, date '1900-01-01'), coalesce(valid_until, date '2999-12-31'))
  where active = true;
create index if not exists tentativas_technician_cities_city_idx
  on tentativas_technician_cities (cidade_normalizada, active);

create table if not exists tentativas_campaigns (
  id text primary key,
  name text not null,
  cidade text,
  cidade_normalizada text,
  technician_user_id text,
  technician_name text,
  origem text not null default 'match',
  quantity integer not null default 0,
  status text not null default 'ACTIVE',
  criteria jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tentativas_campaigns_status_idx
  on tentativas_campaigns (status, created_at desc);

create table if not exists tentativas_assignments (
  id text primary key,
  opportunity_id text not null references tentativas_opportunities(id) on update cascade on delete cascade,
  technician_user_id text,
  technician_email text,
  technician_name text,
  cidade text,
  campaign_id text references tentativas_campaigns(id) on update cascade on delete set null,
  assigned_by text,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tentativas_assignments_active_opportunity_idx
  on tentativas_assignments (opportunity_id)
  where released_at is null;
create index if not exists tentativas_assignments_technician_idx
  on tentativas_assignments (technician_user_id, released_at);
create index if not exists tentativas_assignments_city_idx
  on tentativas_assignments (cidade, released_at);

create table if not exists tentativas_contacts (
  id text primary key,
  opportunity_id text not null references tentativas_opportunities(id) on update cascade on delete cascade,
  assignment_id text references tentativas_assignments(id) on update cascade on delete set null,
  technician_user_id text,
  technician_name text,
  phone text,
  phone_digits text,
  channel text not null default 'WHATSAPP',
  event_type text not null default 'WHATSAPP_OPENED',
  attempt_number integer not null default 1,
  template_id text references tentativas_templates(id) on update cascade on delete set null,
  message text,
  whatsapp_url text,
  sent_confirmed boolean,
  result text,
  status text not null default 'OPENED',
  observation text,
  opened_at timestamptz not null default now(),
  confirmed_at timestamptz,
  next_attempt_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tentativas_contacts_opportunity_idx
  on tentativas_contacts (opportunity_id, created_at desc);
create index if not exists tentativas_contacts_technician_idx
  on tentativas_contacts (technician_user_id, created_at desc);
create index if not exists tentativas_contacts_result_idx
  on tentativas_contacts (result, created_at desc);

create table if not exists tentativas_campaign_items (
  id text primary key,
  campaign_id text not null references tentativas_campaigns(id) on update cascade on delete cascade,
  opportunity_id text not null references tentativas_opportunities(id) on update cascade on delete cascade,
  assignment_id text references tentativas_assignments(id) on update cascade on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists tentativas_campaign_items_unique_idx
  on tentativas_campaign_items (campaign_id, opportunity_id);

with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('tentativas.visualizar', 'tentativas', 'Tentativas', 'minha_rota', 'Minha Rota', 'view', 760, null, 'Visualizar oportunidades e rota de tentativas.'),
    ('tentativas.executar', 'tentativas', 'Tentativas', 'minha_rota', 'Executar Tentativas', 'manage', 761, null, 'Abrir WhatsApp e registrar resultado de tentativa.'),
    ('tentativas.historico.visualizar', 'tentativas', 'Tentativas', 'historico', 'Histórico', 'view', 762, null, 'Visualizar histórico de tentativas.'),
    ('tentativas.distribuir', 'tentativas', 'Tentativas', 'distribuicao', 'Distribuição', 'manage', 763, null, 'Distribuir, transferir e liberar oportunidades.'),
    ('tentativas.campanhas.gerenciar', 'tentativas', 'Tentativas', 'campanhas', 'Campanhas', 'manage', 764, null, 'Criar e encerrar campanhas de tentativas.'),
    ('tentativas.templates.gerenciar', 'tentativas', 'Tentativas', 'templates', 'Templates', 'manage', 765, null, 'Criar e editar templates de contato.'),
    ('tentativas.configuracoes.gerenciar', 'tentativas', 'Tentativas', 'configuracoes', 'Configurações', 'manage', 766, null, 'Gerenciar metas e políticas de tentativas.'),
    ('tentativas.relatorio.exportar', 'tentativas', 'Tentativas', 'relatorios', 'Exportação', 'export', 767, null, 'Exportar relatórios CSV de tentativas.'),
    ('tentativas.override', 'tentativas', 'Tentativas', 'override', 'Override', 'manage', 768, null, 'Ignorar intervalo mínimo com auditoria.')
)
insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label, action,
  sort_order, legacy_permission, description, active, deprecated
)
select id, section_id, section_label, feature_id, feature_label, action,
       sort_order, legacy_permission, description, true, false
from permissions
on conflict (id) do update set
  section_id = excluded.section_id,
  section_label = excluded.section_label,
  feature_id = excluded.feature_id,
  feature_label = excluded.feature_label,
  action = excluded.action,
  sort_order = excluded.sort_order,
  legacy_permission = excluded.legacy_permission,
  description = excluded.description,
  active = true,
  deprecated = false;

insert into app_role_permissions (role_id, permission)
select role_id, permission
from (
  values
    ('admin', '*'),
    ('supervisor', 'tentativas.visualizar'),
    ('supervisor', 'tentativas.executar'),
    ('supervisor', 'tentativas.historico.visualizar'),
    ('supervisor', 'tentativas.distribuir'),
    ('supervisor', 'tentativas.campanhas.gerenciar'),
    ('supervisor', 'tentativas.templates.gerenciar'),
    ('supervisor', 'tentativas.configuracoes.gerenciar'),
    ('supervisor', 'tentativas.relatorio.exportar'),
    ('supervisor', 'tentativas.override'),
    ('backoffice_retirada', 'tentativas.visualizar'),
    ('backoffice_retirada', 'tentativas.executar'),
    ('backoffice_retirada', 'tentativas.historico.visualizar'),
    ('backoffice_retirada', 'tentativas.distribuir'),
    ('backoffice_retirada', 'tentativas.campanhas.gerenciar'),
    ('backoffice_retirada', 'tentativas.templates.gerenciar'),
    ('backoffice_retirada', 'tentativas.configuracoes.gerenciar'),
    ('backoffice_retirada', 'tentativas.relatorio.exportar'),
    ('backoffice', 'tentativas.visualizar'),
    ('backoffice', 'tentativas.executar'),
    ('backoffice', 'tentativas.historico.visualizar'),
    ('lider_empresa', 'tentativas.visualizar'),
    ('lider_empresa', 'tentativas.executar'),
    ('agente_autorizado', 'tentativas.visualizar'),
    ('agente_autorizado', 'tentativas.executar')
) as seed(role_id, permission)
where exists (select 1 from app_roles where app_roles.id = seed.role_id)
on conflict (role_id, permission) do nothing;
