begin;

create schema if not exists app_security;

create or replace function app_security.current_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('retiradas.current_user_id', true), '')
$$;

create or replace function app_security.current_user_role()
returns text
language sql
stable
as $$
  select lower(coalesce(nullif(current_setting('retiradas.current_user_role', true), ''), ''))
$$;

create or replace function app_security.current_user_regional()
returns text
language sql
stable
as $$
  select nullif(current_setting('retiradas.current_user_regional', true), '')
$$;

create or replace function app_security.is_authenticated()
returns boolean
language sql
stable
as $$
  select app_security.current_user_id() is not null
$$;

create or replace function app_security.is_admin()
returns boolean
language sql
stable
as $$
  select app_security.current_user_role() = 'admin'
$$;

create or replace function app_security.is_backoffice_or_admin()
returns boolean
language sql
stable
as $$
  select app_security.current_user_role() in (
    'admin',
    'backoffice',
    'backoffice_retirada',
    'supervisor',
    'supervisor_administrativo',
    'analista_administrativo'
  )
$$;

create or replace function app_security.document_regional(data jsonb)
returns text
language sql
stable
as $$
  select nullif(coalesce(
    data->>'regional',
    data->>'regionalNome',
    data->>'regional_nome',
    data->>'filial_id',
    data->>'filial'
  ), '')
$$;

create or replace function app_security.can_access_regional(data jsonb)
returns boolean
language sql
stable
as $$
  select
    app_security.is_admin()
    or app_security.current_user_regional() is null
    or app_security.document_regional(data) is null
    or app_security.document_regional(data) = app_security.current_user_regional()
$$;

create or replace function app_security.can_read_document(collection_path text, path text, data jsonb)
returns boolean
language sql
stable
as $$
  select
    app_security.is_admin()
    or path in (
      'public_dashboard/mapa_os',
      'public_dashboard/match_os',
      'public_dashboard/agentes_match_os',
      'public_dashboard/mapa_os_legadas',
      'config/metas'
    )
    or collection_path in (
      'ordens_abertas',
      'match_os_abertas',
      'ordens_legadas',
      'dashboard',
      'dashboardagentes',
      'feriados'
    )
    or (
      app_security.is_authenticated()
      and path = concat('usuarios/', app_security.current_user_id())
    )
    or (
      app_security.is_authenticated()
      and collection_path <> 'usuarios'
      and app_security.can_access_regional(data)
    )
$$;

create or replace function app_security.can_write_document(collection_path text, path text, data jsonb)
returns boolean
language sql
stable
as $$
  select
    app_security.is_admin()
    or (
      app_security.is_authenticated()
      and path = concat('usuarios/', app_security.current_user_id())
    )
    or (
      app_security.is_backoffice_or_admin()
      and collection_path <> 'usuarios'
      and app_security.can_access_regional(data)
    )
    or (
      collection_path = 'painel_visitas'
      and path like 'painel_visitas/%'
    )
$$;

alter table if exists app_documents enable row level security;
drop policy if exists app_documents_select_policy on app_documents;
create policy app_documents_select_policy on app_documents
for select
using (app_security.can_read_document(collection_path, path, data));

drop policy if exists app_documents_insert_policy on app_documents;
create policy app_documents_insert_policy on app_documents
for insert
with check (app_security.can_write_document(collection_path, path, data));

drop policy if exists app_documents_update_policy on app_documents;
create policy app_documents_update_policy on app_documents
for update
using (app_security.can_write_document(collection_path, path, data))
with check (app_security.can_write_document(collection_path, path, data));

drop policy if exists app_documents_delete_policy on app_documents;
create policy app_documents_delete_policy on app_documents
for delete
using (app_security.can_write_document(collection_path, path, data));

alter table if exists app_users enable row level security;
drop policy if exists app_users_select_policy on app_users;
create policy app_users_select_policy on app_users
for select
using (app_security.is_admin() or uid = app_security.current_user_id());

drop policy if exists app_users_insert_policy on app_users;
create policy app_users_insert_policy on app_users
for insert
with check (app_security.is_admin());

drop policy if exists app_users_update_policy on app_users;
create policy app_users_update_policy on app_users
for update
using (app_security.is_admin() or uid = app_security.current_user_id())
with check (app_security.is_admin() or uid = app_security.current_user_id());

drop policy if exists app_users_delete_policy on app_users;
create policy app_users_delete_policy on app_users
for delete
using (app_security.is_admin());

alter table if exists app_sessions enable row level security;
drop policy if exists app_sessions_select_policy on app_sessions;
create policy app_sessions_select_policy on app_sessions
for select
using (app_security.is_admin() or uid = app_security.current_user_id());

drop policy if exists app_sessions_insert_policy on app_sessions;
create policy app_sessions_insert_policy on app_sessions
for insert
with check (app_security.is_admin() or uid = app_security.current_user_id());

drop policy if exists app_sessions_update_policy on app_sessions;
create policy app_sessions_update_policy on app_sessions
for update
using (app_security.is_admin() or uid = app_security.current_user_id())
with check (app_security.is_admin() or uid = app_security.current_user_id());

drop policy if exists app_sessions_delete_policy on app_sessions;
create policy app_sessions_delete_policy on app_sessions
for delete
using (app_security.is_admin() or uid = app_security.current_user_id());

alter table if exists password_reset_tokens enable row level security;
drop policy if exists password_reset_tokens_owner_policy on password_reset_tokens;
create policy password_reset_tokens_owner_policy on password_reset_tokens
for all
using (app_security.is_admin() or uid = app_security.current_user_id())
with check (app_security.is_admin() or uid = app_security.current_user_id());

