# Finan

Sistema financeiro dedicado que será publicado futuramente em `finan.retirada.tech`.

Este app é um workspace novo e isolado dentro do repositório. Ele não remove nem altera o módulo financeiro atual do Retiradas. A estratégia é espelhar, validar e só depois desligar o financeiro antigo.

## Escopo inicial

- Frontend próprio com menu raiz do Finan.
- Backend próprio em Express.
- Banco próprio, separado do banco principal, via `FINAN_DATABASE_URL` ou `FINAN_PG*`.
- Usuários, permissões, sessões, login, MFA e recuperação de senha próprios.
- Configuração de e-mail temporariamente compatível com a infraestrutura atual.
- Estrutura preparada para integrações Hubsoft, Cvortex, Senior e Playground.
- Estrutura preparada para backup dedicado do banco financeiro.

## Menus planejados

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

## Regras de isolamento

- Não usar tabelas de usuário do sistema principal.
- Não apontar o backend para `DATABASE_URL` do Retiradas.
- Não remover rotas/telas financeiras atuais até o Finan estar validado.
- Usar `FINAN_DATABASE_URL` em produção.

## Próximos passos

1. Criar o banco `finan` na VPS.
2. Rodar `apps/finan/backend/sql/001_finan_core.sql`.
3. Ligar o backend em porta própria.
4. Configurar Nginx para `finan.retirada.tech`.
5. Migrar tela por tela do financeiro atual para componentes nativos do Finan.
