do $$
begin
  if to_regclass('public.app_documents') is null
     and to_regclass('public.firestore_documents') is not null then
    alter table firestore_documents rename to app_documents;
  end if;

  if to_regclass('public.import_runs') is null
     and to_regclass('public.firestore_import_runs') is not null then
    alter table firestore_import_runs rename to import_runs;
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'app_users'
       and column_name = 'firebase_profile'
  ) and not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'app_users'
       and column_name = 'imported_profile'
  ) then
    alter table app_users rename column firebase_profile to imported_profile;
  end if;
end $$;

alter index if exists firestore_documents_collection_path_idx
  rename to app_documents_collection_path_idx;

alter index if exists firestore_documents_parent_path_idx
  rename to app_documents_parent_path_idx;

alter index if exists firestore_documents_data_gin_idx
  rename to app_documents_data_gin_idx;

do $$
begin
  if exists (
    select 1
      from pg_trigger
     where tgname = 'firestore_documents_touch_updated_at'
       and tgrelid = to_regclass('public.app_documents')
  ) then
    alter trigger firestore_documents_touch_updated_at
      on app_documents
      rename to app_documents_touch_updated_at;
  end if;
end $$;
