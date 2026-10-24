-- Central inteligente de tentativas e recuperacao de equipamentos.
-- Migration aditiva e idempotente. Nao remove nem reescreve dados historicos.

alter table tentativas_settings
  add column if not exists contact_dedupe_hours integer not null default 12,
  add column if not exists callback_grace_minutes integer not null default 30,
  add column if not exists score_weights jsonb not null default '{"osAge":25,"equipment":20,"attemptHistory":15,"responseHistory":15,"pendingCallback":15,"timeWithoutContact":10}'::jsonb,
  add column if not exists alert_thresholds jsonb not null default '{"staleWalletHours":24,"overdueCallbacks":5,"invalidPhonePercent":20,"highPriorityWithoutContact":10}'::jsonb,
  add column if not exists result_options jsonb not null default '[]'::jsonb,
  add column if not exists duplicate_policy text not null default 'WARN',
  add column if not exists version integer not null default 1,
  add column if not exists updated_by text;

alter table tentativas_templates
  add column if not exists version integer not null default 1;

alter table tentativas_opportunities
  add column if not exists bairro text,
  add column if not exists equipment_count integer not null default 1,
  add column if not exists estimated_value numeric(14,2),
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists priority_score numeric(8,2) not null default 0,
  add column if not exists priority_factors jsonb not null default '[]'::jsonb,
  add column if not exists recommended_action text,
  add column if not exists contact_restricted boolean not null default false,
  add column if not exists contact_restriction_reason text,
  add column if not exists service_status text,
  add column if not exists last_scored_at timestamptz;

alter table tentativas_contacts
  add column if not exists contact_state text not null default 'STARTED',
  add column if not exists effective_contact boolean not null default false,
  add column if not exists declared_sent_at timestamptz,
  add column if not exists response_at timestamptz,
  add column if not exists correction_reason text,
  add column if not exists corrected_by text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists tentativas_settings_versions (
  id text primary key,
  settings_id text not null default 'global',
  version integer not null,
  snapshot jsonb not null,
  changed_by text,
  change_reason text,
  created_at timestamptz not null default now(),
  unique (settings_id, version)
);

