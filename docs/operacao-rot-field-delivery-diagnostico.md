# Evolucao Operacao / ROT / FIELD / DELIVERY - diagnostico e proposta

Data: 2026-09-14

## Premissas

- O sistema publicado em `operacao.retiradas.tech` continua sendo o sistema operacional.
- "ROT" hoje aparece com dois sentidos diferentes: nome historico do sistema e frente operacional ROT.
- A evolucao deve adicionar as frentes `ROT`, `FIELD` e `DELIVERY`, sem criar tres sistemas separados.
- Retiradas deve ser a referencia funcional e arquitetural para regionais, agentes, empresas, tecnicos, RBAC, menu e modulos maduros.
- Nenhuma migration destrutiva deve ser aplicada antes da proposta ser validada.

## Arquitetura encontrada

### Retiradas

Frontend principal:

- `src/router/routes.js`
- `src/router/AppRouter.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/modules/empresasTecnicos`
- `src/modules/entregasTecnicos`
- `src/modules/estoqueIntegrado`
- `src/modules/tecnicosAuditoria`
- `src/modules/regionais`

Backend principal:

- `vps/api/src/app.js`
- `vps/api/src/rolePermissions.js`
- `vps/api/src/security/regionalScope.js`
- `vps/api/src/regionaisRepository.js`
- `vps/api/src/tecnicosBolsaAuditoria.js`
- `vps/api/src/logistica`

Banco principal:

- `vps/sql/013_roles_permissions.sql`
- `vps/sql/017_rbac_permission_catalog.sql`
- `vps/sql/018_tecnicos_bolsa_auditoria.sql`
- `vps/sql/030_regionais_usuarios_normalizacao.sql`
- `vps/sql/007_empresas_tecnicos_from_acerto.sql`

### Operacao atual

Frontend:

- `apps/rot/frontend/src/App.jsx`
- `apps/rot/frontend/src/components/Shell.jsx`
- `apps/rot/frontend/src/pages/admin/*`

Backend:

- `apps/rot/backend/src/auth`
- `apps/rot/backend/src/roles`
- `apps/rot/backend/src/users`
- `apps/rot/backend/src/regionals`
- `apps/rot/backend/src/materials`
- `apps/rot/backend/src/equipments`
- `apps/rot/backend/src/rain`
- `apps/rot/backend/src/rompimentos`
- `apps/rot/backend/src/apr`

Banco:

- `apps/rot/backend/sql/001_rot_core.sql`
- `apps/rot/backend/sql/003_rot_regionals_responsaveis.sql`
- `apps/rot/backend/sql/006_rot_materials.sql`
- `apps/rot/backend/sql/007_rot_fleet_equipments.sql`
- `apps/rot/backend/sql/011_rot_rain_rompimentos.sql`
- `apps/rot/backend/sql/015_rot_apr.sql`

## Diagnostico obrigatorio

### A. Menu

Arvore relevante do Retiradas:

| Grupo | Item | Rota | Permissoes principais | Componente |
| --- | --- | --- | --- | --- |
| Destaque | Dashboard | `/` | `view_dashboard`, `destaque.dashboard.view` | `Dashboard` |
| Estoque | Acerto de Estoque | `/acerto-estoque` | `view_acerto_estoque`, `estoque.acerto_estoque.view/manage` | `AcertoEstoque` |
| Empresas | Cadastro | `/empresas` | `view_empresas_tecnicos`, `empresas.cadastro.view/manage` | `EmpresasTecnicos` |
| Tecnicos | Entrega | `/entregas-tecnicos` | `view_entregas_tecnicos`, `tecnicos.entrega_tecnicos.view/manage` | `EntregasTecnicos` |
| Tecnicos | Bolsa Tecnico | `/tecnicos/auditoria/bolsa-tecnico` | `tecnicos.auditoria_bolsa.view/manage` | `TecnicosBolsaAuditoria` |
| Tecnicos | Relatorios | `/tecnicos/auditoria/relatorios` | `tecnicos.auditoria_bolsa.view/manage` | `TecnicosAuditoriaRelatorios` |
| Configuracao | Regionais | `/regionais` | `view_regionais`, `configuracao.regionais.view/manage` | `Regionais` |
| Configuracao | Agentes | `/agentes` | `view_agentes`, `configuracao.agentes.view/manage` | `Agentes` |

Arvore atual da Operacao:

