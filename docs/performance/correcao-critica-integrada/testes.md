# Testes

## Executados antes do deploy

- ESLint de frontend e backend: aprovado.
- Vitest completo: 106 arquivos, 601 testes aprovados.
- Contratos: 11 testes aprovados.
- Build Vite de producao: aprovado.
- Testes focados de pagina, retry e movimentacoes: 27 aprovados.
- Testes Node de webhook e periodo: 3 aprovados.
- `git diff --check`: aprovado.

## PostgreSQL

O computador de desenvolvimento nao possui PostgreSQL nem Docker. O teste de idempotencia da migration foi executado no PostgreSQL isolado do CI e aprovado antes da publicacao. A migration foi aplicada em producao exclusivamente pelo workflow oficial.

## CI e release

- PR Retiradas: run `42331540329`, aprovado.
- PR Mercado: run `42331540190`, aprovado.
- Master Retiradas: run `42331841051`, aprovado.
- Master Mercado: run `42331841037`, aprovado.
- Release de producao: run `42332182726`, aprovado.

## Casos cobertos

- Intervalo atravessando outubro e novembro.
- Periodo invertido rejeitado.
- Dedupe do webhook pelo identificador do provedor.
- Paginacao 25/50/100.
- Retry somente de MAPA/MATCH incompletos.
- Backoff exponencial, jitter e teto.
