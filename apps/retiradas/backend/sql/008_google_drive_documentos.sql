create extension if not exists pgcrypto;

create table if not exists document_client_folders (
  empresa_id text primary key,
  empresa_nome text not null,
  supervisor_id text,
  supervisor_nome text,
  regional text,
  drive_folder_id text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_files (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  empresa_nome text not null,
  supervisor_id text,
  supervisor_nome text,
  regional text,
  drive_file_id text not null unique,
  drive_folder_id text not null,
  parent_drive_folder_id text,
  nome text not null,
  mime_type text,
  tipo text,
  tamanho bigint not null default 0,
  status text not null default 'pendente',
  motivo_reprovacao text,
  uploaded_by text,
  uploaded_by_name text,
  approved_by text,
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_files_empresa_idx on document_files (empresa_id);
create index if not exists document_files_status_idx on document_files (status);
create index if not exists document_files_supervisor_idx on document_files (supervisor_id);
create index if not exists document_files_created_idx on document_files (created_at desc);
