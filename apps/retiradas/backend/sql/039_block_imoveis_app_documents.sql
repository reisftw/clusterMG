create or replace function block_migrated_imoveis_app_documents()
returns trigger as $$
begin
	if new.collection_path in (
		'imoveis_administrativos',
		'imoveis_administrativos_config',
		'imoveis_administrativos_reajustes',
		'imoveis_administrativos_iptu',
		'imoveis_administrativos_alugueis',
		'imoveis_administrativos_contratos',
		'imoveis_administrativos_anexos',
		'imoveis_administrativos_aditivos'
	) then
		raise exception 'Colecao de imoveis % migrada para tabelas normalizadas.', new.path;
	end if;
	return new;
end;
$$ language plpgsql;

drop trigger if exists block_migrated_imoveis_app_documents on app_documents;
create trigger block_migrated_imoveis_app_documents
before insert or update on app_documents
for each row execute function block_migrated_imoveis_app_documents();
