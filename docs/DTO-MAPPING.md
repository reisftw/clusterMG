# DTOs no backend do Finan — mapeamento, fase 1 e fase 2

> Escopo: só `apps/finan/backend` (JavaScript/CommonJS, **sem migração para
> TypeScript** — DTOs aqui são funções de validação/transformação, não
> interfaces). Este documento é o relatório pedido antes de qualquer
> alteração de código, seguido do resumo do que foi de fato implementado.
>
> **Fase 1**: cargos, usuários, integrações, configurações (seção 7).
> **Fase 2**: Calendário Financeiro — eventos, regras, feriados, cor de
> prioridade (seção 7, marcados "✅ Fase 2"). Critério de escolha da fase 2:
> os dois itens do backlog da fase 1 marcados como "já validados
> manualmente, baixo esforço para formalizar" — calendário entrou porque
> lida com campos sensíveis (`notify_role_ids`, alvo de notificação por
> cargo); `financeiro/equipe` ficou fora por ora (seção 12) porque seu
> `normalizeXInput` já atinge o mesmo padrão de qualidade que os DTOs
> trazem, então o ganho marginal de reescrevê-lo agora é baixo frente ao
> risco de regressão num módulo que já funciona bem.

## 1. Por que DTO aqui

Antes deste trabalho, **nenhuma biblioteca de validação** existia no
backend do Finan (confirmado por grep em `package.json` e em todo `src/` —
sem Joi/Zod/Yup/express-validator). Toda "validação" era manual e dispersa:
dezenas de funções `normalizeX`/`assertX` por módulo, além de handlers que
liam `req.body`/`req.params`/`req.query` quase direto. Isso já causou
problemas reais neste projeto:

- **Vazamento de secret em resposta de escrita** — duas rotas devolviam o
  `req.body` bruto (com `token`/`clientSecret`) na resposta do `PUT`, apesar
  do `GET` equivalente já mascarar corretamente (seção 4).
- **Whitelist de permissão inexistente** em dois lugares que gravam
  `is_admin`/`permissions` de cargo — qualquer ator com
  `finan.usuarios.manage` podia, sem segunda checagem, criar um cargo com
  acesso total ou com uma permissão inventada (seção 4).
- Erros de validação sem formato padronizado — cada endpoint decidia sozinho
  o shape da resposta de erro.

## 2. Arquitetura — DTO ≠ Model/Entity

```
FRONTEND
   │  JSON
   ▼
REQUEST DTO (dtos/*.js + dtos/middleware.js#validate)
   │  valida forma/tipo/limite/enum, filtra campos desconhecidos
   ▼
CONTROLLER / ROUTE HANDLER
   │  le SÓ req.validated.{body,params,query} — nunca req.body cru
   ▼
SERVICE (regra de negócio: ownership, hierarquia, estado)
   │
   ▼
REPOSITORY (SQL parametrizado)
   │
   ▼
POSTGRESQL (constraints reais: NOT NULL, CHECK, FK, UNIQUE)
```

Resposta, espelhado:

```
POSTGRESQL → REPOSITORY → SERVICE → RESPONSE DTO (mascara campo sensível) → CONTROLLER → JSON
```

**DTO não substitui regra de negócio nem constraint do banco.** Exemplos
concretos deste trabalho:
- O DTO de cargo garante que `is_admin` é booleano e que `permissions` só
  contém strings do catálogo — mas **quem pode marcar `is_admin: true`** é
  regra de negócio, verificada no handler (`req.finanUser.is_admin`), não no
  DTO.
- `hierarchy_level` tem `min: 0, max: 999` no DTO (forma), mas a
  comparação "ator só gerencia quem está abaixo dele" (usada no PIN admin,
  `auth/pinAdminRoutes.js`) continua sendo lógica de serviço.
- IDs continuam sendo checados contra o banco via `WHERE id = $1` +
  `rows.length` — o DTO só garante que o formato é plausível antes da query
  rodar (não substitui a constraint `references`/`FK` do Postgres).

## 3. Estrutura de pastas escolhida

O backend do Finan **não é modularizado por domínio de forma consistente**
(alguns módulos têm `routes.js` + `service.js` separados —
`calendario/` —, outros são só um `routes.js` inline — `users/`,
`settings/`, `integrations/`, `compat/`). Não é escopo deste trabalho fazer
uma reestruturação grande. Optou-se por uma pasta plana e leve:

```
apps/finan/backend/src/dtos/
  errors.js       — ValidationError (forma reconhecida por security/errors.js)
  schema.js       — construtor de schema (string/enum/boolean/integer/money/dateOnly/id/arrayOf/jsonObject/object)
  middleware.js   — validate({ body, params, query }) → req.validated
  roleDto.js      — RoleCreateDTO / RoleUpdateDTO / LegacyRoleUpsertDTO
  userDto.js      — IdParamDTO / UserPatchDTO / AdminUserUpdateDTO
  integrationDto.js — ProviderParamDTO / IntegrationConfigUpdateDTO / RawIntegrationConfigDTO
  settingsDto.js  — SectionParamDTO / SectionUpdateDTO
  calendarioDto.js — EventShapeDTO / RuleShapeDTO / HolidayShapeDTO / PriorityColorDTO / LeadTimeDaysDTO (fase 2)

apps/finan/backend/src/rbac/
  permissionCatalog.js — catálogo canônico de permissões (whitelist usada pelos DTOs de cargo)
```

Cada DTO fica perto de onde é usado conceitualmente (um por "recurso":
cargo, usuário, integração, configuração), não um arquivo gigante por rota.
Se o número de módulos com DTO crescer muito, vale reconsiderar
subpastas por domínio (`dtos/users/`, `dtos/financeiro/`) — não fazer isso
agora seria prematuro para o tamanho atual.

## 4. Por que não Zod/Joi/Yup

Nenhuma lib existia. A especificação permite adotar Zod adaptado, mas dado
que:
- os payloads do Finan são pequenos (poucos campos por endpoint, sem
  validação condicional complexa entre campos);
- o padrão mais próximo que já existia no código
  (`financeiroEquipeRepository.js#normalizeXInput`, função pura que valida e
  devolve objeto limpo, lançando erro com `.status`) já resolvia o problema
  sem dependência externa;

optou-se por um construtor de schema mínimo e próprio
(`dtos/schema.js`, ~200 linhas, zero dependências) em vez de adicionar uma
lib nova ao `package.json`. Reavaliar Zod fica registrado como item do
backlog (seção 8) caso os próximos módulos precisem de validação condicional
entre campos, union types, ou schemas muito maiores — onde escrever à mão
deixaria de compensar.

## 5. Formato padronizado de erro de validação

```json
{
  "ok": false,
  "error": "Dados inválidos.",
  "code": "VALIDATION_ERROR",
  "fields": { "hierarchy_level": "Deve ser maior ou igual a 0." }
}
```

`ok: false` e `error` (mensagem legível) são mantidos — é o que o frontend
já lê hoje (`data?.error` em `frontend/src/api/finanApi.js`), então nenhuma
tela quebra. `code` e `fields` são aditivos, para quem quiser consumir erro
por campo no futuro. Implementado em
[`security/errors.js`](../apps/finan/backend/src/security/errors.js) —
`toClientResponse` reconhece `error.code === "VALIDATION_ERROR"` e devolve
esse shape; qualquer outro erro continua exatamente como antes.

## 6. Mass assignment — exemplo concreto tratado

```http
PUT /api/finan/usuarios/roles/analista_financeiro
{ "name": "Analista", "is_admin": true, "empresa_id": "outra-empresa" }
```

Antes: `is_admin`/`empresa_id` eram simplesmente ignorados (nunca chegavam
ao SQL) — a requisição terminava em 200 sem nenhum sinal de que algo
suspeito foi tentado. Depois (`unknownKeys: "reject"` no DTO de cargo):
`empresa_id` não existe no shape → 400 `VALIDATION_ERROR` com
`fields: { empresa_id: "Campo não permitido." }`, **antes** de qualquer
query rodar. `is_admin: true` passa a forma (é booleano), mas o handler
rejeita com 403 se o ator não for ele mesmo admin — checagem de negócio,
não de forma (seção 2).

## 7. Endpoints — tabela de priorização

Critério de prioridade: CRÍTICA/ALTA para o que cria/altera dado financeiro,
usuário, permissão, ID ou payload complexo; MÉDIA para leitura sensível ou
escrita de baixo risco; BAIXA para o resto.

