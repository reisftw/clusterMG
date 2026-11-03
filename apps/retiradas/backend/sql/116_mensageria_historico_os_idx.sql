-- migration:no-transaction
create index concurrently if not exists mensageria_historico_os_idx
  on mensageria_historico (os);
