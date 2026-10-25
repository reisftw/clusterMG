# WhatsApp Cloud API

## Escopo

A integração oficial da Meta fica isolada em `Configurações > WhatsApp`. O gateway
produtivo da Mensageria não muda durante os testes. A migration `099` cria apenas
configuração não secreta, destinatários autorizados, templates, testes, eventos de
webhook e auditoria da troca de provedor.

Identificadores iniciais do ambiente de teste:

- Meta App ID: `1962923281088011`
- WABA ID: `2099063160707050`
- Phone Number ID: `1162045177001452`

## Segredos

Configure os segredos no ambiente do backend:

```env
META_ACCESS_TOKEN=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_CLOUD_PRODUCTION_ENABLED=false
```

O Access Token é obtido no painel do aplicativo Meta/WhatsApp em **API Setup** ou
por um usuário de sistema no Business Manager. O App Secret fica em
**Meta for Developers > App settings > Basic**. Nenhum desses valores é retornado
pela API administrativa; o painel mostra somente se estão configurados.

O verify token pode ser definido diretamente no ambiente. Se estiver ausente, o
painel pode gerar um valor aleatório exibido uma única vez; somente o hash é salvo.

## Webhook

Callback público:

```text
https://retiradas.tech/api/integrations/whatsapp/meta/webhook
```

O `GET` valida `hub.verify_token`. O `POST` exige `X-Hub-Signature-256`, calculado
com `META_APP_SECRET`, deduplica eventos e processa os registros de forma
assíncrona. Enquanto o App Secret não estiver configurado, os eventos são
recusados com HTTP 503.

## Testes

1. Aplique a migration `099_whatsapp_cloud_api.sql` no fluxo oficial.
2. Configure `META_ACCESS_TOKEN` no serviço do backend.
3. Cadastre no painel Meta os destinatários permitidos para o número de teste.
4. Cadastre os mesmos números em `Configurações > WhatsApp > Testes`.
5. Valide a conexão e sincronize os templates.
6. Envie um teste somente pelo botão explícito, após marcar a confirmação.
7. Configure o webhook e acompanhe eventos de entrega e leitura.

## Ativação e rollback

O botão de ativação permanece bloqueado para o número de teste. Em produção, ele
revalida credenciais, número, WABA, webhook, templates, consentimento, teste e fila.
A troca usa trava no PostgreSQL, é idempotente e registra operador e motivo. O
rollback exige permissão própria, motivo e fila sem mensagens em processamento.
