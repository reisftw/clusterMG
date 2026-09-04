# Plano de Transição do Financeiro para o Finan

## Decisão

Criar um sistema dedicado para o financeiro em `finan.retirada.tech`, com banco, usuários, login, MFA, permissões, sessões e configurações próprios.

O módulo financeiro atual do Retiradas permanece ativo até o Finan estar validado.

## O que reaproveitar

- Dados financeiros atuais.
- Usuários com cargo/permissão financeira.
- Admins.
- Configuração de e-mail atual apenas como ponte temporária.
- Regras já consolidadas de orçamento, Access, FPCP106/FPCP302 e integrações.

## O que não reaproveitar diretamente

- Sessões do sistema principal.
- RBAC geral do Retiradas como fonte final.
- Banco principal como banco operacional do Finan.
- Menu agrupado em "Financeiro".

## Banco próprio

Variáveis:

- `FINAN_DATABASE_URL`
- ou `FINAN_PGHOST`, `FINAN_PGPORT`, `FINAN_PGUSER`, `FINAN_PGPASSWORD`, `FINAN_PGDATABASE`

Migration inicial:

- `apps/finan/backend/sql/001_finan_core.sql`

## Coleta do Retiradas

Script:

- `npm run finan:migrate:from-retiradas`

Variáveis necessárias:

- `FINAN_DATABASE_URL`
- `RETIRADAS_DATABASE_URL`

Esse script coleta:

- `app_users` filtrando admins e usuários financeiros.
- Tabelas normalizadas de orçamento.
- Tabelas de reports/tarifas/Serasa.
- Tabelas de equipe financeira.

Os dados financeiros são salvos inicialmente em `finan_migration_snapshots`, para conferência antes de normalizar definitivamente.

## Menu do Finan

- Dashboard
- Gestão Orçamentária
- Dados Orçamentários
- Orçamento
- DRE
- Aprovações
- Contas a Pagar
- Contas a Receber
- Faturamento
- Notas
- Reports
- Equipe
- Configuração Geral

## Próximas etapas técnicas

- [ ] Criar banco `finan` na VPS.
- [ ] Instalar dependências do backend em `/opt/finan` quando criar o ambiente.
- [ ] Rodar migrations do Finan.
- [ ] Rodar coleta inicial dos usuários financeiros/admins e snapshots financeiros.
- [ ] Implementar MFA por e-mail usando adaptador temporário SMTP atual.
- [ ] Migrar o dashboard real para API/tabelas próprias do Finan.
- [ ] Migrar Gestão Orçamentária real.
- [ ] Migrar Reports, Equipe e integrações.
- [ ] Configurar systemd próprio.
- [ ] Configurar Nginx para `finan.retirada.tech`.
- [ ] Validar lado a lado com o Financeiro atual.
- [ ] Só depois remover/redirecionar o módulo financeiro do Retiradas.
