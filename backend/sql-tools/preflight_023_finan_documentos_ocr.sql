-- Pre-flight para 023_finan_documentos_ocr.sql
-- SOMENTE LEITURA. ALTER TABLE aditivo (ADD COLUMN com default), risco baixo.

\echo '=== 1. finan_documentos_entrada existe? (esperado: 1 linha) ==='
select table_name from information_schema.tables where table_name = 'finan_documentos_entrada';

\echo '=== 2. Colunas novas ja existem? (esperado: 0 linhas) ==='
select column_name from information_schema.columns
where table_name = 'finan_documentos_entrada'
	and column_name in ('ocr_status', 'ocr_erro', 'texto_extraido', 'campos_extraidos');

\echo '=== 3. Quantas linhas ja existem na tabela hoje (vao receber o default)? ==='
select count(*)::int as total from finan_documentos_entrada;
