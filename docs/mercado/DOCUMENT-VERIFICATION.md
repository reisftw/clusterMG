# Verificação documental de prestadores

Os arquivos enviados ao Mercado não são publicados no frontend. O backend aceita apenas PDF, PNG ou JPEG, valida MIME e assinatura do arquivo, impõe o limite `MERCADO_DOCUMENT_UPLOAD_LIMIT_BYTES` (10 MB por padrão) e grava nome aleatório em `MERCADO_DOCUMENTS_DIR`.

O conteúdo é cifrado com AES-256-GCM usando `MERCADO_DOCUMENTS_ENCRYPTION_KEY`, que deve ser configurada fora do Git. Sem essa variável o envio é recusado com erro 503, por segurança. Visualização requer sessão do dono do documento; a revisão administrativa fica sob rota administrativa autenticada e registra auditoria de decisão. A infraestrutura ainda precisa definir backup cifrado, antivírus/varredura e política de retenção antes da abertura pública.

Estados: `NAO_ENVIADO`, `PENDENTE_ANALISE`, `EM_ANALISE`, `APROVADO`, `REPROVADO`, `CORRECAO_SOLICITADA`. E-mail verificado não equivale a documento aprovado. Somente a habilitação operacional explícita libera aceite de lote.
