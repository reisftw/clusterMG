# Mapa de dependências

| Tela | Requisição principal | Serviço | Fonte/trabalho |
| --- | --- | --- | --- |
| Dashboard/Acompanhamento | `/api/acompanhamento/resumo` | `publicDashboard` | Documentos e agregados PostgreSQL; cache compartilhado no processo |
| Acompanhamento operacional | `/api/acompanhamento/operational-summary` | `mapSyncUpdatesService` | Snapshot MAPA, ranking e agregados PostgreSQL |
| Painel público | `/api/public/dashboard` | `publicDashboard` | Agregados PostgreSQL; cache compartilhado no processo |
| Maps | `/api/maps/*` | `mapsV2` | Snapshots geocodificados, solicitações e presença |
| Tentativas | `/api/tentativas/*` | `tentativasService` | Oportunidades persistidas e distribuição |
| Recuperação de ativos | `/api/equipment-recovery/*` | `equipmentRecoveryService` | Snapshot conciliado persistido |
| Notificações | `/api/notifications/*` | `notificationsService` | `app_documents`, RBAC e push |
| Sincronizações | scheduler interno | `hubsoftSyncProfiles` | HubSoft, locks persistidos e `hubsoft_sync_records` |

As leituras de dashboard não importam nem executam `hubsoftSyncProfiles`. Um teste de arquitetura impede que essa dependência seja introduzida acidentalmente.
