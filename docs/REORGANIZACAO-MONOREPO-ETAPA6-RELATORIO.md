# Etapa 6 — Bloqueadores resolvidos e baseline totalmente verde (relatório final)

## 1. Estado Git inicial e final

- Branch: `refactor/monorepo-quatro-apps` do início ao fim (única branch usada).
- Estado inicial: working tree limpo, no commit `dc34eff` (relatório da Etapa 5).
- Estado final: working tree limpo, 11 commits novos, mesma branch.
- Nenhuma branch criada além do checkpoint `backup/pre-final-green`. Nenhum push, deploy ou migration executado.

## 2. SHA do checkpoint

`backup/pre-final-green` = `dc34effb8e35655867b10b5f348f4fc5ff6aa52e`

## 3. Implementação da feature flag (ADM)

`VITE_ADM_ENABLE_INLINE_COMPANY_TECHNICIANS`, lida via função exportada (mesmo padrão já usado em `vpsApiClient.js`: `String(...).toLowerCase() === "valor"`, calculada a cada chamada, não um `const` fixado no load do módulo):

```js
// apps/adm/frontend/src/modules/empresasTecnicos/inlineTechniciansFlag.js
export function parseInlineCompanyTechniciansFlag(rawValue) {
	return String(rawValue || "").trim().toLowerCase() === "true";
}
export function isInlineCompanyTechniciansEnabled() {
	return parseInlineCompanyTechniciansFlag(
		import.meta.env.VITE_ADM_ENABLE_INLINE_COMPANY_TECHNICIANS,
	);
}
```

A condição constante `{false ? <div>...} : null}` em `EmpresasTecnicosPage.jsx` (bloqueador da Etapa 5) foi substituída por `{isInlineCompanyTechniciansEnabled() ? ... : null}`. Nenhuma UI, handler (`addTecnico`/`removeTecnico`), estado ou dado de `form.tecnicos` foi removido — só a condição de exibição mudou de fixa para configurável. Documentada em `apps/adm/frontend/.env.example` (arquivo que não existia antes desta etapa).

## 4. Comportamento padrão da flag

- Ausente → desativado (equivalente ao `{false ? ...}` anterior).
- `"false"` → desativado.
- `"true"` → ativado.
- Qualquer outro valor (`"1"`, `"yes"`, string vazia, etc.) → desativado.
- Não foi alterada em nenhum `.env` real nesta etapa.

## 5. Testes da flag

8 testes novos, 2 arquivos:

- `inlineTechniciansFlag.test.js` (5 casos): ausente, `"false"`, `"true"`, `"TRUE"`/espaços extras (case-insensitive), valores inválidos (`"1"`, `"yes"`, vazio, `null`).
- `EmpresaForm.inlineTechniciansFlag.test.jsx` (3 casos): seção "Técnicos" oculta com a flag desativada, visível com a flag ativada, `form.tecnicos` preservado no payload de submit independente do estado da flag.

`EmpresaForm` foi exportado nomeadamente de `EmpresasTecnicosPage.jsx` (sem dependência de contexto/serviço externo) para permitir testar a seção isoladamente sem montar a página inteira.

## 6. Causa do código inalcançável em rompimentos

`POST /admin/rompimentos` tinha um `return 400` incondicional seguido de ~25 linhas de `INSERT` nunca executadas. Investigação completa antes de editar (handler, frontend, `buildRompimentoPayload`, `attachments/routes.js`, `apr/routes.js` como comparação, histórico Git):

- Rompimentos anexam imagens via `/admin/attachments` (URL pré-assinada, `rot_image_attachments`), cujo `assertEntityAccess` consulta `rot_rompimentos where id=$1` antes de reservar o upload — a linha do rompimento **precisa existir antes de qualquer imagem poder ser anexada**. Isso torna estruturalmente impossível "criar com imagens já anexadas" num único `POST`.
- O frontend só chama `createRotRompimento` (`POST /`) quando `isEdit=false`, mas `handleNewRompimento` sempre abre primeiro uma tratativa (`POST /draft`) antes de exibir o modal — `isEdit` é sempre `true` na prática. `POST /` era estruturalmente inalcançável pela UI.
- `apr/routes.js` usa um padrão diferente e não relacionado (Multer + blob no Postgres, até 10 fotos no mesmo `POST`) — rompimentos nunca usou Multer; portar esse padrão exigiria trocar a arquitetura de armazenamento (fora do escopo, que proíbe adoção de fluxo de dados amplo).

