create table if not exists facilities_keys (
  id text primary key,
  code text not null unique,
  description text not null,
  type text not null default 'Chave física',
  company_id text,
  regional_id text,
  property_id text,
  environment_id text,
  location_description text,
  status text not null default 'DISPONIVEL',
  current_holder_user_id text,
  current_holder_name text,
  checked_out_at timestamptz,
  expected_return_at timestamptz,
  returned_at timestamptz,
  qr_token text not null unique,
  qr_version integer not null default 1,
  notes text,
  legacy_source text,
  legacy_id text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now(),
  active boolean not null default true
);

alter table app_permissions
  drop constraint if exists app_permissions_action_check;

alter table app_permissions
  add constraint app_permissions_action_check
  check (action = any (array[
    'view',
    'manage',
    'create',
    'edit',
    'deactivate',
    'transfer',
    'execute',
    'approve',
    'checkout',
    'return',
    'declare_lost',
    'qr_generate',
    'qr_export',
    'inspect',
    'configure'
  ]));

create index if not exists facilities_keys_status_idx on facilities_keys (status);
create index if not exists facilities_keys_property_idx on facilities_keys (property_id);
create index if not exists facilities_keys_regional_idx on facilities_keys (regional_id);
create index if not exists facilities_keys_qr_token_idx on facilities_keys (qr_token);
create unique index if not exists facilities_keys_legacy_rot_idx
  on facilities_keys (legacy_source, legacy_id)
  where legacy_source is not null and legacy_id is not null;

