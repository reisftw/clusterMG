# Mercado de Retiradas - Discovery tecnico

> Nota V3: a implementacao final deve reaproveitar usuarios, cargos, permissoes
> e empresas existentes. Qualquer referencia exploratoria anterior a tabelas ou
> cargos paralelos foi descartada em favor da estrutura existente do Retiradas.

Data: 2026-10-14  
Branch auditada: `homolog-dev`  
Commit auditado: `06bc53655de0d1ec69edcade7e24ad2f1ed97110`  
Escopo desta fase: Fase 0, discovery e desenho tecnico antes de alterar codigo funcional.

## Objetivo

Criar o modulo Mercado de Retiradas em `/mercado`, reaproveitando login, sessoes, usuarios, RBAC, auditoria, configuracoes e integracoes existentes do Retiradas, mas com experiencia operacional propria: layout independente, sidebar propria, dashboards, marketplace de lotes, execucao por terceirizadas, SLA, suspensoes, financeiro e auditoria.

Esta fase nao implementa telas nem migrations funcionais. Ela documenta a arquitetura real encontrada e define a trilha segura para as proximas fases.

## Arquitetura atual encontrada

### Frontend

- Roteamento central em `apps/retiradas/frontend/src/router/AppRouter.jsx`, usando `BrowserRouter`, `AuthProvider`, `ProtectedRoute` e `PageWrapper`.
- Constantes de rotas em `apps/retiradas/frontend/src/router/routes.js`.
- `ProtectedRoute` valida usuario autenticado e permissoes por `hasAnyPermission`.
- `AuthContext` reutiliza `useAuth`, aplica simulacao de cargos para admin e injeta permissoes efetivas do cargo selecionado.
- Layout principal fica em `apps/retiradas/frontend/src/components/layout/PageWrapper.jsx`, com sidebar/topbar/footer, modal de troca de senha, modal obrigatorio de autenticador e modal de boas-vindas.
- Menu principal fica em `apps/retiradas/frontend/src/components/layout/Sidebar.jsx` e e muito acoplado ao Retiradas. O Mercado nao deve depender desse menu para preservar a experiencia propria solicitada.
- API client principal fica em `apps/retiradas/frontend/src/services/vpsApiClient.js`. Ele ja trata `homolog.retiradas.tech` como origin dinamica, mas ainda tem fallback historico para `https://retiradas.tech/api`. O Mercado deve usar sempre `window.location.origin + /api` em homolog/producao para evitar hardcode de dominio.
- Configuracoes atuais ficam em modulos sob `apps/retiradas/frontend/src/modules/configuracoes` e integracoes como HubSoft ficam em `apps/retiradas/frontend/src/modules/hubsoft`.

### Backend

- API principal esta em `apps/retiradas/backend/api/src/app.js`.
- Autenticacao central em `apps/retiradas/backend/api/src/auth.js`; `requireAuthenticated` valida JWT, sessao ativa, `session_version`, usuario ativo e injeta contexto no banco.
- RBAC no backend usa `requireAnyPermission`, `hasPermission` e fallback por cargo. Admin tem acesso total.
- Catalogo de permissoes em `app_permissions`, criado por `apps/retiradas/backend/sql/017_rbac_permission_catalog.sql`.
- Cargos e permissoes em `app_roles` e `app_role_permissions`, criados por `apps/retiradas/backend/sql/013_roles_permissions.sql`.
- Auditoria fica em `apps/retiradas/backend/api/src/auditLog.js`, com mascaramento de campos sensiveis, labels humanos e captura de contexto por request.
- Documentos genericos ficam em `apps/retiradas/backend/api/src/documents.js`, armazenando dados em `app_documents`, com cache e dual-write para algumas colecoes.
- Rotas modulares ja sao usadas, por exemplo `/api/mensageria`, `/api/evidencias`, `/api/agendamentos`, `/api/movimentacoes`, `/api/admin/hubsoft`.
- Health/realtime e eventos ja existem em rotas compartilhadas.

### Dados e integracoes aproveitaveis