| Grupo | Item | Rota | Permissoes principais | Componente |
| --- | --- | --- | --- | --- |
| Visao geral | Dashboard | `/` | qualquer usuario autenticado | `DashboardPage` |
| Operacao | Agenda | `/atividades` | `rot.activities.view/manage` | `ActivitiesPage` |
| Operacao | Rompimentos | `/rompimentos` | permissao ainda permissiva no menu | `RompimentosPage` |
| Operacao | APR | `/apr` | permissao ainda permissiva no menu | `AprPage` |
| Operacao | Chuva | `/chuva` | permissao ainda permissiva no menu | `RainPage` |
| Recursos | Equipamentos | `/equipamentos` | permissao ainda permissiva no menu | `EquipmentsPage` |
| Recursos | Materiais | `/materiais` | permissao ainda permissiva no menu | `MaterialsPage` |
| Gestao | Usuarios | `/admin/usuarios` | `rot.users.manage` | `UsersPage` |
| Gestao | Regionais | `/admin/regionais` | `rot.regionals.manage` | `RegionaisPage` |
| Configuracoes | Cargos e Permissoes | `/admin/cargos` | `rot.users.manage` | `RolesPage` |
| Configuracoes | E-mail | `/admin/email` | `rot.settings.manage` | `EmailPage` |

Conclusao: a Operacao ainda nao usa a mesma hierarquia do Retiradas para Empresas, Tecnicos, Estoque e Auditoria. O menu da Operacao tambem mistura "frente operacional" com "recurso" e ainda tem itens sem permissao granular aplicada no menu.

### B. Regionais

Retiradas usa entidade normalizada unica:

- Tabela `regionais`
- Tabela `regional_cidades`
- Tabela `regional_responsaveis`
- Responsaveis aceitos: `lider`, `supervisor`, `backoffice`, `delivery`, `field_service`
- Repositorio `vps/api/src/regionaisRepository.js` hidrata o documento legado e ja expande `gruposOperacionais`.

Operacao usa entidade separada:

- Tabela `rot_regionals`
- Tabela `rot_cities`
- Campo `rot_regionals.responsaveis` como `jsonb`
- Responsaveis fixos atuais: `supervisor_rot`, `supervisor_field`

Decisao aprovada: `regionais` e a fonte canonica de regional, seguindo o modelo maduro do Retiradas. `rot_regionals` nao deve ser mantida como segunda fonte de verdade permanente. Nesta etapa ela permanece apenas por compatibilidade, sem drop e sem sincronizacao bidirecional permanente. A Operacao deve primeiro conseguir consumir o modelo canonico; so depois de validado em producao uma fase futura pode aposentar a estrutura antiga.

### C. Agentes

Retiradas possui modulo proprio:

- Frontend: `src/modules/regionais/components/AgentesPage.jsx`
- Service: `src/modules/regionais/services/agentesService.js`
- Permissoes: `view_agentes`, `manage_agentes`, `configuracao.agentes.view/manage`

Operacao nao possui modulo equivalente de agentes no menu/backend atual. Isso e lacuna antes de FIELD/DELIVERY.

Decisao aprovada: agentes seguem a estrutura funcional do Retiradas. Nao criar uma entidade de agentes especifica da Operacao. O fluxo alvo e `Regional -> Agentes -> Tecnicos`, com `ROT`, `FIELD` e `DELIVERY` apenas como escopo operacional adicional.

### D. Tecnicos

Retiradas concentra empresas e tecnicos em:

- `src/modules/empresasTecnicos/components/EmpresasTecnicosPage.jsx`
- `src/modules/empresasTecnicos/services/empresasTecnicosService.js`
- Migration de backfill: `vps/sql/007_empresas_tecnicos_from_acerto.sql`

Operacao usa `rot_users` como usuario/tecnico e materiais ligados a `rot_users`:

- `rot_users.role_id`
- `rot_users.regional_id`
- `rot_users.city_id`
- `rot_tech_supplies.tech_id`
- `rot_supply_history.tech_id`

Nao existe ainda classificacao operacional formal no cadastro de tecnico (`operationType`, `operationalScope` ou relacao N:N). Antes de adicionar campo simples, precisamos confirmar se o tecnico podera atuar em mais de uma frente. Pela regra do pedido, o desenho deve suportar expansao futura.

### E. RBAC

Retiradas:

- Tabelas `app_roles`, `app_role_permissions`, `app_permissions`
- Catalogo de permissoes em `vps/sql/017_rbac_permission_catalog.sql`
- Middleware e guards em `vps/api/src/app.js`, `src/router/ProtectedRoute.jsx`, `src/constants/roles.js`
- Escopo regional em `vps/api/src/security/regionalScope.js`

Operacao:

- Tabela `rot_roles` com `permissions jsonb`
- Middleware em `apps/rot/backend/src/auth/middleware`
- Frontend `useRotAuth().hasPermission`
- Permissoes namespaced `rot.*`

Risco: ha dois RBACs. O pedido pede "nao criar outro sistema de permissoes"; porem a Operacao ja tem RBAC proprio. A proposta deve decidir entre:

1. manter `rot_roles` como RBAC dedicado, mas importar o mesmo modelo conceitual de catalogo/grupos do Retiradas; ou
2. convergir para catalogo normalizado similar ao Retiradas dentro do banco da Operacao.

