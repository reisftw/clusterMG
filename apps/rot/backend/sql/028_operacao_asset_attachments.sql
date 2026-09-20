-- Operacao — permite reutilizar a arquitetura de imagens em Ativos & Seguranca.
-- Additive-only: amplia o check existente sem alterar registros atuais.

alter table rot_image_attachments
	drop constraint if exists rot_image_attachments_entidade_tipo_check;

alter table rot_image_attachments
	add constraint rot_image_attachments_entidade_tipo_check
	check (entidade_tipo in ('APR','ROMPIMENTO','ASSET'));
