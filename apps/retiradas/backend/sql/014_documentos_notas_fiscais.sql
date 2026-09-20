alter table document_files
  add column if not exists categoria text not null default 'documento',
  add column if not exists valor numeric(14,2);

create index if not exists document_files_categoria_idx on document_files (categoria);
create index if not exists document_files_valor_idx on document_files (valor);
