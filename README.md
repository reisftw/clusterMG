# Gestao Retiradas

Aplicação React/Vite para a operação de retirada, com módulos internos de metas, mapa, frota, agenda, usuários e painel público.

## Scripts

- `npm run dev`: sobe o ambiente local com hot reload.
- `npm run lint`: executa o ESLint no projeto inteiro.
- `npm run build`: gera o build de produção.
- `npm test`: executa a suíte do Vitest em modo CI com relatório de cobertura.
- `npm run test:watch`: abre o Vitest em modo interativo para desenvolvimento.
- `npm run seed:admin`: executa o bootstrap único do primeiro usuário administrador via `firebase-admin`.

## Variaveis de ambiente

As variaveis locais do frontend devem ser copiadas de `.env.example` para `.env`, sem versionar valores reais no repositório.

## Bootstrap do administrador

O bootstrap inicial do administrador deve ser feito uma única vez com o script `scripts/seed-admin.js`. O script usa apenas `firebase-admin`, não depende do client SDK e nunca contém credenciais fixas no código.

Pré-requisitos:

- fornecer credenciais administrativas do Firebase via `GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json` ou `FIREBASE_SERVICE_ACCOUNT_JSON='{\"projectId\":\"...\"}'`;
- definir as variáveis `ADMIN_EMAIL` e `ADMIN_PASSWORD`;
- opcionalmente definir `ADMIN_NOME`, `ADMIN_ROLE`, `ADMIN_REGIONAL` e `FIREBASE_PROJECT_ID`.

Exemplo de execução:

```bash
ADMIN_EMAIL=admin@empresa.com \
ADMIN_PASSWORD='uma-senha-forte-e-unica' \
ADMIN_NOME='Administrador Principal' \
ADMIN_ROLE=admin \
ADMIN_REGIONAL='Matriz' \
GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json \
npm run seed:admin
```

O script cria o usuário em `Auth` com `admin.auth().createUser()` e grava o perfil correspondente em `firestore().collection('usuarios')`.

Importante: a senha administrativa anteriormente exposta em código deve ser rotacionada manualmente no console do Firebase antes de reutilizar esse fluxo.

## Primeiro acesso de usuarios

Novos usuarios internos sao criados pela Cloud Function `criarUsuario` com senha temporaria aleatoria e um link de redefinicao de senha para primeiro acesso. O campo legado `trocar_senha` permanece apenas para contas antigas criadas antes dessa migracao e pode ser removido apos a regularizacao desses acessos.

## Testes

A suíte usa `Vitest` + `React Testing Library` + `jsdom`.

Cobertura atual:

- `src/utils/`: cobertura acima de 90% para statements, functions e lines.
- Regras puras críticas: projeção de metas e resumo mensal cobertas com testes dedicados.
- Integrações: autenticação, criação de usuário com mock de Firebase e modais principais.

### Como rodar

```bash
npm test
```

Esse comando:

- executa todos os testes em modo não interativo;
- gera cobertura no terminal;
- falha o processo se os limiares configurados no `vite.config.js` não forem atendidos.

### Como interpretar o resultado

- `Test Files`: quantidade de arquivos de teste executados.
- `Tests`: quantidade total de cenários cobertos.
- `Coverage report`: cobertura dos arquivos monitorados.
- `Statements / Functions / Lines`: métricas principais usadas como base mínima de qualidade.

Se um teste falhar, o Vitest mostra:

- o arquivo e o cenário que falhou;
- a asserção esperada versus o valor recebido;
- stack trace do ponto exato da falha.

Se a cobertura ficar abaixo do mínimo, o comando termina com erro mesmo que todos os testes passem.

## Decisões de estrutura recentes

- `MetasResumoMensal` foi fatiado em `components/`, `hooks/` e `constants/` para separar cálculo, modal, projeção, histórico e KPIs.
- A configuração de testes foi acoplada ao `vite.config.js` para manter Vite e Vitest usando a mesma base de resolução.
- Os testes de integração usam mocks de Firebase e de contexto para validar fluxos sem depender de serviços externos.