| Endpoint | Método | Handler | Validação atual (antes) | DTO recomendado | Prioridade | Status |
|---|---|---|---|---|---|---|
| `/finan/usuarios/roles` | POST | `users/routes.js` | manual, sem whitelist de permissão/is_admin | `RoleCreateDTO` | CRÍTICA | ✅ Fase 1 |
| `/finan/usuarios/roles/:id` | PATCH | `users/routes.js` | manual, sem whitelist | `RoleUpdateDTO` (partial) | CRÍTICA | ✅ Fase 1 |
| `/admin/roles/:id` | PUT | `compat/routes.js` (legado) | `normalizeFinanPermissions` (aceitava `"*"` sem checagem extra) | `LegacyRoleUpsertDTO` | CRÍTICA | ✅ Fase 1 |
| `/finan/usuarios/:id` | PATCH | `users/routes.js` | manual, ok mas sem rejeitar campo extra | `UserPatchDTO` (partial) | CRÍTICA | ✅ Fase 1 |
| `/admin/users/:id` | PUT | `compat/routes.js` (legado) | manual, sem rejeitar campo extra | `AdminUserUpdateDTO` | CRÍTICA | ✅ Fase 1 |
| `/finan/integracoes/:provider` | PUT | `integrations/routes.js` | só `typeof config === "object"` | `IntegrationConfigUpdateDTO` | ALTA | ✅ Fase 1 |
| `/admin/oauth/:provider` | PUT | `compat/routes.js` (legado) | nenhuma; **vazava secret na resposta** | `RawIntegrationConfigDTO` + resposta mascarada | ALTA | ✅ Fase 1 (+ correção do vazamento) |
| `/admin/{hubsoft,cvortex,senior}/config` | PUT | `compat/routes.js` (legado) | nenhuma; **vazava secret na resposta** | `RawIntegrationConfigDTO` + resposta mascarada | ALTA | ✅ Fase 1 (+ correção do vazamento) |
| `/notifications/preferences` | PUT | `compat/routes.js` (legado) | nenhuma | `RawIntegrationConfigDTO` (reuso — objeto livre, tamanho limitado) | MÉDIA | ✅ Fase 1 |
| `/finan/configuracoes/section/:key` | PUT | `settings/routes.js` | só `typeof value === "object"` | `SectionUpdateDTO` | MÉDIA | ✅ Fase 1 |
| `/financeiro/orcamento/centros-custo` | PUT | `financeiroController.js` | `normalizeCostCentersConfig` (~270 linhas, dentro de `financeiro.js`) | `BudgetCostCentersDTO` (decompor em sub-DTOs: contas, centros, matriz) | CRÍTICA | Backlog |
| `/financeiro/orcamento/dados` | POST | `financeiroController.js` | `normalizeSavedBudgetRows`/`normalizeBudgetDataRow` por linha | `BudgetDataRowDTO` (array) | CRÍTICA | Backlog |
| `/financeiro/orcamento/aprovacoes/:approvalId` | PATCH | `financeiroController.js` | manual (`payload.status\|\|payload.action`) | `BudgetApprovalUpdateDTO` | ALTA | Backlog |
| `/financeiro/gestao-orcamento/dre/import` | POST | `financeiroController.js` | delega pra `financeiroReportsRepository` | `DreImportDTO` | ALTA | Backlog |
| `/financeiro/sheets-config` | PUT | `financeiroController.js` | `mergeSheetsConfig` | `SheetsConfigDTO` | ALTA (pode conter credencial) | Backlog |
| `/financeiro/reports/serasa`, `/reports/tarifas` | POST | `financeiroController.js` | normalização de linha de planilha | `SerasaRowDTO`/`TariffRowDTO` (array) | MÉDIA | Backlog |
| `/financeiro/equipe/*` | POST/PUT/PATCH/DELETE | `financeiroController.js` → `financeiroEquipeRepository.js` | **já tem `normalizeXInput` — o melhor padrão pré-existente** | Formalizar como DTO (baixo esforço, já quase pronto) | MÉDIA | Backlog |
| `/finan/calendario-financeiro/*` (eventos/regras/feriados/prioridades) | POST/PATCH/DELETE | `calendario/routes.js` | já tinha `normalizeEventPayload`/`normalizeRulePayload` com boa validação manual | `EventShapeDTO`/`RuleShapeDTO`/`HolidayShapeDTO` + `PriorityColorDTO` | MÉDIA | ✅ Fase 2 |
| `/finan/pin-admin/:userId/{unlock,reset}` | POST | `auth/pinAdminRoutes.js` | `assertCanManageTarget` (já valida hierarquia) | `UserIdParamDTO` (só formato do param) | BAIXA | Backlog |
| `/finan/auth/pin/*`, `/finan/auth/password/*` | POST | `auth/routes.js` | regex `PIN_PATTERN`, `password.length >= 8` já presentes | `PinSetupDTO`/`PasswordChangeDTO` (padronizar, já validado) | BAIXA | Backlog |
| `/admin/database/backups` | POST | `compat/routes.js` | roda `pg_dump` via `execFile`, sem input do client além de auth | — (sem payload) | BAIXA | Fora de escopo |
| `/finan/orcamento/resumo`, `/detalhes` | GET | `orcamento/routes.js` | `Number(query.ano/mes)`, só leitura | `BudgetQueryDTO` (ano/mes) | BAIXA | Backlog |

