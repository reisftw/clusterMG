# Auditoria Técnica — Sistema de Retiradas

> Fase 0 da missão de otimização completa. Escopo: `src/**` (frontend
> principal) e `vps/**` (backend/scripts/sql). **`apps/finan/**` está fora
> de escopo** — é um sistema separado, com deploy e branch (`finan`)
> próprios, já auditado/tratado em outro processo (`apps/finan/backend/...`,
> ver `docs/DTO-MAPPING.md` naquela branch).
>
> Levantamento 100% read-only, feito por três investigações independentes
> (auth/RBAC/segurança do backend; banco de dados e domínio de OS/
> agendamentos; testes/CI-CD/frontend/PWA). Nenhum arquivo foi alterado até
> este ponto. Classificação de cada achado: **CRÍTICO / ALTO / MÉDIO /
> BAIXO**.
>
> **Sobre autenticação**: por instrução explícita, esta auditoria NÃO propõe
> PIN nem mecanismo de acesso numérico alternativo. A recomendação é
> fortalecer o que já existe (JWT próprio + cookie + Argon2id + revogação
> real de sessão), não substituí-lo.

## Status de execução (atualizado durante a implementação)

- ✅ **Fase A — IDOR** (achado #3): `vps/api/src/security/regionalScope.js`
  aplicado em agendamentos e atendimento (casos/técnicos).
- ✅ **Fase B — Migrations e deploy** (achado #4): preflight
  (`vps/scripts/migration-preflight.js`), backup pré-migration e health
  check adicionados ao pipeline; rollback documentado em
  `docs/DEPLOY-ROLLBACK.md`.
- 🔶 **Fase C — DTO/validação centralizada** (achado #20): infraestrutura
  criada em `vps/api/src/dtos/` (mesmo padrão leve do Finan, sem lib nova).
  Aplicada de ponta a ponta em **agendamentos** (`AgendamentoWriteDTO`,
  `unknownKeys: "reject"`) e em **usuários administrados**
  (`UserAdminUpdateDTO` em `PUT /api/admin/users/:uid`, `unknownKeys:
  "strip"` — ver justificativa no próprio arquivo). **Ordens de serviço**
  ficou de fora nesta rodada: a escrita desse domínio acontece só via
  pipelines de importação em lote (Hubsoft/Sempre/match), não por um
  endpoint simples de criar/editar um registro — um "CreateDTO/UpdateDTO"
  no molde REST não mapeia bem pra esse formato; validar o payload de
  importação é um trabalho diferente, registrado no backlog. **Atendimento**
  já recebeu a correção de IDOR (Fase A) e de status code; uma passada de
  DTO completa nesse arquivo de 3000+ linhas (fluxo de chatbot com estado)
  ficou para uma iteração futura dedicada, dado o risco de regressão maior
  ali.
- ✅ **Fase D — Auditoria** (achado #5): `auditLog.recordAuditLog` adicionado
  em criação/edição/exclusão de agendamentos, casos de atendimento e
  técnicos de atendimento, e criação/restauração de backup de banco
  (`databaseBackupsAdminController.js` — restauração é a ação
  administrativa mais sensível do sistema e não deixava rastro nenhum).
  Verificado: não existe endpoint de escrita direta de config de
  integração (Hubsoft/Cvortex/Senior) fora da camada genérica de
  `documents.js` no app principal — essa camada já audita sozinha, então
  não havia gap real ali (diferente do que a hipótese inicial supunha).
  Mantido o mesmo padrão fire-and-forget já usado no resto do projeto
  (achado #8 — auditoria fora de transação — permanece registrado, não
  resolvido nesta fase; mudar isso exigiria plumbing transacional mais
  amplo, fica para a Fase F).
- 🔶 **Fase E — Banco** (achados #1, #2): `vps/api/src/macUtils.js`
  (normalizador canônico de MAC, forward-only, aplicado em
  `ordensRepository.js`/`migrate-ordens.js`, eliminando duplicação com
  `sempreIntegration.js`). Constraints reais (`FK` pra `regionais`,
  `CHECK` de status/tipo/turno, `UNIQUE` de MAC) **não aplicadas nesta
  sessão** — exigem consultar dados reais de produção/homologação antes
  (mandado explicitamente pela missão), e este ambiente não tem acesso ao
  Postgres real. Relatórios prontos e o plano completo em
  `docs/DATABASE-CONSTRAINTS-PLAN.md`, aguardando alguém com acesso à VPS
  rodar as queries (todas somente leitura) e devolver o resultado.
- ⏳ Fases F (robustez PostgreSQL), G (E2E), H (hardening secundário) e I
  (performance) — pendentes.

---

## Resumo executivo

O backend principal (`vps/api/src`) tem uma base de segurança **bem mais
madura do que a média** de projetos deste porte: JWT com revogação real de
sessão (tabela + `session_version`), upgrade automático de hash de senha
legado, CSRF funcional (não decorativo), nenhuma SQL injection encontrada,
whitelist de ordenação em toda listagem, uploads validados por
MIME+extensão+magic bytes, handler de erro que nunca vaza stack/SQL, e um
pipeline de CI que **de fato** bloqueia deploy em falha de lint/teste/build
e roda `npm audit` + Semgrep + Gitleaks de verdade.

Os problemas reais não estão na fundação de segurança — estão em três
frentes específicas:

1. **Modelagem de dados do domínio operacional** (`ordens_servico`,
   `agendamentos`) ficou com tipagem fraca (texto livre, sem FK/CHECK/
   UNIQUE) herdada do desenho documental antigo, mesmo com o padrão de
   qualidade (`regionais`, `030`) já existindo no projeto para copiar.
2. **Autorização por posse de registro (IDOR)** — em agendamentos e casos
   de atendimento, ter a permissão de "gerenciar" é suficiente para agir
   sobre **qualquer** ID, sem checar se aquele registro pertence à
   regional/escopo do usuário (diferente do módulo de documentos, que faz
   isso corretamente).
3. **Processo de deploy/migration em produção sem rede de segurança**:
   migrations aplicam direto sem preflight nem backup automático antes, sem
   estratégia de rollback, e o único E2E do repo nunca roda no CI.

Nada do que foi encontrado exige reescrever a arquitetura. É trabalho de
**modelagem, escopo de autorização e processo de deploy** — exatamente o
tipo de melhoria incremental que a missão pede.

---

## 1. Arquitetura atual

Fluxo real hoje (confirmado nos três levantamentos):

```
React (Vite/PWA)
   ↓ fetch (vpsApiClient.js)
Express (vps/api/src/app.js — ~5200 linhas, rotas montadas por domínio)
   ↓
Middlewares (helmet, cors, rate-limit, requireAuthenticated, requireCsrfToken)
   ↓
Handler de rota (mistura controller+service — no mesmo arquivo/pasta por domínio)
   ↓
Repository (agendamentosRepository.js, ordensRepository.js, imoveisRepository.js, ...)
   ↓
PostgreSQL (pg, pool único, vps/api/src/db.js)
```

Não há camada `Controller`/`Service` nomeada e separada como a meta da
missão descreve — os domínios mais recentes e normalizados (agendamentos,
ordens, imóveis, mensageria) já seguem **Route → Repository → PostgreSQL**
com a regra de negócio dentro do handler de rota ou de um arquivo
`*Service.js`/`*.js` próximo (ex.: `documentosService.js`, que é o exemplo
mais maduro de separação real: rota fina → service com regra de posse →
repository). Módulos mais antigos (parte de `app.js`) ainda misturam
handler HTTP + regra de negócio + chamada a repository no mesmo bloco.

**Não existe DTO/validação centralizada** no backend principal — validação
é manual e espalhada, do mesmo jeito que era no Finan antes do trabalho de
DTO feito lá (ver `docs/DTO-MAPPING.md` na branch `finan` como referência
de padrão a replicar aqui, adaptando ao domínio de OS/agendamentos).

---

## 2. Fluxos principais (confirmados)

- **Login**: `POST /api/auth/login` → Turnstile (anti-bot) → rate limit
  (8/15min) → verifica credencial (Argon2id ou PBKDF2 legado + upgrade
  automático) → opcionalmente MFA por e-mail → emite JWT (HMAC-SHA256
  próprio) em cookie `HttpOnly`+`SameSite=Lax`+`Secure` → grava sessão em
  `app_sessions`.
- **Autorização por requisição**: `requireAuthenticated` decodifica o JWT,
  confirma `session_version` bate com o do usuário no banco, popula
  `req.user` com permissões calculadas (role `admin` = acesso total;
  demais via `app_role_permissions`).
- **Escrita mutável**: exige `requireCsrfToken` (header `x-csrf-token`
  validado contra HMAC do próprio token de sessão).
- **OS/Match/Agendamentos**: importação de fontes externas (Hubsoft,
  Sempre, etc.) grava em `ordens_servico`/`agendamentos` via chave
  determinística (`collectionPath:source:num_os`) + `ON CONFLICT` — evita
  duplicidade entre reprocessamentos, mesmo sem coluna `external_id`
  nomeada.
- **Documentos**: único módulo com checagem de posse real por
  `empresaId` (`requireEmpresaAccess`) — é o padrão-ouro do projeto pra
  IDOR, deveria ser replicado nos outros domínios.
- **Deploy**: push → `security` + `build-and-test` (paralelos) →
  `deploy-vps`/`deploy-homolog-vps` (dependem dos dois anteriores) → SSH,
  `tar`+`scp`, `npm run migrate:sql` + `migrate:normalized:apply` direto em
  produção, restart do serviço, reload do nginx.

---

## 3. Tabela de achados priorizados

| # | Achado | Área | Severidade |
|---|---|---|---|
| 1 | `ordens_servico`/`agendamentos` sem FK/CHECK/UNIQUE de negócio (status/tipo/regional em texto livre, sem link com `regionais` normalizadas) | Banco | **ALTO** |
| 2 | MAC sem normalização (case/separador) e sem unicidade no banco — duplicidade de equipamento indetectável | Banco | **ALTO** |
| 3 | IDOR em agendamentos (`PUT/DELETE /:id`) e casos de atendimento — permissão de "manage" basta para agir sobre qualquer ID, sem checar regional/escopo | Autorização | **ALTO** |
| 4 | Migrations aplicadas direto em produção sem preflight nem backup automático antes; sem estratégia de rollback | CI/CD, Banco | **ALTO** |
| 5 | Auditoria não cobre exclusão/edição de agendamentos, casos de atendimento, restauração de backup, config de integrações | Auditoria | **ALTO** |
| 6 | `test:e2e` nunca roda no CI; único E2E do repo é HTTP puro (sem UI), não cobre login/logout/criação de OS/permissão via tela | Testes | **ALTO** |
| 7 | TTL de sessão de 1 ano com renovação automática silenciosa | Autenticação | **MÉDIO** |
| 8 | Auditoria gravada fora de transação da operação principal, erro só logado (não propagado) | Auditoria, Banco | **MÉDIO** |
| 9 | Falta transação explícita no fluxo agendamento→log→esteira do cliente (multi-tabela) | Banco | **MÉDIO** |
| 10 | `SELECT *` sem `LIMIT` em tabelas de histórico (`agendamentos_logs`, `imoveis*`) | Performance, Banco | **MÉDIO** |
| 11 | Pool `pg` sem `max`/timeouts configurados, sem handler de erro no `Pool` | Banco, Observabilidade | **MÉDIO** |
| 12 | Domínios inteiros sem teste de frontend (agendamentos, cancelamentos, técnicos, usuários/cargos, mapa/match como componentes) | Testes | **MÉDIO** |
| 13 | Endpoints públicos de leitura sem rate limit dedicado (`/api/public/dashboard`, `/api/public/static/:domain`) | Segurança | **MÉDIO** |
| 14 | `GET /api/events` (SSE) sem `requireAuthenticated` | Autorização | **BAIXO** |
| 15 | Componentes de painel público com 900–1300 linhas, sem virtualização, fetch/polling sem paginação | Performance | **BAIXO** |
| 16 | Duplicidade de prefixo de migration `013` (dois arquivos) | Banco | **BAIXO** |
| 17 | JWT implementado manualmente em vez de lib madura (`jsonwebtoken`) | Débito técnico | **BAIXO** |
| 18 | `html2pdf.js` instalado e sem uso | Dependências | **BAIXO** |
| 19 | Imóveis: uploads de vídeo/planilha sem checagem de magic bytes (diferente de avatar/documentos) | Uploads | **BAIXO** |
| 20 | Nenhum DTO/validação centralizada no backend principal | Arquitetura | **MÉDIO** (base para várias correções acima) |

**Nenhum item CRÍTICO foi encontrado** — não há SQL injection, não há
segredo hardcoded, não há vazamento de stack/SQL ao cliente, não há
autenticação quebrada, não há upload que permita path traversal ou execução
arbitrária.

---

## 4. Autenticação — detalhe

**O que já está bem feito** (não mexer sem necessidade, por instrução
explícita):
- Argon2id para senha nova; PBKDF2-SHA256 legado com upgrade automático e
  silencioso no login (`auth.js:169-183,511-527`) — exatamente o padrão
  recomendado para não quebrar usuários existentes.
- Revogação de sessão real: tabela `app_sessions` (`jti`) + `session_version`
  em `app_users` — troca de senha/reset revoga todas as sessões.
- Cookie `HttpOnly` + `SameSite=Lax` + `Secure` em produção; CSRF via HMAC
  do próprio token, validado com `timingSafeEqualText` (não é decorativo).
- MFA por e-mail (OTP 6 dígitos) opcional, com limite de tentativas.
- Google OAuth e Okta OIDC com validação de assinatura/`iss`/`aud`/`nonce`.
- Anti-bot (Cloudflare Turnstile) em login/MFA/forgot/reset.

**Achado real (#7, MÉDIO)**: `ACCESS_TOKEN_TTL_SECONDS` default e valor de
produção (`.env.example`) é **31536000 segundos = 1 ano**, com renovação
automática silenciosa sempre que faltam ≤ 7 dias para expirar
(`shouldRenewAuthToken`, `app.js:1903-1908`). Na prática isso é uma sessão
que só termina por logout explícito, troca de senha ou revogação manual —
se um cookie/token vazar, o acesso do atacante dura enquanto a vítima
continuar logada em qualquer lugar.

**Recomendação** (não implementar ainda, só registrar para a fase de
implementação): reduzir o TTL absoluto (ex.: 30–90 dias) e/ou introduzir um
teto de renovação contado a partir do login original (ex.: nunca renovar
além de 6 meses desde o login), mantendo a renovação automática para não
piorar a experiência do usuário. Isso é uma mudança de comportamento
sutil (sessões antigas vão expirar mais cedo) — documentar antes de aplicar,
conforme pedido.

**Débito técnico (#17, BAIXO)**: JWT é implementado manualmente em vez de
usar uma lib madura (`jsonwebtoken`). Funciona e foi revisado, mas qualquer
bug futuro na implementação própria não se beneficia de correções upstream.
Não é urgente — só registrar como possível evolução futura, migração teria
que ser cuidadosa para não invalidar tokens ativos.

---

## 5. Autorização / RBAC / IDOR — detalhe

RBAC é centralizado (`requireRoles`, `requireAnyPermission`,
`hasPermission`) — não há `if (role === 'admin')` espalhado por dezenas de
arquivos, ao contrário do que a missão temia encontrar. O problema real é
mais sutil: **a permissão central não checa posse do registro específico**.

**Padrão-ouro do projeto (documentos)**: `requireEmpresaAccess`/
`canAccessEmpresa` (`documentosService.js`) — antes de servir/alterar um
documento, confirma que o usuário pertence à empresa dona daquele
documento específico. Isso É o modelo a replicar.

**Achado #3 (ALTO)**: `agendamentosRoutes.js` (`PUT/DELETE /:id`) e
`atendimentoRoutes.js` (`PATCH /cases/:id`, `DELETE /technicians/:phone`)
não fazem esse tipo de checagem — qualquer usuário com a permissão de
"gerenciar" (ex.: `supervisor`, `backoffice_retirada`) pode agir sobre
**qualquer** agendamento/caso trocando o ID na URL, mesmo que pertença a
uma regional diferente da sua. Contraste: `PUT /api/admin/users/:uid` já
faz o certo — sobrescreve `nextBody.regional` com o valor do contexto
autenticado quando o ator é `supervisor`, em vez de confiar no que veio do
body.

**Achado #14 (BAIXO)**: `GET /api/events` (SSE) só tem rate limit, sem
`requireAuthenticated`. Payload transmitido é de baixo risco (heartbeat,
nomes genéricos de tópico), mas tecnicamente é uma rota de dados que
qualquer cliente não autenticado pode abrir.

---

## 6. Segurança HTTP — detalhe

Tudo revisado (Helmet, CORS, rate limit, cookies, CSRF) está **bem
implementado**, com uma exceção pontual:

**Achado #13 (MÉDIO)**: `/api/public/dashboard`, `/api/public/static/:domain`,
`/api/public/documents*` não têm rate limit dedicado (mitigado
parcialmente por cache em memória, mas ainda exposto a scraping/DoS de
leitura).

Nada de CORS `*` em produção (boot falha se `CORS_ORIGIN` estiver vazio em
produção), nenhum `SELECT`/`ORDER BY` dinâmico sem whitelist, nenhum
segredo hardcoded.

---

## 7. Banco de dados — detalhe

**Migrations**: 59 arquivos, versionadas em `schema_migrations`, idempotentes
no nível SQL (`if not exists` em tudo), com baseline seguro para bancos
existentes. **Achado #16 (BAIXO)**: dois arquivos com prefixo `013`
(`013_documentos_agentes_midia.sql` e `013_roles_permissions.sql`) —
ambíguo para rastreabilidade, vale renomear um deles em migration futura
(nunca renumerar as já aplicadas).

**Achado #1 (ALTO)**: `ordens_servico`/`agendamentos` têm PK `text`, mas
quase nenhuma outra constraint de negócio — sem FK para `regionais`
(normalizada desde a migration `030`), sem `NOT NULL` em colunas críticas
(`tipo`, `status`, `tecnico`, `mac_addr`), sem `CHECK` de enum em
`status`/`tipo`, sem `UNIQUE` isolada em `num_os`. O padrão de qualidade já
existe no projeto (`regionais`/`regional_cidades` têm FK, CHECK, UNIQUE
funcional) — só não foi aplicado a essas duas tabelas, que carregam
herança do desenho documental (Firestore) anterior.

**Achado #2 (ALTO)**: MAC (`mac_addr`, `phy_addr`, `macs_equipamento`)
passa só por `String(value).trim()` — sem uppercase/lowercase nem remoção
de separador. `AA:BB:CC:DD:EE:FF`, `aa:bb:cc:dd:ee:ff` e `AABBCCDDEEFF` são
tratados como três valores distintos, e não há nenhuma constraint de
unicidade no banco para MAC.

**Achado #9 (MÉDIO)**: módulo de insumos usa transação corretamente
(`BEGIN`/`FOR UPDATE`/`COMMIT`) para estoque+requisição; o fluxo de
agendamento→log→esteira do cliente não tem o mesmo cuidado — cada
gravação é uma chamada independente.

**Achado #8 (MÉDIO)**: `recordAuditLog` grava fora da transação da
operação principal e só loga erro no console se falhar — a trilha de
auditoria pode ficar incompleta silenciosamente.

**Achado #10 (MÉDIO)**: `listAllDocuments`/equivalentes (`agendamentosRepository.js:918`,
`imoveisRepository.js:371+`) fazem `SELECT * ... ORDER BY ...` sem `LIMIT`
em tabelas que só crescem (`agendamentos_logs`, `imoveis`).

**Achado #11 (MÉDIO)**: `db.js` não configura `max`/`idleTimeoutMillis`/
`connectionTimeoutMillis` no `Pool`, e não há `pool.on("error", ...)` —
risco de o processo Node cair silenciosamente numa condição de erro de
conexão ociosa, e requisições travarem indefinidamente em pico de carga em
vez de falhar rápido.

**Pontos positivos a preservar**: dinheiro sempre em `NUMERIC` (nunca
`FLOAT`); idempotência de importação via chave determinística + `ON
CONFLICT`; usuário de aplicação dedicado (`retorninho`, não superuser);
índices bem alinhados às queries reais existentes.

---

## 8. Testes e CI/CD — detalhe

**Achado #6 (ALTO)**: `npm run test:e2e` não é chamado em nenhum lugar do
`ci.yml`. O único arquivo E2E (`tests/e2e/critical-flows.spec.js`) também
não é um E2E de UI de verdade — só faz chamadas HTTP diretas via
`request.newContext` do Playwright, sem navegar página nenhuma. Login via
tela, logout, criação de OS/agendamento por UI, permissão refletida na
tela, e os fluxos de Mapa/Match não têm nenhuma cobertura automatizada.

**Achado #4 (ALTO)**: os três jobs de deploy chamam `migrate:sql` e
`migrate:normalized:apply` direto via SSH, sem dry-run/preflight, e sem
chamar `backup:database` antes. Também não há estratégia de rollback
(sem `releases/<sha>` + symlink, sem passo de reverter).

**Achado #12 (MÉDIO)**: domínios inteiros do frontend sem teste
(agendamentos, cancelamentos, técnicos, usuários/cargos; mapa/match só têm
utilitário puro testado, os componentes de tela não).

**Pontos positivos**: pipeline de segurança roda de verdade (`npm audit` +
Semgrep + Gitleaks, sem `|| true` mascarando falha crítica); lint/teste/
build bloqueiam deploy de fato; boa cobertura em financeiro e nos
repositórios normalizados de backend (agendamentos, imóveis, ordens,
mensageria, auditoria, RBAC).

---

## 9. Frontend / PWA — detalhe

Service worker (`public/sw.js`) está **bem desenhado**: nunca intercepta
`/api/*`, cache-first só em assets estáticos, network-first com fallback
em navegação — nenhuma resposta autenticada é cacheada. Nenhum segredo
exposto via `VITE_*` (só metadados de build, URL pública, DSN do Sentry).

**Achado #15 (BAIXO)**: `TabRetiradas.jsx` (1309 linhas), `TabMatchOS.jsx`
(960 linhas), `MatchUpload.jsx` (691 linhas) são componentes monolíticos
sem virtualização de lista; `useMapaOS`/`useDashboardData` carregam
snapshot completo e fazem polling sem paginação. `MapaPage.jsx` já foi
decomposto em hooks/componentes menores — mesmo padrão deveria ser
replicado nos `Tab*.jsx` do Painel Público.

---

## 10. Validação de dados / DTO

Não existe validação centralizada no backend principal — cada rota valida
manualmente (ou não valida) `req.body`/`req.params`/`req.query`. O padrão
já construído para o Finan (`apps/finan/backend/src/dtos/`, ver
`docs/DTO-MAPPING.md` na branch `finan`) é a referência de como introduzir
isso aqui: schema próprio leve (sem nova dependência), middleware
`validate({body,params,query})` → `req.validated`, `unknownKeys: "reject"`
para anti-mass-assignment, e DTOs de resposta que nunca devolvem `res.json(rows)`
cru quando há campo sensível.

Isso resolveria de quebra parte do achado #1 (FK/CHECK ainda protegem o
banco, mas o DTO evita que um payload malformado sequer chegue lá) e do
achado #3 (um `ParamsDTO` de ID sozinho não resolve IDOR — isso é regra de
negócio/service — mas centralizar validação facilita adicionar a checagem
de posse no mesmo lugar).

---

## 11. Plano de implementação (fases sugeridas)

Não implementado ainda — aguardando sua revisão e priorização antes de
tocar em qualquer código, dado o tamanho da missão e a criticidade do
sistema em produção.

| Fase | Escopo | Justificativa |
|---|---|---|
| **A** | IDOR em agendamentos/atendimento (achado #3) — adicionar checagem de escopo por regional, seguindo o padrão de `documentosService.js` | Maior risco de segurança real encontrado; correção cirúrgica, poucos arquivos |
| **B** | Migration preflight + backup automático antes de aplicar em produção + registrar estratégia de rollback (achado #4) | Reduz risco de qualquer fase seguinte que envolva migration |
| **C** | Auditoria: cobrir agendamentos, casos de atendimento, restauração de backup (achado #5) | Baixo risco de regressão, alto valor de rastreabilidade |
| **D** | DTO/validação centralizada nos endpoints de escrita de agendamentos/OS (achado #20), reaproveitando o padrão do Finan | Base para as próximas correções de banco |
| **E** | Constraints de banco em `ordens_servico`/`agendamentos` (achados #1, #2) — FK para `regionais`, `CHECK` de enum, normalização + unicidade de MAC | Requer migration cuidadosa com preflight (fase B primeiro) e validação de dados existentes antes de aplicar `NOT NULL`/`UNIQUE` |
| **F** | Transações no fluxo agendamento→log→esteira (achado #9), `LIMIT` em listagens sem paginação (achado #10), pool `pg` com timeouts + handler de erro (achado #11) | Robustez, baixo risco |
| **G** | E2E de UI real para os fluxos críticos (login, logout, criação de OS/agendamento, permissão) + habilitar `test:e2e` no CI (achado #6) | Rede de segurança para todas as fases anteriores |
| **H** | TTL de sessão (achado #7) — **mudança de comportamento, documentar e validar com você antes de aplicar** | Explicitamente sinalizado como "documentar antes de introduzir" pela sua própria instrução |
| **I** | Itens BAIXO (migration `013` duplicada, `html2pdf.js` órfão, rate limit em endpoints públicos, magic bytes em upload de imóveis, componentes grandes sem virtualização) | Baixo risco, podem entrar em qualquer fase com folga |

Cada fase, quando executada, seguirá o mesmo rigor já usado no Finan:
testes antes e depois, `npm run lint`, `npm test`, `npm run build`,
validação manual em `homolog-dev`, e só promoção para `master` depois de
tudo verde.

---

## 12. O que NÃO foi encontrado (registrar explicitamente, como pedido)

- Nenhuma SQL injection.
- Nenhum segredo hardcoded no código-fonte.
- Nenhum vazamento de stack trace/SQL/credencial na resposta ao cliente.
- Nenhum CORS `*` em produção.
- Nenhum upload com risco de path traversal ou execução arbitrária.
- Nenhuma dependência backend visivelmente vulnerável sem rodar `npm audit`
  formalmente (não executado nesta fase — recomendado antes da fase de
  implementação, junto com o preflight de segurança do CI já existente).
- Nenhuma necessidade identificada de Redis, filas (BullMQ/Kafka),
  microsserviços, CQRS ou Event Sourcing — os jobs/sincronizações
  existentes (Hubsoft, mensageria) já resolvem seus problemas de
  idempotência via constraint de banco, sem precisar de infraestrutura
  nova.
