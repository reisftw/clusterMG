# Webhooks - paths e validacoes preservadas

Este modulo foi extraido de `vps/api/src/app.js` sem alterar nenhum path publico registrado nos provedores externos.

## Segredo comum por `verifyWebhookSecret`

Usado por Evolution, Evolution confirmacao e WhatsApp oficial `POST`.

- Fontes aceitas para o segredo recebido, na mesma ordem anterior:
  - header `x-retiradas-webhook-secret`
  - header `x-webhook-secret`
  - header `x-api-key`
  - query string `secret`
  - body `secret`
- Comparacao: `crypto.timingSafeEqual`, exigindo mesmo tamanho antes de comparar.
- Em producao (`NODE_ENV=production`), se o segredo esperado estiver ausente ou tiver menos de 24 caracteres, retorna `503`.
- Se o segredo recebido nao bater com o esperado, retorna `401` com `Webhook nao autorizado.`.
- Fora de producao, segredo esperado ausente/curto continua liberando a requisicao, como antes.

## Paths preservados

| Provedor | Metodo e path | Validacao atual |
| --- | --- | --- |
| Evolution | `POST /api/webhooks/evolution` | `EVOLUTION_WEBHOOK_SECRET` via `verifyWebhookSecret` |
| Evolution | `POST /api/webhooks/evolution/:event` | `EVOLUTION_WEBHOOK_SECRET` via `verifyWebhookSecret` |
| Evolution confirmacao | `POST /api/webhooks/evolution-confirmacao` | `EVOLUTION_CONFIRMATION_WEBHOOK_SECRET` via `verifyWebhookSecret` |
| Evolution confirmacao | `POST /api/webhooks/evolution-confirmacao/:event` | `EVOLUTION_CONFIRMATION_WEBHOOK_SECRET` via `verifyWebhookSecret` |
| Cvortex | `POST /api/webhooks/cvortex` | `cvortexIntegration.verifyWebhookSecret(req)` |
| WhatsApp Business Oficial | `GET /api/webhooks/whatsapp-official` | Meta verify: `hub.mode=subscribe` + token igual a `WHATSAPP_OFFICIAL_VERIFY_TOKEN` ou `officialWebhookVerifyToken` da config |
| WhatsApp Business Oficial | `POST /api/webhooks/whatsapp-official` | `WHATSAPP_OFFICIAL_WEBHOOK_SECRET` via `verifyWebhookSecret` |

Nao ha handler Hubsoft neste bloco no estado atual do codigo. Se Hubsoft passar a enviar webhook publico, criar path novo em commit separado e registrar aqui.