create table if not exists tentativas_template_versions (
  id text primary key,
  template_id text not null references tentativas_templates(id) on update cascade on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  changed_by text,
  change_reason text,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create table if not exists tentativas_callbacks (
  id text primary key,
  opportunity_id text not null references tentativas_opportunities(id) on update cascade on delete cascade,
  contact_id text references tentativas_contacts(id) on update cascade on delete set null,
  technician_user_id text,
  technician_email text,
  technician_name text,
  scheduled_at timestamptz not null,
  preferred_channel text not null default 'WHATSAPP',
  observation text,
  status text not null default 'PENDING',
  completed_at timestamptz,
  completed_by text,
  transferred_from text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tentativas_recoveries (
  id text primary key,
  opportunity_id text not null references tentativas_opportunities(id) on update cascade on delete cascade,
  contact_id text references tentativas_contacts(id) on update cascade on delete set null,
  modality text not null,
  status text not null default 'AWAITING_DEFINITION',
  scheduled_at timestamptz,
  service_window text,
  store_commitment_at timestamptz,
  validation_source text,
  evidence_reference text,
  validated_at timestamptz,
  validated_by text,
  observation text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tentativas_recovery_equipments (
  id text primary key,
  recovery_id text not null references tentativas_recoveries(id) on update cascade on delete cascade,
  equipment_type text,
  mac_serial text,
  quantity integer not null default 1,
  status text not null default 'PENDING',
  stock_movement_id text,
  evidence_reference text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tentativas_events (
  id text primary key,
  opportunity_id text not null references tentativas_opportunities(id) on update cascade on delete cascade,
  assignment_id text references tentativas_assignments(id) on update cascade on delete set null,
  contact_id text references tentativas_contacts(id) on update cascade on delete set null,
  callback_id text references tentativas_callbacks(id) on update cascade on delete set null,
  recovery_id text references tentativas_recoveries(id) on update cascade on delete set null,
  event_type text not null,
  actor_user_id text,
  actor_name text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists tentativas_opportunities_customer_idx
  on tentativas_opportunities (codigo_cliente, active, updated_at desc);
create index if not exists tentativas_opportunities_company_regional_idx
  on tentativas_opportunities (empresa, regional, active);
create index if not exists tentativas_opportunities_neighborhood_idx
  on tentativas_opportunities (cidade_normalizada, bairro, active);
create index if not exists tentativas_opportunities_score_idx
  on tentativas_opportunities (active, priority_score desc, last_attempt_at nulls first);
create index if not exists tentativas_callbacks_owner_status_idx
  on tentativas_callbacks (technician_user_id, status, scheduled_at);
create index if not exists tentativas_callbacks_opportunity_idx
  on tentativas_callbacks (opportunity_id, scheduled_at desc);
create index if not exists tentativas_recoveries_status_idx
  on tentativas_recoveries (status, scheduled_at, updated_at desc);
create index if not exists tentativas_recoveries_opportunity_idx
  on tentativas_recoveries (opportunity_id, created_at desc);
create unique index if not exists tentativas_recovery_equipment_unique_idx
  on tentativas_recovery_equipments (recovery_id, coalesce(mac_serial, ''), coalesce(equipment_type, ''));
create unique index if not exists tentativas_recovery_equipment_confirmed_serial_idx
  on tentativas_recovery_equipments (lower(mac_serial))
  where status = 'CONFIRMED' and nullif(trim(mac_serial), '') is not null;
create index if not exists tentativas_events_opportunity_idx
  on tentativas_events (opportunity_id, occurred_at desc);
create index if not exists tentativas_events_actor_idx
  on tentativas_events (actor_user_id, occurred_at desc);
create index if not exists tentativas_events_type_idx
  on tentativas_events (event_type, occurred_at desc);

with permissions(id, feature_id, feature_label, action, sort_order, description) as (
  values
    ('tentativas.contatar', 'contatos', 'Contatar clientes', 'manage', 769, 'Iniciar contatos nas oportunidades atribuidas.'),
    ('tentativas.registrar', 'contatos', 'Registrar resultados', 'manage', 770, 'Registrar resultado e evidencias de tentativas.'),
    ('tentativas.agendar', 'retornos', 'Agendar retornos', 'manage', 771, 'Criar e concluir retornos e acompanhamentos.'),
    ('tentativas.carteiras.gerenciar', 'carteiras', 'Gerenciar carteiras', 'manage', 772, 'Distribuir e transferir oportunidades entre tecnicos.'),
    ('tentativas.gestao.visualizar', 'gestao', 'Gestao de Tentativas', 'view', 773, 'Visualizar indicadores gerenciais e produtividade.'),
    ('tentativas.relatorios.exportar', 'relatorios', 'Exportar relatorios', 'view', 774, 'Exportar relatorios gerenciais do modulo.'),
    ('tentativas.auditoria.visualizar', 'auditoria', 'Auditoria', 'view', 775, 'Visualizar a linha do tempo e eventos de auditoria.'),
    ('tentativas.registros.corrigir', 'auditoria', 'Corrigir registros', 'manage', 776, 'Corrigir registros mediante justificativa auditavel.')
)
insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label, action,
  sort_order, legacy_permission, description, active, deprecated
)
select id, 'tentativas', 'Tentativas', feature_id, feature_label, action,
       sort_order, null, description, true, false
from permissions
on conflict (id) do update set
  section_id = excluded.section_id,
  section_label = excluded.section_label,
  feature_id = excluded.feature_id,
  feature_label = excluded.feature_label,
  action = excluded.action,
  sort_order = excluded.sort_order,
  description = excluded.description,
  active = true,
  deprecated = false;

insert into app_role_permissions (role_id, permission)
select seed.role_id, seed.permission
from (values
  ('tecnico', 'tentativas.contatar'),
  ('tecnico', 'tentativas.registrar'),
  ('tecnico', 'tentativas.agendar'),
  ('supervisor', 'tentativas.contatar'),
  ('supervisor', 'tentativas.registrar'),
  ('supervisor', 'tentativas.agendar'),
  ('supervisor', 'tentativas.carteiras.gerenciar'),
  ('supervisor', 'tentativas.gestao.visualizar'),
  ('supervisor', 'tentativas.relatorios.exportar'),
  ('supervisor', 'tentativas.auditoria.visualizar'),
  ('supervisor', 'tentativas.registros.corrigir'),
  ('backoffice_retirada', 'tentativas.contatar'),
  ('backoffice_retirada', 'tentativas.registrar'),
  ('backoffice_retirada', 'tentativas.agendar'),
  ('backoffice_retirada', 'tentativas.carteiras.gerenciar'),
  ('backoffice_retirada', 'tentativas.gestao.visualizar'),
  ('backoffice_retirada', 'tentativas.relatorios.exportar'),
  ('backoffice_retirada', 'tentativas.auditoria.visualizar'),
  ('backoffice_retirada', 'tentativas.registros.corrigir'),
  ('backoffice', 'tentativas.contatar'),
  ('backoffice', 'tentativas.registrar'),
  ('backoffice', 'tentativas.agendar'),
  ('backoffice', 'tentativas.gestao.visualizar')
) as seed(role_id, permission)
where exists (select 1 from app_roles where app_roles.id = seed.role_id)
on conflict (role_id, permission) do nothing;