A opcao 2 e mais alinhada com "Cargos e Permissoes" robusto e evita strings soltas em JSON.

### F. Cargos

Retiradas:

- `admin`
- `backoffice_retirada`
- `supervisor`
- `supervisor_administrativo`
- `analista_administrativo`
- `backoffice`
- Cargos adicionais via `app_roles`

Operacao:

- `site_admin`
- `manager`
- `coordinator`
- `regional_supervisor`
- `tech_lead`
- `tech_3`
- `tech_2`
- `tech_1`
- `aux`
- Cargos customizados em `rot_roles`

Lacuna: nao ha cargos explicitos por frente operacional (`supervisor_rot`, `supervisor_field`, `supervisor_delivery`, `backoffice_rot`, `backoffice_field`, `backoffice_delivery`). O pedido tambem orienta nao criar cargos demais; melhor usar cargo + escopo operacional em vez de multiplicar roles sem necessidade.

### G. Modulos localizados

| Modulo | Retiradas - arquivos principais | Status na Operacao |
| --- | --- | --- |
| Acerto de Estoque | `src/modules/estoqueIntegrado`, rota `/acerto-estoque` | nao migrado como modulo completo |
| Empresas | `src/modules/empresasTecnicos`, rota `/empresas` | nao migrado; apenas usuarios/regionais proprios |
| Entrega Tecnicos | `src/modules/entregasTecnicos`, rota `/entregas-tecnicos` | parcialmente relacionado a materiais, mas nao equivalente |
| Auditoria Bolsa Tecnico | `src/modules/tecnicosAuditoria`, `vps/api/src/tecnicosBolsaAuditoria.js` | parcialmente relacionado a `rot_inventory_checklists`, mas nao equivalente |
| Relatorios Auditoria | `src/modules/tecnicosAuditoria/components/TecnicosAuditoriaRelatoriosPage.jsx` | nao migrado |

## ROT sistema vs ROT frente operacional

Locais em que ROT significa sistema:

- Nome historico do app em `apps/rot/*`
- Prefixo de tabelas `rot_*`
- Prefixo de permissoes `rot.*`
- Servico/backend `rot-api`

Locais em que ROT deveria significar frente operacional:

- Futuro valor de `operationType = 'ROT'`
- Filtros e escopos de usuarios/tecnicos/supervisores/backoffices
- Responsaveis por regional quando comparados com `FIELD` e `DELIVERY`

Padrao recomendado:

- Manter nomes fisicos existentes `rot_*` por compatibilidade.
- Introduzir dimensao de negocio com nome claro: `operation_type`, `operation_scope` ou `operational_scope`.
- Evitar renome massivo de pastas/servicos agora.

## Proposta antes da migration

### Estrutura atual

```text
OPERACAO atual
├── rot_users
├── rot_roles
├── rot_regionals
├── rot_cities
├── rot_materials / rot_equipments / rot_rompimentos / rot_aprs
└── permissoes em jsonb dentro de rot_roles
```

### Estrutura proposta

```text
OPERACAO
├── usuarios/tecnicos
│   └── escopo operacional: ROT / FIELD / DELIVERY
├── empresas
│   └── entidade unica com relacao N:N com operacoes, regionais e agentes
├── regionais
│   └── fonte unica ou adapter sincronizado com a estrutura normalizada do Retiradas
├── agentes
│   └── entidade unica, nao duplicada por operacao
├── RBAC
│   ├── permissoes catalogadas por grupo
│   ├── cargo
│   ├── regional
│   ├── agente quando aplicavel
│   └── operationType
├── modulos migrados
│   ├── Acerto de Estoque
│   ├── Empresas
│   ├── Entrega Tecnicos
│   ├── Auditoria Bolsa Tecnico
│   └── Relatorios de Auditoria
└── modulos atuais preservados
    ├── Rompimentos
    ├── APR
    ├── Chuva
    ├── Materiais
    └── Equipamentos
```

### Migrations propostas

Fase 1, sem destruir dados:

- Criar tabela de catalogo de permissoes da Operacao, no padrao do Retiradas:
  - `rot_permissions`
  - `rot_role_permissions`
- Backfill a partir de `rot_roles.permissions`.
- Criar constante compartilhada para operacoes:
  - `ROT`
  - `FIELD`
  - `DELIVERY`
- Adicionar suporte de escopo operacional sem obrigar exclusividade:
  - tabela relacional `rot_user_operation_scopes` ou `rot_user_operational_scopes`
  - se validado que tecnico e exclusivo, depois pode simplificar; a direcao segura e N:N.
- Adicionar suporte de operacoes em regionais/agentes/empresas por tabela relacional, nao por colunas booleanas:
  - `rot_regional_operation_scopes`
  - `rot_agent_operation_scopes`
  - `rot_company_operation_scopes`