- Base normalizada de ordens em `ordens_servico`, migration `040_ordens_normalizacao.sql`.
- Relacionamentos de Match em `ordens_match_relacionamentos`.
- Cancelamentos mensais em `service_order_cancellation_records`, migration `074_service_order_cancellations.sql`.
- Recuperacao de equipamentos em `equipment_recovery_snapshots`, migration `072_equipment_recovery.sql`.
- Integracao HubSoft e automacoes em `hubsoftIntegration`, `hubsoftSyncProfiles` e rotas administrativas de HubSoft.
- Movimentacoes de estoque em modulos `movimentacoes*`.

## Decisao tecnica recomendada

### Frontend

Criar um modulo isolado:

- `apps/retiradas/frontend/src/modules/mercado`
- `MercadoLayout.jsx`: layout proprio, sidebar propria, header proprio e responsividade mobile/PWA.
- `MercadoDashboardPage.jsx`
- `MercadoLotesPage.jsx`
- `MercadoExecucaoPage.jsx`
- `MercadoBackofficePage.jsx`
- `MercadoFinanceiroPage.jsx`
- `MercadoAuditoriaPage.jsx`
- `MercadoConfiguracoesPanel.jsx` apenas como componente embutido dentro das Configuracoes existentes do Retiradas, nao como rota `/mercado/configuracoes`.

As rotas `/mercado/*` devem ficar dentro de `AuthProvider` e `ProtectedRoute`, mas fora do `PageWrapper` padrao. Isso preserva login, MFA, sessao, token, usuario e permissoes, sem herdar o menu do Retiradas.

### Backend

Criar modulo backend proprio:

- `apps/retiradas/backend/api/src/mercado/routes.js`
- `apps/retiradas/backend/api/src/mercado/repository.js`
- `apps/retiradas/backend/api/src/mercado/service.js`
- `apps/retiradas/backend/api/src/mercado/financeiro.js`
- `apps/retiradas/backend/api/src/mercado/sla.js`
- `apps/retiradas/backend/api/src/mercado/audit.js`

Montagem sugerida:

- `/api/mercado/dashboard`
- `/api/mercado/lotes`
- `/api/mercado/lotes/:id`
- `/api/mercado/lotes/:id/aceitar`
- `/api/mercado/lotes/:id/os/:ordemId`
- `/api/mercado/execucao`
- `/api/mercado/backoffice`
- `/api/mercado/financeiro`
- `/api/mercado/auditoria`
- `/api/admin/mercado/config` ou `/api/mercado/config`, protegido por `mercado.config.manage`

### Banco de dados

Criar migration nova, provavelmente `apps/retiradas/backend/sql/076_mercado.sql`, com tabelas normalizadas. Proposta inicial:

- `mercado_empresas`: cadastro operacional de empresas aptas ao Mercado, vinculavel a empresas existentes quando houver.
- `mercado_empresa_usuarios`: vinculo usuario/empresa/perfil operacional.
- `mercado_config_versions`: parametros versionados de mercado, SLA, comissao, multa, janela de execucao e politicas financeiras.
- `mercado_lotes`: lotes ofertados no marketplace, status, regional, cidade, regras e prazos.
- `mercado_lote_os`: ordens dentro do lote, copiando referencias importantes de `ordens_servico` e snapshot operacional para auditoria.
- `mercado_lote_eventos`: timeline de eventos de lote e aceite.
- `mercado_tentativas`: tentativas de contato/retirada por O.S.
- `mercado_agendamentos`: agendamentos de execucao por O.S.
- `mercado_evidencias`: evidencias de execucao, fotos, assinatura, observacoes e validacoes.
- `mercado_suspensoes`: suspensoes e bloqueios por empresa/lote/O.S.
- `mercado_aprovacoes`: analise BackOffice, aprovacao, reprovacao e motivo.
- `mercado_financeiro_apuracoes`: consolidacao financeira por periodo/empresa/lote.
- `mercado_financeiro_lancamentos`: detalhes de credito/debito, penalidades e ajustes.

Pontos obrigatorios:

- Aceite de lote deve usar transacao e lock para impedir duas empresas aceitarem o mesmo lote ao mesmo tempo.
- Status deve ser controlado por backend, nao por frontend.
- Eventos e snapshots precisam preservar contexto do momento do aceite e da execucao.
- Configuracoes financeiras devem ser versionadas para nao recalcular meses antigos com regra nova.

## RBAC proposto

Adicionar permissoes ao catalogo `app_permissions`:

- `mercado.dashboard.view`
- `mercado.lotes.view`
- `mercado.lotes.manage`
- `mercado.lotes.accept`
- `mercado.execucao.view`
- `mercado.execucao.manage`
- `mercado.backoffice.view`
- `mercado.backoffice.manage`
- `mercado.financeiro.view`
- `mercado.financeiro.manage`
- `mercado.auditoria.view`
- `mercado.config.view`
- `mercado.config.manage`

Cargos operacionais sugeridos:

- `mercado_admin`: acesso completo ao Mercado, sem equivaler necessariamente ao admin global.
- `mercado_gestor`: gestao de lotes, backoffice e dashboards.
- `mercado_backoffice`: analise, aprovacao, suspensao e tratativas.
- `mercado_terceirizada`: visualizacao de lotes disponiveis, aceite e execucao.
- `mercado_financeiro`: apuracao e relatorios financeiros.
- `mercado_auditor`: leitura de logs, evidencias e historico.

Admin global continua com acesso total por regra existente.

## Configuracoes

Nao criar `/mercado/configuracoes`.

O painel de configuracao do Mercado deve entrar dentro das Configuracoes existentes do Retiradas, em uma nova secao "Mercado". A persistencia deve combinar:

- `app_documents` apenas para configuracoes simples e preferenciais.
- `mercado_config_versions` para parametros que impactam financeiro, SLA, multa, regras de elegibilidade e calculos historicos.

Permissoes:

- leitura: `mercado.config.view`
- alteracao: `mercado.config.manage`

Toda alteracao deve registrar auditoria humana via `auditLog`.

## Riscos encontrados

- Escopo grande demais para uma unica entrega segura. Deve ser faseado.
- Usar apenas `app_documents` geraria risco de concorrencia, relatorios lentos e auditoria fraca para lote/financeiro.
- Aceite simultaneo de lotes exige transacao no banco.
- Regras financeiras precisam de versionamento; caso contrario meses passados podem mudar quando a regra atual for editada.
- Integracoes com HubSoft/Playwright nao devem bloquear requests de tela. Devem rodar por job/worker ou fila interna.
- Exposicao de dados de cliente antes do aceite precisa de regra clara. Marketplace pode mostrar resumo e liberar detalhes completos apos aceite.
- O frontend ainda possui historico de dominio hardcoded. Mercado deve nascer usando origin relativa/dinamica.
- O menu atual e muito especifico do Retiradas; reutiliza-lo para Mercado deixaria a ferramenta confusa.
- A branch tem arquivos untracked de checksum antigos; nao foram alterados nesta fase.

## Plano da Fase 1

Entregavel recomendado para a proxima fase:

1. Criar migration `076_mercado.sql` com schema minimo, permissoes e cargos.
2. Criar modulo backend `/api/mercado` com health interno, dashboard vazio, listagem inicial de lotes e config basica.
3. Criar modulo frontend `/mercado` com layout proprio, dashboard inicial, menu proprio e estados vazios.
4. Adicionar entrada "Mercado" no sistema principal apenas como atalho, se desejado, protegido por permissao.
5. Adicionar secao "Mercado" em Configuracoes existentes, sem rota propria dentro de `/mercado`.
6. Testar build frontend, testes unitarios relevantes e health local.

## Checkpoint da Fase 0

Implementado:

- Discovery da arquitetura real do frontend, backend, RBAC, auditoria, configuracoes e dados existentes.
- Documento tecnico desta fase.
- Nenhuma migration funcional criada.
- Nenhuma tela criada.
- Nenhuma rota funcional criada.
- Nenhum deploy executado.
- Nenhum push executado.

Arquivos criados:

- `docs/MERCADO-RETIRADAS-DISCOVERY.md`

Testes:

- Nao aplicavel nesta fase, pois nao houve alteracao funcional.

Pendencias para seguir:

- Validar se os cargos `mercado_*` devem ser novos cargos reais ou se as permissoes serao anexadas aos cargos atuais.
- Definir se empresas terceirizadas do Mercado reutilizam `empresas` existente ou terao cadastro dedicado com vinculo opcional.
- Confirmar quais dados do cliente podem aparecer antes do aceite.
- Confirmar regra financeira inicial e campos obrigatorios de evidencia.

Proxima fase sugerida:

- Fase 1 - fundacao tecnica do Mercado em homolog-dev.
