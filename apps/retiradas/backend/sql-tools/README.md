# `vps/sql-tools/` — preflight de migrations

Introduzido na Fase B da otimização técnica (`docs/TECHNICAL-AUDIT.md`,
achado #4). Mesmo padrão já usado em `apps/finan/backend/sql-tools/`
(sistema Finan, separado), adaptado para o app principal.

## Convenção

Para uma migration pendente `vps/sql/0NN_algo.sql`, se existir aqui um
arquivo `preflight_0NN_algo.sql`, o script
`vps/scripts/migration-preflight.js` executa esse arquivo contra o banco
**antes** de qualquer migration ser aplicada (rodado pelo pipeline de
deploy — ver `.github/workflows/ci.yml`, steps `Migration preflight` dos
jobs `deploy-vps`/`deploy-homolog-vps`).

- O preflight é uma query **somente leitura** (nunca `INSERT`/`UPDATE`/
  `DELETE`/`ALTER`).
- Retorna **uma linha por violação encontrada**. Zero linhas = nenhuma
  violação, seguro para aplicar a migration.
- Se qualquer preflight pendente encontrar violação, o pipeline **aborta**
  antes do backup e antes de qualquer migration — nada é alterado no
  banco. Corrija os dados (ou ajuste a migration) e rode de novo.
- Uma migration sem preflight correspondente **não bloqueia** o deploy —
  nem toda migration aditiva (`create table if not exists`, `add column
  if not exists`) precisa de validação prévia. Preflight é obrigatório
  principalmente para migrations que adicionam `NOT NULL`, `CHECK`,
  `UNIQUE` ou `FOREIGN KEY` sobre dados que já existem na tabela.

## Exemplo (a ser usado como modelo pela Fase E)

```sql
-- preflight_0NN_ordens_servico_constraints.sql
-- Verifica se existem ordens_servico.status fora do enum que a nova
-- migration vai fixar via CHECK. Uma linha por violação.
select id, status
from ordens_servico
where status is not null
  and status not in ('aberta', 'concluida', 'cancelada', /* ... */);
```

## Rodar manualmente (antes de aplicar uma migration em produção/homolog)

```bash
cd vps
DATABASE_URL=postgres://... node scripts/migration-preflight.js
```

Sai com código `0` se não houver violações (`1` caso contrário) — mesmo
contrato usado pelo CI.