## 7. Contrato final do endpoint

- `POST /admin/rompimentos`: valida o payload completo (ticket, regional, cidade, pontos A/B, fibra, materiais) → 400 se inválido; se válido, **cria a tratativa** (`status='em_tratativa'`, mesmo papel de `POST /draft` mas aceitando o conjunto completo de campos) → 201.
- `PUT /admin/rompimentos/:id` com `status=concluido`: exige tratativa existente (implícito pelo `:id`), 1 a 10 imagens confirmadas — o mínimo já existia, o **máximo de 10 é novo** nesta etapa (antes só o upload em si limitava via `reserveSlot` em `attachments/routes.js`; agora também explícito e testado no momento da finalização).
- Erros de banco passam por `toClientResponse` (`security/errors.js`, já existente), que sanitiza mensagens de `DatabaseError` reais do driver `pg` sem vazar host/tabela/stack — confirmado com teste, não alterado.
- Nenhuma migration, tabela ou coluna foi alterada. RBAC, escopo regional, autor e timestamps preservados (mesmas checagens `requireRotPermission`/`checkRegional`/`req.rotUser.id` de antes).

## 8. Testes adicionados ao endpoint

`apps/operacao/backend/src/rompimentos/routes.test.js` — 12 casos, servidor Express real em memória (sem banco real, sem R2 real; `db`/`auth` mockados via `require.cache`, mesmo padrão de `warlinho/permissions.test.js`):

1. Sem autenticação → 401
2. Sem permissão → 403
3. Sem tratativa válida (campos ausentes) → 400
4. Ticket vazio → 400
5. Payload malformado (pontos inválidos) → 400
6. Payload válido → 201, cria tratativa (sem código inalcançável)
7. Erro de banco (formato real de `DatabaseError` do driver `pg`) → 500 sanitizado, sem vazar host/tabela/stack
8. Finalizar sem imagem confirmada → 400
9. Finalizar com 1 imagem → 200
10. Finalizar com 10 imagens → 200
11. Finalizar com 11 imagens → 400 (novo limite)
12. Resposta de sucesso compatível com o formato esperado pelo frontend (`{ ok, rompimento: { id, status, imageCount, ... } }`)

Registrado em `test:operacao` (`package.json`). Reexecutado 10 vezes seguidas nesta etapa — 12/12 em todas as execuções.

Erro de storage e de credenciais já tinham cobertura própria e não relacionada a este endpoint (`storage/storage.test.js`, pré-existente) — não duplicado.

## 9. Tratamento da fila offline

Revisão completa do fluxo offline (Fase 6) — nenhuma mudança de código foi necessária, só confirmação com testes novos:

- `isNetworkFailure` (`offlineRotQueue.js`) **já** diferenciava corretamente falha de rede real (`TypeError` do `fetch`, `navigator.onLine=false`) de erro de validação/autenticação/servidor (`requestRotApi` lança `Error` comum com `.status`, nunca `TypeError`, e a mensagem do servidor não bate com o regex de rede/conexão). Confirmado com 6 testes novos (`offlineRotQueue.isNetworkFailure.test.js`) — não havia nenhum antes.
- `buildRompimentoPayload` e o payload do fallback offline continuam idênticos e acessíveis no `catch` de `persist()` — reconfirmado com os 5 testes existentes de `rompimentoPayload.test.js`.
- Achado colateral relevante: `flushQueuedRotActions` (sincronização) usa `createRompimento: createRotRompimento` — o **mesmo** `POST /` corrigido na Fase 3/4. Antes da correção do endpoint, qualquer rompimento enfileirado offline estava condenado a falhar para sempre na sincronização (o endpoint sempre respondia 400). A correção do endpoint corrigiu esse bug de sincronização como efeito colateral, sem exigir nenhuma mudança no frontend.

## 10. Warnings removidos por app

