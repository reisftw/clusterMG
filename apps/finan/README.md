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
- Reaproveitar apenas admins, usuários financeiros e dados financeiros na carga inicial.
- Não importar usuários gerais do Retiradas para o Finan.
- Não apontar o backend para `DATABASE_URL` do Retiradas.
- Não remover rotas/telas financeiras atuais até o Finan estar validado.
- Usar `FINAN_DATABASE_URL` em produção.

## Carga inicial

Antes de escrever no banco dedicado, rode:

```bash
npm run finan:audit:retiradas
```

Depois, com `FINAN_DATABASE_URL` e `RETIRADAS_DATABASE_URL` definidos:

```bash
npm run finan:migrate:from-retiradas
```

## Próximos passos

1. Criar o banco `finan` na VPS.
2. Rodar as migrations do Finan.
3. Rodar auditoria read-only da base Retiradas.
4. Rodar a carga inicial de admins, usuários financeiros e dados financeiros.
5. Ligar o backend em porta própria.
6. Configurar Nginx para `finan.retirada.tech`.
7. Migrar tela por tela do financeiro atual para componentes nativos do Finan.