Fase 2, apos validar dados:

- Importar/adaptar Empresas.
- Importar/adaptar Agentes.
- Importar/adaptar Acerto de Estoque.
- Importar/adaptar Entrega Tecnicos.
- Importar/adaptar Auditoria Bolsa/Relatorios.

### Menu proposto

Usar a hierarquia do Retiradas como base, mas dentro de Operacao. Nao duplicar a mesma capacidade em tres arvores diferentes de ROT/FIELD/DELIVERY. Essas tres frentes sao escopos operacionais, nao obrigatoriamente grupos principais do menu.

```text
VISÃO GERAL
└── Dashboard

OPERAÇÃO
├── Agenda
├── Rompimentos
├── APR
└── Chuva

ESTOQUE
├── Acerto de Estoque
├── Equipamentos
└── Materiais

EMPRESAS
└── Cadastro

TÉCNICOS
├── Entregas
└── Auditoria
    ├── Bolsa do Técnico
    └── Relatórios

GESTÃO
├── Usuários
├── Regionais
├── Agentes
└── demais itens administrativos existentes

CONFIGURAÇÕES
├── Cargos e Permissoes
├── E-mail
└── Logs de Auditoria
```

Observacao: a arvore final deve seguir o comportamento de submenu/recolhivel ja usado no Retiradas. O escopo operacional entra em filtros, permissoes, campos e validacoes; nao como duplicacao de paginas.

## Riscos

- Duplicar regionais entre `regionais` e `rot_regionals`.
- Duplicar empresas/tecnicos em vez de reaproveitar o modulo maduro.
- Criar tres menus/sistemas em vez de uma dimensao operacional.
- Misturar o prefixo tecnico `rot_*` com a frente operacional `ROT`.
- Criar `enum` simples em tecnico e bloquear futuro usuario com multiplos escopos.
- Migrar visual primeiro sem backend validar `operationType`, `regionalId` e `agentId`.

## Sequencia recomendada

1. Validar esta proposta.
2. Criar foundation de `ROT/FIELD/DELIVERY`.
3. Criar RBAC normalizado em paralelo ao atual.
4. Implementar consumo da estrutura canonica de Regionais.
5. Implementar Agentes.
6. Integrar Empresas.
7. Integrar Tecnicos.
8. Migrar Acerto de Estoque.
9. Migrar Entrega Tecnicos.
10. Migrar Auditoria Bolsa.
11. Migrar Relatorios.
12. Ajustar menu.
13. Aplicar campos especificos ROT/FIELD/DELIVERY.
14. Aplicar escopos aos filtros, seguindo a cascata real do Retiradas.
15. Rodar testes de RBAC, regional scope, build frontend e testes backend.
16. Fazer deploy manual com checklist de rollback.

## Placar de fases

- Fase 1 - Diagnostico e desenho: concluida.
- Fase 2 - Base operacional + RBAC normalizado: concluida e aplicada.
- Fase 3 - Rebrand visual Operacao: concluida e aplicada.
- Fase 4 - Regionais canonicas: em fechamento. Migration `020_operacao_regionais_canonicas.sql` criada e API `/api/admin/regionals` ajustada para ler/escrever em `regionais`, `regional_cidades` e `regional_responsaveis`, mantendo espelho em `rot_regionals` e `rot_cities` apenas para compatibilidade durante a transicao.
- Fase 5 - Agentes canonicos: concluida. Migration `021_operacao_agentes_canonicos.sql`, API `/api/admin/agents`, tela `/admin/agentes`, menu Gestao > Agentes e permissoes `rot.agents.view/manage` implementados e aplicados.
- Fase 6 - Empresas: concluida. Migration `022_operacao_empresas_canonicas.sql`, API `/api/admin/companies`, tela `/admin/empresas`, menu Gestao > Empresas, permissoes `rot.companies.view/manage` e painel de teste das APIs internas em Integracoes implementados e aplicados.
- Fase 7 - Tecnicos: pendente.
- Fase 8 - Acerto de Estoque: pendente.
- Fase 9 - Entrega Tecnicos: pendente.
- Fase 10 - Auditoria Bolsa: pendente.
- Fase 11 - Relatorios de Auditoria: pendente.
- Fase 12 - Menu final e permissoes por escopo: pendente.
- Fase 13 - QA geral e deploy final: pendente.

## Rollback conceitual

- Como a Fase 1 deve ser additive-only, rollback e:
  - remover novas rotas do menu;
  - desativar permissoes novas;
  - manter tabelas novas sem uso ate proxima janela;
  - restaurar build anterior do frontend e reiniciar backend.

Nenhuma tabela existente deve ser dropada ou alterada destrutivamente sem autorizacao explicita.
