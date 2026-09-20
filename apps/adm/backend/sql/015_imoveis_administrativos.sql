insert into app_roles (id, name, description, system_role, active)
values
  ('supervisor_administrativo', 'Supervisor Administrativo', 'Acesso administrativo com gestão de documentos, empresas, insumos e imóveis.', true, true),
  ('analista_administrativo', 'Analista Administrativo', 'Acesso administrativo para análise de documentos, empresas, insumos e imóveis.', true, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  system_role = true,
  active = true;

insert into app_role_permissions (role_id, permission)
values
  ('supervisor_administrativo', 'view_imoveis_administrativos'),
  ('supervisor_administrativo', 'manage_imoveis_administrativos'),
  ('analista_administrativo', 'view_imoveis_administrativos'),
  ('analista_administrativo', 'manage_imoveis_administrativos')
on conflict do nothing;