alter table if exists email_mfa_challenges enable row level security;
drop policy if exists email_mfa_challenges_owner_policy on email_mfa_challenges;
create policy email_mfa_challenges_owner_policy on email_mfa_challenges
for all
using (app_security.is_admin() or uid = app_security.current_user_id())
with check (app_security.is_admin() or uid = app_security.current_user_id());

alter table if exists document_client_folders enable row level security;
drop policy if exists document_client_folders_policy on document_client_folders;
create policy document_client_folders_policy on document_client_folders
for all
using (
  app_security.is_admin()
  or (
    app_security.is_authenticated()
    and (regional is null or regional = app_security.current_user_regional())
  )
)
with check (
  app_security.is_admin()
  or (
    app_security.is_backoffice_or_admin()
    and (regional is null or regional = app_security.current_user_regional())
  )
);

alter table if exists document_files enable row level security;
drop policy if exists document_files_policy on document_files;
create policy document_files_policy on document_files
for all
using (
  app_security.is_admin()
  or uploaded_by = app_security.current_user_id()
  or (
    app_security.is_authenticated()
    and (regional is null or regional = app_security.current_user_regional())
  )
)
with check (
  app_security.is_admin()
  or uploaded_by = app_security.current_user_id()
  or (
    app_security.is_backoffice_or_admin()
    and (regional is null or regional = app_security.current_user_regional())
  )
);

alter table if exists document_submissions enable row level security;
drop policy if exists document_submissions_policy on document_submissions;
create policy document_submissions_policy on document_submissions
for all
using (
  app_security.is_admin()
  or submitted_by = app_security.current_user_id()
  or (
    app_security.is_authenticated()
    and (regional is null or regional = app_security.current_user_regional())
  )
)
with check (
  app_security.is_admin()
  or submitted_by = app_security.current_user_id()
  or (
    app_security.is_backoffice_or_admin()
    and (regional is null or regional = app_security.current_user_regional())
  )
);

alter table if exists document_required_fields enable row level security;
drop policy if exists document_required_fields_select_policy on document_required_fields;
create policy document_required_fields_select_policy on document_required_fields
for select
using (app_security.is_authenticated());

drop policy if exists document_required_fields_write_policy on document_required_fields;
create policy document_required_fields_write_policy on document_required_fields
for all
using (app_security.is_admin() or app_security.current_user_role() = 'supervisor_administrativo')
with check (app_security.is_admin() or app_security.current_user_role() = 'supervisor_administrativo');

alter table if exists app_roles enable row level security;
drop policy if exists app_roles_select_policy on app_roles;
create policy app_roles_select_policy on app_roles
for select
using (app_security.is_authenticated());

drop policy if exists app_roles_write_policy on app_roles;
create policy app_roles_write_policy on app_roles
for all
using (app_security.is_admin())
with check (app_security.is_admin());

alter table if exists app_role_permissions enable row level security;
drop policy if exists app_role_permissions_select_policy on app_role_permissions;
create policy app_role_permissions_select_policy on app_role_permissions
for select
using (app_security.is_authenticated());

drop policy if exists app_role_permissions_write_policy on app_role_permissions;
create policy app_role_permissions_write_policy on app_role_permissions
for all
using (app_security.is_admin())
with check (app_security.is_admin());

alter table if exists app_permissions enable row level security;
drop policy if exists app_permissions_select_policy on app_permissions;
create policy app_permissions_select_policy on app_permissions
for select
using (app_security.is_authenticated());

drop policy if exists app_permissions_write_policy on app_permissions;
create policy app_permissions_write_policy on app_permissions
for all
using (app_security.is_admin())
with check (app_security.is_admin());

alter table if exists static_snapshots enable row level security;
drop policy if exists static_snapshots_select_policy on static_snapshots;
create policy static_snapshots_select_policy on static_snapshots
for select
using (
  domain in ('dashboard', 'operacional')
  or app_security.is_authenticated()
);

drop policy if exists static_snapshots_write_policy on static_snapshots;
create policy static_snapshots_write_policy on static_snapshots
for all
using (app_security.is_backoffice_or_admin())
with check (app_security.is_backoffice_or_admin());

alter table if exists email_logs enable row level security;
drop policy if exists email_logs_policy on email_logs;
create policy email_logs_policy on email_logs
for all
using (app_security.is_admin() or app_security.current_user_role() = 'supervisor_administrativo')
with check (app_security.is_admin() or app_security.current_user_role() = 'supervisor_administrativo');

alter table if exists metrics_requests enable row level security;
drop policy if exists metrics_requests_policy on metrics_requests;
create policy metrics_requests_policy on metrics_requests
for all
using (app_security.is_admin())
with check (app_security.is_admin());

alter table if exists metrics_queries enable row level security;
drop policy if exists metrics_queries_policy on metrics_queries;
create policy metrics_queries_policy on metrics_queries
for all
using (app_security.is_admin())
with check (app_security.is_admin());

alter table if exists import_runs enable row level security;
drop policy if exists import_runs_policy on import_runs;
create policy import_runs_policy on import_runs
for all
using (app_security.is_admin())
with check (app_security.is_admin());

comment on schema app_security is
  'Funcoes de apoio para Row Level Security do sistema Retiradas. O contexto vem dos GUCs retiradas.current_user_* definidos pelo backend.';

commit;
