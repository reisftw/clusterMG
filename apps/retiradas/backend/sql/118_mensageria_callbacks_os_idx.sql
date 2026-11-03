-- migration:no-transaction
create index concurrently if not exists mensageria_callbacks_os_idx
  on mensageria_callbacks (os);
