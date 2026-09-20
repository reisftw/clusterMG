# ADM

Fontes do Administrativo recuperados da VPS em 18/09/2026. O checkout original
`a53ef84` continha uma extração incompleta; o backend, o frontend e as migrações
foram restaurados a partir dos diretórios atuais do servidor.

- [Recuperação da VPS e validação atual](docs/recuperacao-vps.md)
- [Baseline e mapa arquitetural](docs/baseline-arquitetura.md)
- [Operação do serviço](ops/README.md)

Diagnóstico estático, sem instalar pacotes ou acessar banco/serviços:

```sh
node apps/adm/scripts/check-baseline.mjs
```

Execute da raiz do repositório. O comando imprime JSON e retorna código 1 quando
encontra entradas ou imports locais ausentes. A lista `legacyCandidate` indica
somente um arquivo de mesmo caminho no legado, não compatibilidade comprovada.
O diagnóstico não substitui build, lint, testes ou validação de runtime.

Comandos do projeto:

```sh
npm ci --prefix apps/adm/frontend
npm ci --prefix apps/adm/backend
npm run frontend:build --prefix apps/adm
npm run frontend:dev --prefix apps/adm
npm run backend:start --prefix apps/adm
```

O backend exige configuração local de PostgreSQL e autenticação. Credenciais
da produção não foram copiadas. Os manifestos recuperados ainda não definem
scripts de lint ou testes.