| App | Warnings removidos | Detalhe |
|---|---|---|
| Retiradas | 1 | `cidadesValorAtual` (função recriada a cada render) envolvida em `useCallback` |
| Finan | 22 | Todos "Unused eslint-disable directive" (`no-await-in-loop`, `global-require`, `no-continue`, `react-hooks/exhaustive-deps`) — removidos linha por linha, revisados manualmente (eslint `--fix` deixava uma linha em branco com espaço residual em vez de remover a linha inteira) |
| ADM | 2 | `loadKeys`/`loadDashboard`/`load` (funções chamadas tanto pelo efeito de carga quanto por ações de mutação) envolvidas em `useCallback` com as dependências reais |
| Operação | 17 | 9 diretivas órfãs removidas + 8 `react-hooks/exhaustive-deps` reais, cada um com decisão individual (ver detalhe abaixo) |

**Total: 42 warnings eliminados**, 0 blindly suprimidos sem justificativa técnica específica.

Decisões não triviais na Operação:
- `ImageUploader.jsx`: `onCountChange` (prop) nem sempre chega memoizada do pai — resolvido com um ref sempre atualizado (`onCountChangeRef`), evitando tocar nos 4 pontos de uso do componente.
- `AssetsSecurityPage.jsx` / `SstProtocolDetailPage.jsx`: dependência estreita (`selectedTemplate?.id` / `protocol?.assignedTo`) é intencional — o objeto inteiro é recalculado a cada render; depender dele resetaria estado do usuário sem necessidade. Suprimido com comentário explicando o motivo (não é supressão cega).
- `AuditReportsPage.jsx` / `TicketsPage.jsx`: `x?.y || []` criava uma referência `[]` nova a cada render — envolvido em `useMemo` próprio para estabilizar a dependência de um `useMemo` seguinte.
- `RompimentosPage.jsx`: `handleNewRompimento` envolvida em `useCallback` (chamada também pelo botão "Novo Rompimento", não só pelo efeito).
- `ShiftsPage.jsx`: `activeGlobal` usava `useMemo`, mas `isActive` fecha sobre `Date.now()` (novo a cada render) — o `useMemo` só por `[shifts]` deixava o status "ativo" desatualizado num re-render sem mudança em `shifts`; removido o `useMemo`, alinhando com o padrão já usado por `myActive` (mesmo componente, sem memoização).

## 11. Resultado do lint estrito

| App | `npm run lint:<app>` | `npx eslint apps/<app> --max-warnings=0` |
|---|---|---|
| Retiradas | 0 erros, 0 warnings | ✅ passou |
| Finan | 0 erros, 0 warnings | ✅ passou |
| ADM | 0 erros, 0 warnings | ✅ passou |
| Operação | 0 erros, 0 warnings | ✅ passou |

Nenhum warning exigiu mudança funcional arriscada o suficiente para justificar parar e documentar um bloqueador — todos os 42 foram resolvidos dentro do escopo desta etapa.

## 12. Resultado de todos os testes

| Comando | Resultado |
|---|---|
| `test:retiradas` | 353/353 (63 arquivos) |
| `test:finan` | Sintaxe de 118 arquivos backend, 0 erros (sem suíte de frontend, por natureza do app) |
| `test:adm` | 121/121 (113 + 8 novos da feature flag) |
| `test:operacao` | 42 backend + 13 frontend = 55/55 (inclui os 12 novos de rompimentos + 6 novos de `isNetworkFailure`) |
| `test:contracts` | 2/2 |

## 13. Resultado das repetições

- `test:retiradas`: 3 execuções completas da suíte, 353/353 em todas.
- Testes de rompimentos (`routes.test.js`): 10 execuções isoladas, 12/12 em todas.

## 14. Resultado de todos os builds

`build:retiradas`, `build:finan`, `build:adm`, `build:operacao` — todos concluídos com sucesso (código 0). Warnings de build pré-existentes e não relacionados a esta etapa (chunks grandes, `eval` dentro de `exceljs` minificado, diretiva `"use client"` do `react-router` em bundling) — nenhum é erro, nenhum bloqueia.

## 15. Resultado de cada `verify:<app>`

`verify:retiradas`, `verify:finan`, `verify:adm`, `verify:operacao` — todos com código de saída 0 (lint + test + build encadeados, sem pular nenhuma etapa).

