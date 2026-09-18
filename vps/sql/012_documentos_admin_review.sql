alter table document_files
  add column if not exists admin_status text not null default 'pendente',
  add column if not exists admin_motivo_reprovacao text,
  add column if not exists admin_reviewed_by text,
  add column if not exists admin_reviewed_by_name text,
  add column if not exists admin_reviewed_at timestamptz;

alter table document_submissions
  add column if not exists admin_reviewed_by text,
  add column if not exists admin_reviewed_by_name text,
  add column if not exists admin_reviewed_at timestamptz;

update document_files
set admin_status = 'aprovado',
    admin_reviewed_by = coalesce(admin_reviewed_by, approved_by),
    admin_reviewed_by_name = coalesce(admin_reviewed_by_name, approved_by_name),
    admin_reviewed_at = coalesce(admin_reviewed_at, approved_at)
where status = 'aprovado'
  and (admin_status is null or admin_status = 'pendente');

update document_files
set admin_status = 'pendente'
where status <> 'aprovado'
  and admin_status <> 'pendente';

create index if not exists document_files_admin_status_idx on document_files (admin_status);
create index if not exists document_submissions_admin_reviewed_idx on document_submissions (admin_reviewed_at desc);