## 8. Achados de segurança/consistência registrados

1. **[Corrigido nesta fase]** `PUT /admin/oauth/:provider` e
   `PUT /admin/{hubsoft,cvortex,senior}/config` devolviam `req.body` cru na
   resposta (secret em texto puro), diferente do padrão correto usado em
   `integrations/routes.js`. Agora usam `sanitizeOAuthConfig`/
   `sanitizeIntegrationConfig` também na resposta do `PUT`, não só do `GET`.
2. **[Corrigido nesta fase]** `is_admin`/`hierarchy_level` de cargo eram
   aceitos sem segunda checagem de hierarquia em `users/routes.js` e
   `compat/routes.js`. Adicionado: `is_admin: true` só é aceito se o ator já
   for admin (403 caso contrário). Checagem de `hierarchy_level` completa
   (ator só edita cargo abaixo do seu) **não** foi adicionada agora — está no
   backlog (item 9), por ser mudança de comportamento maior que precisa de
   validação com o time (cargos existentes hoje não têm essa restrição em
   `PATCH /roles/:id`).
3. **[Não corrigido — fora de escopo, registrado]** Duplicação de helpers de
   coerção monetária entre `financeiro.js:121-137` e
   `financeiroBudgetConfigRepository.js:52-68` (quase idênticos). Um módulo
   compartilhado (`dtos/money.js`, já existe `schema.js#money()` com a mesma
   regra de arredondamento) resolveria — fica pro backlog quando o módulo
   financeiro entrar na fase 2.
4. **[Não corrigido — fora de escopo, registrado]** Duplicação de lógica de
   permissão entre `app.js#finanPermissionMatches` e
   `auth/middleware.js#userHasFinanPermission`.
5. **[Não corrigido — fora de escopo, registrado]** `upsertMany` em
   `financeiroBudgetConfigRepository.js`/`financeiroReportsRepository.js`
   deriva colunas do INSERT direto de `Object.keys(rows[0])` — um campo
   extra vazado por um `normalizeX` incompleto vira erro 500 de SQL em vez
   de 400 de validação. Relevante quando o módulo financeiro ganhar DTO.
6. **Nenhum `ORDER BY`/`GROUP BY` dinâmico a partir de `req.query`** foi
   encontrado em nenhum módulo — sem risco de SQL injection por ordenação
   hoje.
7. **`LegacyRoleUpsertDTO` não aceita mais `"*"` em `permissions`** (a
   whitelist do catálogo de permissões não inclui o coringa) — mudança de
   comportamento **deliberada e documentada aqui**: `"*"` já era concedido
   automaticamente a quem tem `is_admin: true`
   (`auth/middleware.js#normalizePublicPermissions`), então um cargo não-admin
   com `"*"` na lista de permissões era uma via alternativa de escalar
   privilégio sem passar pela flag `is_admin`. Nenhum cargo do catálogo
   atual (`PERMISSION_CATALOG`) usa `"*"` como id — a mudança só bloqueia
   uma gravação que já era indevida.

## 9. Dinheiro e datas — mapeamento (sem mudança de estratégia)

- **Dinheiro**: `financeiro.js#toNumber/currency` e
  `financeiroBudgetConfigRepository.js#number/money` fazem parsing manual
  (`"R$ 1.234,56"` → number) e arredondam em ponto flutuante JS
  (`Math.round(x*100)/100`) antes de gravar em coluna `numeric` do Postgres.
  `schema.js#money()` replica a mesma regra de arredondamento para DTOs
  novos, mas **não migra os módulos existentes** — está registrado como
  risco (item 3) para quando o financeiro ganhar DTO.
- **Datas**: o padrão correto e já validado do projeto é o do módulo
  `calendario/` — string `YYYY-MM-DD`, sempre construída com componentes
  locais de `Date` (`getFullYear()/getMonth()/getDate()`), nunca
  `toISOString()`/`new Date(string).toISOString()`. `schema.js#dateOnly()`
  segue exatamente essa convenção. `financeiroBudgetConfigRepository.js#dateOnly()`
  **diverge** disso (usa `new Date(raw).toISOString().slice(0,10)`, que pode
  ter bug de fuso horário) — registrado no backlog, não alterado agora
  (mudar o comportamento de datas do orçamento sem o módulo financeiro ter
  DTO ainda é arriscado e fora do escopo desta fase).

## 10. Testes adicionados

- `src/backend/finan/dtoSchema.test.js` — unitário do construtor de schema
  (`string/enum/boolean/integer/money/dateOnly/id/arrayOf/jsonObject/object`,
  incluindo mass assignment via `unknownKeys`).
