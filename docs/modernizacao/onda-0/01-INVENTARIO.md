# Inventario da observabilidade

Data: 2026-11-02

| Area | Implementacao |
| --- | --- |
| HTTP | `api/src/metrics.js` e middleware em `api/src/app.js` |
| PostgreSQL/RLS | `api/src/db.js` |
| Integracoes | `api/src/equipmentSerialLookup.js` |
| Jobs | `api/src/hubsoftSyncProfiles.js` e `equipmentRecovery/equipmentRecoveryService.js` |
| Persistencia | migrations `025`, `098` e `113` |
| Painel | `MaintenancePortal.jsx` e `maintenanceService.js` |

A coleta padrao e agregada por hora. A coleta detalhada de requisicoes e SQL
continua desabilitada por padrao (`METRICS_ENABLED=false`). Nao ha payloads,
parametros SQL, telefone, e-mail ou nome de cliente nos agregados.

