create or replace function block_migrated_ordens_app_documents()
returns trigger as $$
begin
	if new.collection_path in (
		'ordens_abertas',
		'match_os_abertas',
		'ordens_legadas',
		'os_acumuladas',
		'mapa_meta',
		'match_os_meta',
		'public_dashboard'
	) then
		raise exception 'Colecao de ordens % migrada para tabelas normalizadas.', new.path;
	end if;
	return new;
end;
$$ language plpgsql;

drop trigger if exists block_migrated_ordens_app_documents on app_documents;
create trigger block_migrated_ordens_app_documents
before insert or update on app_documents
for each row execute function block_migrated_ordens_app_documents();
