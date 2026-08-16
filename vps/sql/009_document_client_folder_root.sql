alter table document_client_folders
  add column if not exists root_drive_folder_id text;

create index if not exists document_client_folders_root_idx
  on document_client_folders (root_drive_folder_id);
