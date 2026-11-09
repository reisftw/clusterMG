# Inventário auditado

Escopo estático em 2026-11-09: Retiradas, backend compartilhado com Mercado e infraestrutura de release. Operação, ADM e Financeiro não foram alterados.

| Item | Quantidade observada |
| --- | ---: |
| Páginas React (`*Page`) | 88 |
| Serviços/clientes frontend | 76 |
| Arquivos JavaScript do backend | 157 |
| Declarações de rotas HTTP | 503 |
| Ocorrências de timers/schedulers | 247 |

Áreas encontradas: dashboard, acompanhamento, diário/metas, agendamentos, documentos, estoque, movimentações, recuperação de ativos, mapa legado, Maps V2, tentativas, mensageria/Evolution, WhatsApp Cloud, notificações/push, ordens de serviço, comprovantes, multas, cancelamentos, relatórios, ranking, manutenção, configurações e integrações HubSoft/AutoISP.

O inventário é uma contagem estática de candidatos. Nem toda ocorrência de timer representa polling ativo e nem toda declaração de rota é uma operação pública independente.
