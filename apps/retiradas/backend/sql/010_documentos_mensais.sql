create extension if not exists pgcrypto;

create table if not exists document_required_fields (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  obrigatorio boolean not null default true,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_submissions (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  empresa_nome text not null,
  supervisor_id text,
  supervisor_nome text,
  supervisor_email text,
  regional text,
  mes_referencia text not null,
  status text not null default 'pendente',
  motivo_reprovacao text,
  submitted_by text,
  submitted_by_name text,
  submitted_by_email text,
  submitted_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table document_files
  add column if not exists submission_id uuid references document_submissions(id) on delete set null,
  add column if not exists field_id uuid references document_required_fields(id) on delete set null,
  add column if not exists field_nome text,
  add column if not exists mes_referencia text;

create index if not exists document_required_fields_ativo_idx on document_required_fields (ativo, ordem);
create index if not exists document_submissions_empresa_idx on document_submissions (empresa_id);
create index if not exists document_submissions_status_idx on document_submissions (status);
create index if not exists document_submissions_mes_idx on document_submissions (mes_referencia);
create index if not exists document_submissions_created_idx on document_submissions (created_at desc);
create index if not exists document_files_submission_idx on document_files (submission_id);
