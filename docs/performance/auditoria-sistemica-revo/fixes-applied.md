# Correções aplicadas

| Correção | Antes reproduzido | Depois automatizado | Métrica de produção |
| --- | --- | --- | --- |
| Cache stale-while-revalidate | Duas leituras expiradas podiam esperar reconstrução | 50 consumidores compartilham uma carga; falha preserva snapshot | P50/P95/P99, SQL por acesso e `X-Cache-*` |
| Resumo operacional | ~19,75 SQL por acesso na janela pré-deploy | Cache por data, resposta anterior durante refresh | SQL/acesso e latência de `/operational-summary` |
| Notificação explícita | ID de outro usuário podia ser enviado pelo frontend | IDs são relidos e filtrados por usuário/cargo/regional/empresa | 403/5xx e auditoria de leitura indevida |
| Marcar todas | Uma notificação chegada durante a operação podia entrar no update amplo | Update usa apenas IDs visíveis selecionados antes da gravação | Contagem lida versus selecionada |
| Scheduler HubSoft | Falhas repetidas em rajada | Backoff persistido, sucesso separado de tentativa | Chamadas, falhas, timeouts e duração MAPA/MATCH |
| LOJA duplicada | Duas execuções no mesmo tick | Guarda testada impede duplicação | Execuções LOJA por ciclo |
| GPS Android | Aplicativo só ativava rastreamento | APK 1.0.6 para o técnico desativar e apagar o token local | Eventos de presença após desativação |

Sessões e auditoria foram deliberadamente excluídas deste pacote.
