-- Fase 1 do dominio DSS: registra os novos tipos de entidade de anexo
-- (DSS_THEME = PDF pronto de um tema; DSS_EXECUTION = evidencia da
-- execucao, foto ou lista de presenca assinada em PDF) na CHECK
-- CONSTRAINT de rot_image_attachments.entidade_tipo. Mesma licao do
-- 051_rot_image_attachments_sst_protocol.sql: sem isso, o whitelist do
-- codigo (attachments/routes.js) autorizaria a chamada mas o INSERT
-- estouraria 500 por violar a constraint do banco.
--
-- largura/altura ja sao nullable desde 018_rot_image_attachments.sql,
-- entao PDFs (sem dimensoes de imagem) nao exigem alteracao de coluna
-- aqui, so a extensao do mime aceito em attachments/routes.js.

alter table rot_image_attachments drop constraint if exists rot_image_attachments_entidade_tipo_check;

alter table rot_image_attachments add constraint rot_image_attachments_entidade_tipo_check
	check (entidade_tipo = any (array['APR', 'ROMPIMENTO', 'ASSET', 'SST_PROTOCOL', 'DSS_THEME', 'DSS_EXECUTION']));
