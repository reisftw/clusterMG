# Bugs encontrados

| ID | Gravidade | Modulo | Evidencia e causa raiz | Status |
|---|---|---|---|---|
| AUD-001 | P0 | API/documentos | `/api/public/documents` entregava registros completos de `ordens_abertas`, `match_os_abertas` e `ordens_legadas`; a lista incluia telefone, endereco, coordenadas e equipamento. Faltava autenticacao. | Corrigido |
| AUD-002 | P0 | Migrations | `schema_migrations` usava somente o numero como chave. Existem dois arquivos `013` e dois `067`; o segundo podia ser ignorado. | Corrigido |
| AUD-003 | P1 | Migrations | Duas publicacoes podiam executar migrations simultaneamente por falta de advisory lock global. | Corrigido |
| AUD-004 | P1 | Migrations | Transacoes de migration nao tinham `lock_timeout` nem `statement_timeout`, podendo bloquear indefinidamente. | Corrigido |
| AUD-005 | P1 | Maps | Trocas rapidas de filtro permitiam que uma resposta antiga sobrescrevesse o estado mais novo. | Corrigido |
| AUD-006 | P1 | Maps/GPS | Cada atualizacao de posicao iniciava uma nova navegacao sem cancelamento ou distancia minima. | Corrigido |
| AUD-007 | P2 | Mobile/modal | `ModalShell` prendia foco, mas nao bloqueava a rolagem da pagina por tras. | Corrigido |
| AUD-008 | P2 | PWA | `/painel/agentes` estava no prefixo publico, mas fora da lista permitida e era redirecionado. | Corrigido |
| AUD-009 | P1 | Meta webhook | O consumidor nao possui claim atomico antes de processar; duas instancias podem processar o mesmo evento. | Pendente: exige alteracao de persistencia |
| AUD-010 | P1 | HubSoft jobs | Locks identificados como `system` podem ser liberados por outra instancia no startup. | Pendente: exige identidade de instancia |
| AUD-011 | P1 | Evolution | A fila confirma consumo mesmo quando o processamento final falha. | Pendente: exige estrategia de retry/DLQ |
| AUD-012 | P1 | Integracoes | Chamadas HubSoft/Evolution sem timeout explicito em caminhos auditados. | Pendente: validar SLA antes de alterar |
| AUD-013 | P2 | Maps | Marcadores sao removidos e recriados em atualizacoes completas, elevando custo com milhares de pontos. | Pendente: requer benchmark visual |
| AUD-014 | P2 | PWA | Atualizacao do service worker recarrega imediatamente e pode interromper formulario em edicao. | Pendente: requer UX de atualizacao |
| AUD-015 | P2 | Deploy/rollback | Rollback de aplicacao nao restaura automaticamente schema alterado. | Documentado; nao automatizado por seguranca |

Nenhum dos itens pendentes foi mascarado com fallback silencioso.

