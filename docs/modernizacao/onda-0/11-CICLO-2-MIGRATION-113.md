# Ciclo 2 — migration 113 (Onda 0.1)

Data: 2026-11-02  
Escopo: somente o DDL versionado e sua compatibilidade de upgrade da
observabilidade. Nenhuma migration foi aplicada fora de um banco descartável.

## Correções

- `113_observability_wave0.sql` mantém o `ALTER ... ADD COLUMN IF NOT EXISTS`
  da tabela legada `maintenance_route_metrics_hourly` e cria a tabela agregada
  de operações de forma idempotente.
- A nova tabela passou a ter RLS e política `FOR ALL` limitada a
  `app_security.is_admin()`, igual à fronteira administrativa de
  `metrics_requests` e `metrics_queries` definida pela migration 026.
- `metrics.js` não emite mais `CREATE`, `ALTER` ou `DROP` durante a
  inicialização. As migrations 025, 098 e 113 são a fonte exclusiva do DDL;
  portanto ativar o código antes de aplicar a 113 não cria silenciosamente um
  schema incompleto.

## Evidência local

- `node --check` passou para `metrics.js` e os dois testes da migration.
- `node apps/retiradas/backend/sql/113_observability_wave0.test.js` passou:
  compatibilidade de colunas, RLS/política e ausência de DDL em runtime.
- `git diff --check` passou.

## Upgrade, flush e rollback isolados

O teste `113_observability_wave0.integration.test.js` executa, quando recebe
`OBSERVABILITY_TEST_DATABASE_URL`, os seguintes passos em schema temporário
aleatório: cria o formato legado, aplica a 113 duas vezes, faz um upsert de
flush da tabela de operações e confirma que um insert pré-113 na tabela legada
continua válido. Ao final remove apenas esse schema temporário.

Ele ficou **não executado** neste ciclo: não há PostgreSQL descartável
autorizado/configurado (`OBSERVABILITY_TEST_DATABASE_URL` ausente) e não há
`psql` nem Docker local. Não foi tentada conexão externa nem lido qualquer
arquivo `.env`.

Para liberar essa validação, fornecer uma URL de um PostgreSQL explicitamente
descartável, com permissão de criar/remover schemas, somente para a execução:

```powershell
$env:OBSERVABILITY_TEST_DATABASE_URL = '<url-do-banco-descartavel>'
node apps/retiradas/backend/sql/113_observability_wave0.integration.test.js
```

O rollback documentado é de aplicação: desabilitar `OBSERVABILITY_ENABLED` ou
retornar ao código anterior. A migration é estritamente aditiva e deve
permanecer aplicada; não há `DROP` automático.
