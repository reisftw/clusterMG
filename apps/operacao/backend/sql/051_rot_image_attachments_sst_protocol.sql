-- Bug real em producao: adicionamos SST_PROTOCOL no whitelist do
-- codigo (attachments/routes.js, storage/index.js) mas esquecemos a
-- CHECK CONSTRAINT do banco em rot_image_attachments.entidade_tipo,
-- que so aceitava APR/ROMPIMENTO/ASSET. Toda tentativa de anexar foto
-- num protocolo SST estava dando 500.

alter table rot_image_attachments drop constraint if exists rot_image_attachments_entidade_tipo_check;

alter table rot_image_attachments add constraint rot_image_attachments_entidade_tipo_check
	check (entidade_tipo = any (array['APR', 'ROMPIMENTO', 'ASSET', 'SST_PROTOCOL']));
