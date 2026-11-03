# Ciclo 1 — segurança de métricas SQL

Data: 2026-11-02  
Escopo: apenas `apps/retiradas/backend/api/src/metrics.js` e seu teste unitário.

## Correção realizada

- `query_text` passa a conter o template SQL sem comentários, strings, literais
  numéricos, booleanos, nulos ou blocos dollar-quoted.
- Erros de query detalhada são persistidos somente como `query_error`; a
  mensagem original não entra na telemetria.
- Templates SQL detalhados ficam limitados a 200 por hora/processo (mínimo
  configurável de 20); excedentes são agregados como `SQL_OTHER`.
- Uma requisição de sucesso deixa `last_error_code` vazio, em vez de gravar
  `unknown`.

## Evidência isolada

`node -e "require('./apps/retiradas/backend/api/src/metrics.test.js')"`
aprovou 9 testes, incluindo redação de literais/comentários, rótulo estático
de erro, saturação de cardinalidade e ausência de erro em resposta 200.

`node --check apps/retiradas/backend/api/src/metrics.js` e `git diff --check`
também foram aprovados.

O comando convencional `node --test ...` não pôde iniciar o worker no sandbox
local (`spawn EPERM`). O mesmo arquivo foi carregado diretamente pelo Node,
executando os testes `node:test` no processo atual; isso não substitui a
execução usual em CI.

## Limites deste ciclo

Não houve acesso a banco, migration, deploy, integração externa ou baseline
produtiva. A validação de migration/flush/rollback em PostgreSQL descartável
permanece pendente para os próximos ciclos.
