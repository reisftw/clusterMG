# Tentativas de contato

Modulo operacional para tentativa manual de contato com clientes que ainda estao em aberto no Match.

## Fonte de dados

- A fonte unica e a base normalizada `ordens_servico` com `source_collection = 'match_os_abertas'`.
- A sincronizacao materializa esses registros em `tentativas_opportunities`.
- Tipos `CANCELAMENTO - OUTROS` e `RETIRADA - OUTROS` nao entram na esteira.
- Quando uma O.S sai do Match, a oportunidade e marcada como inativa, preservando historico.

## Limite com Mensageria

Este modulo nao envia WhatsApp pela Evolution e nao altera fila, enviados, callbacks ou automacoes da mensageria.
O contato e sempre manual: o sistema monta a mensagem, abre `wa.me` no dispositivo do usuario e registra somente o resultado confirmado pelo operador.

## Fluxo

1. Tecnico acessa `/tentativas`.
2. Escolhe a cidade da sua rota.
3. Clica em `Contatar`.
4. O sistema registra `WHATSAPP_OPENED` e abre WhatsApp com a mensagem pronta.
5. Ao voltar, o tecnico informa se enviou e qual foi o resultado.
6. Indicadores e historico passam a refletir cobertura, resposta, agendamento e retirada.

## Principais tabelas

- `tentativas_settings`: politica de intervalo, meta e limites.
- `tentativas_templates`: mensagens por tentativa.
- `tentativas_opportunities`: clientes elegiveis vindos do Match.
- `tentativas_technician_cities`: cidades associadas a tecnicos.
- `tentativas_assignments`: atribuicao ativa da oportunidade.
- `tentativas_contacts`: linha do tempo das tentativas.
- `tentativas_campaigns` e `tentativas_campaign_items`: campanhas pontuais.

## Permissoes

- `tentativas.visualizar`
- `tentativas.executar`
- `tentativas.historico.visualizar`
- `tentativas.distribuir`
- `tentativas.campanhas.gerenciar`
- `tentativas.templates.gerenciar`
- `tentativas.configuracoes.gerenciar`
- `tentativas.relatorio.exportar`
- `tentativas.override`

## Endpoints

- `GET /api/tentativas/cidades`
- `GET /api/tentativas/minha-rota`
- `GET /api/tentativas/:id`
- `POST /api/tentativas/:id/iniciar`
- `POST /api/tentativas/contacts/:id/resultado`
- `GET /api/tentativas/historico`
- `GET /api/tentativas/historico/export.csv`
- `GET /api/tentativas/admin/resumo`
- `GET /api/tentativas/admin/ranking`
- `GET /api/tentativas/admin/distribuicao`
- `GET|POST /api/tentativas/admin/cidades-tecnicos`
- `DELETE /api/tentativas/admin/cidades-tecnicos/:id`
- `GET|POST /api/tentativas/admin/templates`
- `GET|PUT /api/tentativas/admin/configuracoes`
- `POST /api/tentativas/admin/campanhas`

