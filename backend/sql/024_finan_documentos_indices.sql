-- Item 16(c) do relatorio da refatoracao do menu: indices de suporte pras
-- novas consultas por status/vinculo introduzidas nesta fase (contador
-- agregado do menu em navegacao/routes.js e o LEFT JOIN LATERAL novo em
-- GET /notas pra mostrar se a nota ja tem Conta a Pagar vinculada).
-- Puramente aditivo, sem risco pra dado existente.
create index if not exists finan_documentos_entrada_status_idx
	on finan_documentos_entrada (status);

create index if not exists finan_contas_pagar_nota_id_idx
	on finan_contas_pagar (nota_id)
	where nota_id is not null;
