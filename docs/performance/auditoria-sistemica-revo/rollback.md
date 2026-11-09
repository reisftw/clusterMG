# Rollback independente

| Componente | Reversão rápida | Reversão de código |
| --- | --- | --- |
| Dashboard público | `PUBLIC_DASHBOARD_BACKGROUND_REFRESH=false` + restart | Reverter commit de cache |
| Resumo operacional | `OPERATIONAL_SUMMARY_BACKGROUND_REFRESH=false` + restart | Reverter commit de cache |
| Backoff HubSoft | `HUBSOFT_FAILURE_RETRY_MINUTES=1`, `HUBSOFT_MAP_MATCH_RETRY_ATTEMPTS=2` | Reverter commit do scheduler |
| Autorização de notificações | Não deve ser desativada; é controle de segurança | Reverter apenas após incidente confirmado e revisão |
| Android GPS | Reativar APK anterior no distribuidor | Publicar versão posterior que reverta a mudança |

O release mantém backup do backend, dump verificado do banco e `PREVIOUS_RELEASE` do frontend. Esta entrega não contém migration e não altera os 5,2 GB históricos de auditoria.
