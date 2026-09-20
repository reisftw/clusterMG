-- Documentos do veiculo usam o mesmo mecanismo generico de anexos
-- (rot_image_attachments + attachments/routes.js) ja estendido pra PDF
-- pelo DSS (055_dss_attachments_pdf.sql) — mesma licao do
-- 051_rot_image_attachments_sst_protocol.sql: sem atualizar esta
-- CHECK CONSTRAINT, o whitelist do codigo autoriza mas o INSERT
-- estoura 500.

alter table rot_image_attachments drop constraint if exists rot_image_attachments_entidade_tipo_check;

alter table rot_image_attachments add constraint rot_image_attachments_entidade_tipo_check
	check (entidade_tipo = any (array[
		'APR', 'ROMPIMENTO', 'ASSET', 'SST_PROTOCOL', 'DSS_THEME', 'DSS_EXECUTION', 'VEHICLE_DOCUMENT'
	]));
