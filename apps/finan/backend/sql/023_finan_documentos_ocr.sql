-- Roteiro Finan #15 (OCR inteligente): campos pra guardar o resultado
-- da extracao automatica de finan_documentos_entrada — texto bruto
-- reconhecido pelo Tesseract e os campos que a heuristica conseguiu
-- identificar (CNPJ, valor, datas, numero), sempre como sugestao pro
-- usuario confirmar, nunca gravados direto como Nota Fiscal. Alteracao
-- aditiva (ADD COLUMN com default), sem risco pra linha existente.
alter table finan_documentos_entrada
	add column if not exists ocr_status text not null default 'pendente', -- pendente | ok | erro
	add column if not exists ocr_erro text,
	add column if not exists texto_extraido text,
	add column if not exists campos_extraidos jsonb not null default '{}'::jsonb;
