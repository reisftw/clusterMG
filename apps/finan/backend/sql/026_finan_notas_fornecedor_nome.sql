-- Item pedido pelo usuario: "ver nome da empresa, CNPJ e outras
-- informacoes da nota antes de pagar". fornecedor_id (existente) e uma FK
-- pro cadastro de fornecedores, que nem sempre bate 1:1 com o que o OCR
-- ou o usuario digita na hora — fornecedor_nome e texto livre, sempre
-- preenchivel, independente de existir cadastro correspondente.
alter table finan_notas_fiscais add column if not exists fornecedor_nome text;
