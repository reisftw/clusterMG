# Revisao de seguranca - Retiradas VPS

Este documento resume os controles tecnicos ativos para avaliacao interna de SI/pentest.

## Autenticacao e sessao

- Autenticacao propria via JWT assinado no backend.
- Claims esperadas: emissor, audiencia, expiracao e usuario.
- CSRF obrigatorio em metodos de escrita autenticados.
- Segredo de assinatura em variavel de ambiente (`APP_AUTH_SECRET`), com suporte a rotacao por `APP_AUTH_PREVIOUS_SECRETS`.
- Logout revoga sessao no backend.
- Rate limit especifico para login e recuperacao de senha:
  - `LOGIN_RATE_LIMIT_WINDOW_MS`
  - `LOGIN_RATE_LIMIT_MAX`

## API e autorizacao

- CORS restrito por `CORS_ORIGIN`; em producao a API falha se origem nao estiver configurada.
- Helmet habilitado para headers de seguranca.
- HTTPS obrigatorio via nginx/Let's Encrypt.
- RBAC por cargo no backend para rotas sensiveis.
- Restricao regional/empresa aplicada em usuarios, empresas, acerto de estoque e documentos.
- Erros retornam mensagens controladas, sem stack trace para o cliente.

## Webhooks externos

Em producao, webhooks externos precisam de segredo configurado. Sem segredo, a API responde `503`.

- Evolution API: `EVOLUTION_WEBHOOK_SECRET`
- Z-API: `ZAPI_WEBHOOK_SECRET`
- WhatsApp oficial:
  - verificacao GET: `WHATSAPP_OFFICIAL_VERIFY_TOKEN`
  - callback POST: `WHATSAPP_OFFICIAL_WEBHOOK_SECRET`

O segredo deve ser enviado em um destes locais:

- Header: `x-retiradas-webhook-secret`
- Header alternativo: `x-webhook-secret`
- Header alternativo: `x-api-key`
- Query string: `?secret=...`

## Upload de documentos

- Upload de documentos aceita apenas PDF.
- Validacao em duas camadas:
  - MIME e extensao `.pdf` no multer.
  - assinatura binaria `%PDF-` no buffer.
- Limites configuraveis:
  - `DOCUMENTOS_UPLOAD_LIMIT_BYTES`
  - `DOCUMENTOS_UPLOAD_MAX_FILES`
- Frontend nao acessa Google Drive diretamente; tudo passa pelo backend.
- Banco salva metadados; arquivo fica no Google Drive.

## Infraestrutura

- PostgreSQL local, nao exposto publicamente.
- Aplicacao gerenciada por systemd como usuario sem privilegios administrativos.
- Firewall UFW ativo com portas publicas esperadas: 22, 80 e 443.
- Fail2ban ativo para SSH.
- SSH configurado para chave publica e sem senha.
- Backups PostgreSQL automatizados com retencao e criptografia quando `DB_BACKUP_AGE_RECIPIENT` esta configurado.

## Checklist antes da avaliacao

- Confirmar que `/etc/retiradas/api.env` possui segredos longos para webhooks.
- Confirmar que `.env`, JSON de Service Account e tokens nao estao versionados.
- Confirmar que `curl https://retiradas.tech/api/health` retorna OK.
- Confirmar que callbacks sem segredo retornam 401 ou 503.
- Confirmar que upload `.txt` ou PDF sem assinatura `%PDF-` retorna 400.
- Confirmar que usuario de uma empresa nao acessa documentos de outra empresa.
- Confirmar que supervisor nao acessa dados fora da regional.