## 16. Resultado de `verify:all`

Código de saída 0. Encadeamento completo: `verify:retiradas && verify:finan && verify:adm && verify:operacao && test:contracts` — nenhum comando foi alterado para pular verificação.

## 17. Gates finais do CI

- `deploy-vps` (Retiradas): depende de `[security, build-and-test]` — já satisfazia o requisito, sem mudança.
- `deploy-finan-vps`: depende de `[security, build-and-test, validate-finan, detect-finan-changes]` — já estava correto desde a Etapa 5, sem mudança.
- `validate-adm` / `validate-operacao`: continuam como jobs de validação apenas, sem job de deploy dependendo deles.
- Único ajuste: comentário desatualizado em `validate-operacao` (ainda citava o `no-unreachable` de `rompimentos/routes.js` como achado pendente — já corrigido nesta etapa) foi atualizado.
- Nenhum comando de deploy, secret, host, porta, usuário, caminho remoto, health check, migration ou condition de branch foi alterado.
- YAML validado (`yaml.safe_load` sem erro) após cada mudança.

## 18. Documentação criada

`docs/technical-notes/etapa6-flag-adm-e-rompimentos.md` — segue o padrão já existente em `docs/technical-notes/` (nota técnica flat em Markdown, sem introduzir estrutura de ADR nova). Registra nome/default/owner/efeito da feature flag do ADM e o contrato final de criação/finalização de rompimentos, incluindo a diferenciação de erro de rede vs. validação na fila offline.

## 19. Resultado do scan de secrets

Diff completo desta etapa (`backup/pre-final-green..HEAD`) varrido por `BEGIN PRIVATE KEY`, `APP_AUTH_SECRET=`, `DATABASE_URL=`, `FINAN_DATABASE_URL=`, `ROT_DATABASE_URL=`, `AWS_SECRET_ACCESS_KEY=`, `R2_SECRET_ACCESS_KEY=` — nenhuma ocorrência. Nenhum `.env` real foi adicionado; o único arquivo novo de configuração (`apps/adm/frontend/.env.example`) contém apenas placeholders.

## 20. Commits criados

```
3d51540 feat(adm): formalize inline technicians feature flag
f926eb3 test(adm): cover inline technicians feature flag
85ee127 fix(operacao): restore reachable rompimento creation flow
cd5f000 test(operacao): cover rompimento creation contract
6ef5d9f fix(operacao): keep invalid payloads out of offline queue
d33847b chore(lint): remove obsolete suppressions in finan
899bea8 chore(lint): remove obsolete suppressions and warnings in adm
8de1790 chore(lint): remove obsolete suppressions and warnings in operacao
480c46c chore(lint): remove obsolete suppressions and warnings in retiradas
55c6d93 chore(ci): update stale validate-operacao comment
5ae514a docs(architecture): record ADM flag and rompimento contract
```

Cada commit isolado por categoria/sistema, nenhum mistura mais de uma responsabilidade (exceto o commit único de CI, que por natureza toca o workflow compartilhado).

## 21. Falhas ou pendências

Nenhuma. Todos os critérios de aceite foram atingidos:

- Bloco do ADM sob feature flag, desativada por padrão, comportamento atual preservado.
- Endpoint de rompimentos com fluxo alcançável; tratativa obrigatória; 1 a 10 imagens obrigatórias; payload inválido → 400; payload válido → persistência; erro de validação não entra na fila offline.
- Testes do contrato passando (12/12, 10x); lint dos 4 apps com 0 erros e 0 warnings; todos os testes passando; todos os builds passando; todos os `verify:<app>` e `verify:all` passando; CI sintaticamente válido com gates corretos.

## 22. Confirmação: branches e stashes intactos

`master`, `finan`, `adm`, `rot` — nenhuma tocada (nenhum `checkout`, `merge` ou alteração nelas nesta etapa). 12 stashes pré-existentes, nenhum aplicado, criado ou removido.

## 23. Confirmação: nenhum push, deploy ou migration

Nenhum `git push` executado. Nenhum deploy manual ou via CI disparado. Nenhuma migration de banco rodada. Nenhuma alteração de DNS, Nginx ou systemd. NPM Workspaces não foi introduzido. Nenhuma promoção para `master`.