- `src/backend/finan/dtoRolesUsers.test.js` — endpoints de cargo (payload
  válido, campo obrigatório ausente, tipo errado, valor fora do intervalo,
  permissão fora do catálogo, campo desconhecido, id de params inválido).
- `src/backend/finan/dtoIntegrationsSettings.test.js` — endpoints de
  integração/configuração (mesma cobertura, incluindo `provider` com
  caractere fora do charset seguro).
- `src/backend/finan/security/massAssignment.test.js` — **atualizado**
  (comportamento mudou de "ignora silenciosamente" para "rejeita com 400";
  ver seção 6) e ampliado com o caso de `is_admin` bloqueado por regra de
  negócio e o caso de payload legítimo continuando a funcionar.
- `src/backend/finan/dtoCalendario.test.js` (fase 2) — evento/regra/feriado/
  cor de prioridade + formato de `:id`, incluindo o caso que motivou a
  reescrita do módulo (`eventDate` no formato `Date.toString()`, não
  `YYYY-MM-DD`) e o item de array inválido em `alertDaysBefore` (antes
  descartado silenciosamente, agora rejeitado).

Todos os 226 testes do backend do Finan passam
(`npx vitest run src/backend/finan`), incluindo os 165 pré-existentes.
`npm run lint -- --quiet` e `npm run finan:frontend:build` também passam
sem erro.

## 11. Compatibilidade com o frontend

Nenhum contrato de request/response mudou de forma incompatível:
- Os DTOs de fase 1 validam exatamente os campos que o frontend já envia
  hoje (conferido em `apps/finan/frontend/src/api/finanApi.js` — `updateFinanUser`,
  `createFinanRole`, `updateFinanRole`, `saveFinanIntegration`,
  `saveFinanSettingSection`).
- O único comportamento novo do lado do cliente: um payload com campo extra
  (que o frontend nunca envia) ou permissão fora do catálogo agora recebe
  400 em vez de ser silenciosamente ignorado — não afeta nenhum fluxo real
  da UI atual.
- A mudança de resposta do `PUT /admin/oauth/:provider` e
  `PUT /admin/{provider}/config` (secret mascarado em vez de cru) é
  estritamente mais segura; a tela correspondente
  (`IntegracoesPage`/config OAuth) já trata `"********"` como "configurado,
  não exibir" — mesmo padrão do `GET` equivalente, que a tela já consome.

## 12. Backlog de migração progressiva

- [ ] `financeiro/orcamento/*` (`saveBudgetCostCenters`, `saveBudgetData`,
      `updateBudgetApproval`) — CRÍTICA
- [ ] `financeiro/gestao-orcamento/dre/*` — ALTA
- [ ] `financeiro/sheets-config`, `/sync`, `/test/:sourceId` — ALTA (pode
      conter credencial de service account)
- [ ] `financeiro/reports/serasa`, `/reports/tarifas` — MÉDIA
- [ ] `financeiro/equipe/*` — MÉDIA (já tem `normalizeXInput`, baixo esforço
      para formalizar como DTO reaproveitando o padrão)
- [x] `calendario-financeiro/*` (eventos/regras/feriados/prioridades) —
      MÉDIA — feito na fase 2 (`dtos/calendarioDto.js`); catálogos de
      tipos/antecedências ainda usam validação inline em
      `calendario/routes.js#catalogRouter` (suficiente, não formalizado)
- [ ] `pin-admin/*`, `auth/pin/*`, `auth/password/*` — BAIXA (já validados
      manualmente, ganho é só padronização)
- [ ] `orcamento/resumo`, `/detalhes` (query DTO de ano/mês) — BAIXA
- [ ] Resolver duplicação de helpers monetários
      (`financeiro.js` vs `financeiroBudgetConfigRepository.js`) reaproveitando
      `dtos/schema.js#money()`
- [ ] Resolver duplicação de lógica de permissão (`app.js` vs
      `auth/middleware.js`)
- [ ] Migrar `financeiroBudgetConfigRepository.js#dateOnly()` para a mesma
      convenção local-date-string do `calendario/` (cuidado: mudança de
      comportamento em fuso horário, precisa de teste de regressão dedicado)
- [ ] Avaliar checagem de `hierarchy_level` completa em
      `PATCH /finan/usuarios/roles/:id` (ator só edita cargo abaixo do seu —
      hoje só o `is_admin` tem essa segunda checagem)
- [ ] Reavaliar adoção de Zod se algum módulo futuro precisar de validação
      condicional entre campos ou union types que o `dtos/schema.js` atual
      não cobre bem