create table if not exists facilities_key_events (
  id text primary key,
  key_id text not null references facilities_keys(id) on delete cascade,
  event_type text not null,
  actor_user_id text,
  holder_user_id text,
  occurred_at timestamptz not null default now(),
  expected_return_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists facilities_key_events_key_idx
  on facilities_key_events (key_id, occurred_at desc);
create index if not exists facilities_key_events_type_idx
  on facilities_key_events (event_type);

create or replace function touch_facilities_keys_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists facilities_keys_touch_updated_at on facilities_keys;
create trigger facilities_keys_touch_updated_at
before update on facilities_keys
for each row execute function touch_facilities_keys_updated_at();

with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('facilities.imoveis.view', 'facilities', 'Facilities', 'imoveis_espacos', 'Imóveis & Espaços', 'view', 1411, 'facilities.imoveis_espacos.view', 'Visualizar imóveis e espaços de Facilities.'),
    ('facilities.imoveis.create', 'facilities', 'Facilities', 'imoveis_espacos', 'Imóveis & Espaços', 'create', 1412, 'administrativo.imoveis.manage', 'Criar imóveis e espaços de Facilities.'),
    ('facilities.imoveis.edit', 'facilities', 'Facilities', 'imoveis_espacos', 'Imóveis & Espaços', 'edit', 1413, 'administrativo.imoveis.manage', 'Editar imóveis e espaços de Facilities.'),
    ('facilities.imoveis.deactivate', 'facilities', 'Facilities', 'imoveis_espacos', 'Imóveis & Espaços', 'deactivate', 1414, 'administrativo.imoveis.manage', 'Inativar imóveis e espaços de Facilities.'),
    ('facilities.patrimonio.view', 'facilities', 'Facilities', 'patrimonio_inventario', 'Patrimônio & Inventário', 'view', 1421, 'facilities.patrimonio_inventario.view', 'Visualizar ativos patrimoniais.'),
    ('facilities.patrimonio.create', 'facilities', 'Facilities', 'patrimonio_inventario', 'Patrimônio & Inventário', 'create', 1422, 'facilities.manage', 'Criar ativos patrimoniais.'),
    ('facilities.patrimonio.edit', 'facilities', 'Facilities', 'patrimonio_inventario', 'Patrimônio & Inventário', 'edit', 1423, 'facilities.manage', 'Editar ativos patrimoniais.'),
    ('facilities.patrimonio.transfer', 'facilities', 'Facilities', 'patrimonio_inventario', 'Patrimônio & Inventário', 'transfer', 1424, 'facilities.manage', 'Transferir ativos patrimoniais.'),
    ('facilities.patrimonio.deactivate', 'facilities', 'Facilities', 'patrimonio_inventario', 'Patrimônio & Inventário', 'deactivate', 1425, 'facilities.manage', 'Inativar ativos patrimoniais.'),
    ('facilities.patrimonio.qr.export', 'facilities', 'Facilities', 'patrimonio_inventario', 'Patrimônio & Inventário', 'qr_export', 1426, 'facilities.patrimonio_inventario.view', 'Exportar QR Code de patrimônio.'),
    ('facilities.inventario.view', 'facilities', 'Facilities', 'patrimonio_inventario', 'Patrimônio & Inventário', 'view', 1427, 'facilities.patrimonio_inventario.view', 'Visualizar inventários patrimoniais.'),
    ('facilities.inventario.execute', 'facilities', 'Facilities', 'patrimonio_inventario', 'Patrimônio & Inventário', 'execute', 1428, 'facilities.manage', 'Executar inventários patrimoniais.'),
    ('facilities.inventario.approve', 'facilities', 'Facilities', 'patrimonio_inventario', 'Patrimônio & Inventário', 'approve', 1429, 'facilities.manage', 'Aprovar inventários patrimoniais.'),
    ('facilities.chaves.view', 'facilities', 'Facilities', 'chaves', 'Acessos & Chaves', 'view', 1510, 'facilities.acessos_chaves.view', 'Visualizar chaves do ADM.'),
    ('facilities.chaves.create', 'facilities', 'Facilities', 'chaves', 'Acessos & Chaves', 'create', 1511, 'facilities.manage', 'Criar chaves do ADM.'),
    ('facilities.chaves.edit', 'facilities', 'Facilities', 'chaves', 'Acessos & Chaves', 'edit', 1512, 'facilities.manage', 'Editar chaves do ADM.'),
    ('facilities.chaves.checkout', 'facilities', 'Facilities', 'chaves', 'Acessos & Chaves', 'checkout', 1513, 'facilities.manage', 'Registrar retirada de chave.'),
    ('facilities.chaves.return', 'facilities', 'Facilities', 'chaves', 'Acessos & Chaves', 'return', 1514, 'facilities.manage', 'Registrar devolução de chave.'),
    ('facilities.chaves.declare_lost', 'facilities', 'Facilities', 'chaves', 'Acessos & Chaves', 'declare_lost', 1515, 'facilities.manage', 'Declarar chave perdida.'),
    ('facilities.chaves.deactivate', 'facilities', 'Facilities', 'chaves', 'Acessos & Chaves', 'deactivate', 1516, 'facilities.manage', 'Inativar chave.'),
    ('facilities.chaves.qr.generate', 'facilities', 'Facilities', 'chaves', 'Acessos & Chaves', 'qr_generate', 1517, 'facilities.manage', 'Gerar ou regenerar QR Code de chave.'),
    ('facilities.chaves.qr.export', 'facilities', 'Facilities', 'chaves', 'Acessos & Chaves', 'qr_export', 1518, 'facilities.acessos_chaves.view', 'Exportar QR Code de chave.'),
    ('facilities.operacao_predial.manage', 'facilities', 'Facilities', 'operacao_predial', 'Operação Predial', 'manage', 1541, 'facilities.manage', 'Gerenciar rotinas, checklists e ocorrências prediais.'),
    ('facilities.seguranca.view', 'facilities', 'Facilities', 'seguranca_conformidade', 'Segurança & Conformidade', 'view', 1551, 'facilities.seguranca_conformidade.view', 'Visualizar itens de segurança e conformidade.'),
    ('facilities.seguranca.create', 'facilities', 'Facilities', 'seguranca_conformidade', 'Segurança & Conformidade', 'create', 1552, 'facilities.manage', 'Criar itens de segurança e conformidade.'),
    ('facilities.seguranca.edit', 'facilities', 'Facilities', 'seguranca_conformidade', 'Segurança & Conformidade', 'edit', 1553, 'facilities.manage', 'Editar itens de segurança e conformidade.'),
    ('facilities.seguranca.inspect', 'facilities', 'Facilities', 'seguranca_conformidade', 'Segurança & Conformidade', 'inspect', 1554, 'facilities.manage', 'Registrar inspeções de segurança.'),
    ('facilities.seguranca.deactivate', 'facilities', 'Facilities', 'seguranca_conformidade', 'Segurança & Conformidade', 'deactivate', 1555, 'facilities.manage', 'Inativar itens de segurança.'),
    ('facilities.fornecedores.view', 'facilities', 'Facilities', 'fornecedores_contratos', 'Fornecedores & Contratos', 'view', 1561, 'facilities.fornecedores_contratos.view', 'Visualizar fornecedores de Facilities.'),
    ('facilities.fornecedores.manage', 'facilities', 'Facilities', 'fornecedores_contratos', 'Fornecedores & Contratos', 'manage', 1562, 'facilities.manage', 'Gerenciar fornecedores de Facilities.'),
    ('facilities.contratos.view', 'facilities', 'Facilities', 'fornecedores_contratos', 'Fornecedores & Contratos', 'view', 1563, 'facilities.fornecedores_contratos.view', 'Visualizar contratos de Facilities.'),
    ('facilities.contratos.manage', 'facilities', 'Facilities', 'fornecedores_contratos', 'Fornecedores & Contratos', 'manage', 1564, 'facilities.manage', 'Gerenciar contratos de Facilities.'),
    ('facilities.consumos.view', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'view', 1570, 'facilities.consumos.view', 'Visualizar consumos e custos prediais.'),
    ('facilities.consumos.create', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'create', 1571, 'facilities.manage', 'Criar registros de consumo predial.'),
    ('facilities.consumos.edit', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'edit', 1572, 'facilities.manage', 'Editar registros de consumo predial.'),
    ('facilities.consumos.import', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'manage', 1573, 'facilities.manage', 'Importar lançamentos de consumos e custos com preview.'),
    ('facilities.consumos.export', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'view', 1574, 'facilities.consumos.view', 'Exportar lançamentos de consumos e custos.'),
    ('facilities.encargos.view', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'view', 1575, 'facilities.consumos.view', 'Visualizar custos e encargos de imóveis.'),
    ('facilities.encargos.create', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'create', 1576, 'facilities.manage', 'Criar custos e encargos de imóveis.'),
    ('facilities.encargos.edit', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'edit', 1577, 'facilities.manage', 'Editar custos e encargos de imóveis.'),
    ('facilities.anomalias.view', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'view', 1578, 'facilities.consumos.view', 'Visualizar anomalias de consumo e custo.'),
    ('facilities.anomalias.manage', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'manage', 1579, 'facilities.manage', 'Tratar e justificar anomalias de consumo e custo.'),
    ('facilities.consumos.settings.manage', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'manage', 1580, 'facilities.manage', 'Configurar regras de anomalia de consumos e custos.'),
    ('facilities.saude.view', 'facilities', 'Facilities', 'score', 'Saúde das Unidades', 'view', 1581, 'facilities.score.view', 'Visualizar indicador de saúde das unidades.'),
    ('facilities.saude.configure', 'facilities', 'Facilities', 'score', 'Saúde das Unidades', 'configure', 1582, 'facilities.manage', 'Configurar indicador de saúde das unidades.'),
    ('administrativo.auditoria.view', 'administracao', 'Administração', 'auditoria', 'Auditoria', 'view', 2100, 'configuracao.auditoria.view', 'Visualizar auditoria administrativa.'),
    ('administrativo.email.view', 'administracao', 'Administração', 'email', 'E-mail', 'view', 2110, 'mensageria.email_config.view', 'Visualizar configurações de e-mail administrativo.'),
    ('administrativo.email.manage', 'administracao', 'Administração', 'email', 'E-mail', 'manage', 2111, 'mensageria.email_config.manage', 'Gerenciar configurações de e-mail administrativo.')
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

do $$
begin
  if to_regclass('public.rot_keys') is not null then
    execute $migration$
      insert into facilities_keys (
        id, code, description, type, regional_id, location_description, status,
        current_holder_user_id, current_holder_name, qr_token, qr_version,
        notes, legacy_source, legacy_id, created_by, created_at, updated_at, active
      )
      select
        'fkey_' || md5('rot_keys:' || k.id),
        coalesce(nullif('CHV-' || upper(right(regexp_replace(k.id, '[^a-zA-Z0-9]', '', 'g'), 6)), 'CHV-'), 'CHV-' || lpad(row_number() over(order by k.created_at, k.id)::text, 6, '0')),
        coalesce(nullif(k.name, ''), 'Chave migrada'),
        'Chave física',
        k.regional_id,
        nullif(k.address, ''),
        case
          when k.status = 'available' then 'DISPONIVEL'
          when k.status = 'in_use' then 'EM_POSSE'
          when k.status = 'awaiting_approval' then 'EM_POSSE'
          when k.status = 'rejected' then 'EM_POSSE'
          else 'DISPONIVEL'
        end,
        k.current_user_id,
        u.name,
        md5(random()::text || clock_timestamp()::text || k.id),
        1,
        'Migrado de rot_keys sem remover a origem.',
        'rot_keys',
        k.id,
        k.created_by,
        coalesce(k.created_at, now()),
        coalesce(k.updated_at, now()),
        true
      from rot_keys k
      left join rot_users u on u.id = k.current_user_id
      on conflict (legacy_source, legacy_id) do nothing
    $migration$;
  end if;

  if to_regclass('public.rot_key_events') is not null then
    execute $migration$
      insert into facilities_key_events (
        id, key_id, event_type, actor_user_id, holder_user_id,
        occurred_at, notes, metadata, created_at
      )
      select
        'fkevt_' || md5('rot_key_events:' || e.id),
        fk.id,
        case
          when e.action = 'taken' then 'CHECKED_OUT'
          when e.action = 'return_requested' then 'UPDATED'
          when e.action = 'return_approved' then 'RETURNED'
          when e.action = 'return_rejected' then 'UPDATED'
          else 'UPDATED'
        end,
        e.user_id,
        e.user_id,
        coalesce(e.created_at, now()),
        'Migrado de rot_key_events.',
        jsonb_build_object('legacyAction', e.action, 'legacyId', e.id),
        coalesce(e.created_at, now())
      from rot_key_events e
      join facilities_keys fk on fk.legacy_source = 'rot_keys' and fk.legacy_id = e.key_id
      on conflict (id) do nothing
    $migration$;
  end if;
end $$;
