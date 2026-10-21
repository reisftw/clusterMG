insert into app_roles (id, name, description, system_role, active)
values (
  'tecnico',
  'Técnico',
  'Acesso à própria operação na dashboard e às tentativas atribuídas.',
  true,
  true
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  system_role = true,
  active = true;

insert into app_role_permissions (role_id, permission)
values
  ('tecnico', 'view_dashboard'),
  ('tecnico', 'tentativas.visualizar'),
  ('tecnico', 'tentativas.executar')
on conflict (role_id, permission) do nothing;
