# Etapa 1 - Validacao

## Testes direcionados

Comando:

```bash
npm test -- --run \
  apps/retiradas/frontend/src/backend/equipmentSerialLookup.test.js \
  apps/retiradas/frontend/src/pages/Acompanhamento/hooks/useAcompanhamentoResumoData.test.jsx \
  apps/retiradas/frontend/src/backend/agendamentosRepository.test.js \
  apps/retiradas/frontend/src/backend/publicDashboard.test.js
```

Resultado: 4 arquivos e 17 testes aprovados.

Cobertura funcional direcionada:

- duas operacoes simultaneas usam um loader;
- consulta HubSoft recebe `AbortSignal` de timeout;
- montagem do hook faz uma unica requisicao sem evento de atualizacao;
- contratos normalizados de agendamentos permanecem validos;
- compactacao e cache do dashboard permanecem validos.

## Lint direcionado

ESLint aprovado nos quatro arquivos de codigo/teste alterados.

## Validacao completa do produto

Executada no worktree isolado, usando as dependencias ja instaladas no repositorio
principal por junction local ignorada pelo Git:

- `npm run lint:retiradas`: aprovado;
- `npm run test:retiradas`: 100 arquivos e 578 testes aprovados;
- `npm run build:retiradas`: aprovado;
- `npm run test:contracts`: 11 testes aprovados.

O build manteve apenas os avisos preexistentes de chunks grandes e uso de
`eval` pelo `exceljs`; nenhum erro novo foi introduzido.

## Planos PostgreSQL

Executados apenas `EXPLAIN (ANALYZE, BUFFERS)` de SELECT em producao. Nenhuma
escrita, DDL ou carga agressiva foi executada. Resultados registrados no
baseline.

## Comparacao

| Endpoint | Baseline | Resultado apos correcao | Variacao | Evidencia |
|---|---|---|---|---|
| `/api/acompanhamento/resumo` | 2 chamadas na montagem; media prod. 523,85 ms | 1 chamada na montagem; latencia prod. nao medida | -50% de chamadas iniciais | teste do hook |
| `/api/integrations/sempre/equipment/serial` | 2 loaders para 2 chamadas concorrentes iguais; latencia prod. nao medida | 1 loader; timeout HTTP 30 s | -50% de trabalho no cenario concorrente | teste unitario |
| `/api/agendamentos/` | media prod. 150,59 ms; SQL completo 2,249 ms | nao alterado | nao medido | telemetria + EXPLAIN |
| `/api/documents` | media prod. 102,82 ms | nao alterado | nao medido | telemetria + EXPLAIN |

Nao existe medicao de producao apos a correcao porque o escopo proibe deploy
automatico. A comparacao de latencia real deve ocorrer em homologacao com a
mesma janela e aquecimento.

## Checklist antes da homologacao

- lint, testes, build e contratos: concluidos;
- smoke autenticado de consulta serial valida e invalida;
- duas consultas simultaneas do mesmo serial;
- abertura e permanencia de `/acompanhamento` por mais de 60 s;
- confirmar eventos realtime de agendamento e metas;
- comparar Onda 0 por pelo menos uma hora apos aquecimento.
