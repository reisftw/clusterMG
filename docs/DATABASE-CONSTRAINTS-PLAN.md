# Plano de constraints de banco — `ordens_servico` / `agendamentos` / MAC

Fase E da otimização técnica (`docs/TECHNICAL-AUDIT.md`, achados #1 e #2).

## Por que este documento existe em vez de já ter a migration pronta

A missão desta fase é explícita: **"Audite dados existentes antes de
adicionar qualquer constraint"**, **"não crie `UNIQUE(num_os)`
automaticamente sem confirmar a semântica"**, e **"antes de criar UNIQUE:
detectar colisões que serão geradas pela normalização... gerar relatório
das colisões e resolver apenas quando for possível determinar com
segurança qual registro é correto"**.

Eu não tenho acesso ao Postgres real (produção nem homologação) a partir
deste ambiente — só ao código-fonte e ao histórico de migrations. Ou seja,
não consigo eu mesmo rodar o preflight de dados que esta fase exige antes
de qualquer `NOT NULL`/`CHECK`/`UNIQUE`/`FOREIGN KEY`. Fabricar uma
migration "não fiz esse preflight, mas espero que passe" seria exatamente
o tipo de risco que a missão pede pra evitar.

**O que fiz nesta fase, com segurança, sem precisar de acesso ao banco:**
- `vps/api/src/macUtils.js` — normalizador canônico de MAC (12 hex
  maiúsculos, sem separador), aplicado **na escrita** em
  `ordensRepository.js` e `migrate-ordens.js` (forward-only — dados novos
  já entram normalizados e deduplicados; dados antigos não são tocados).
  Eliminei também a duplicação: `sempreIntegration.js` tinha sua própria
  cópia quase idêntica dessa função, isolada — agora as duas usam a mesma
  fonte.
- As queries de relatório abaixo, prontas pra rodar contra o banco real.

**O que fica pendente, exigindo alguém com acesso ao banco:**
1. Rodar as queries de relatório abaixo (todas somente leitura).
2. Se o número de violações for zero (ou puder ser corrigido com
   segurança — ver seção de cada item), me avisar ou aplicar você mesmo
   a migration correspondente (modelo de migration + preflight já
   descrito abaixo, seguindo o mecanismo da Fase B —
   `vps/scripts/migration-preflight.js` — que vai abortar sozinho o
   deploy se os dados mudarem entre a checagem manual e o deploy real).

---

## 1. MAC — relatório de colisão antes de normalizar dados existentes

Query (rodar contra o banco de produção/homologação, só leitura):

```sql
-- Conta quantos grupos de linhas colidiriam se mac_addr/phy_addr fossem
-- normalizados pro formato canonico (uppercase, sem separador) e
-- teriam MAIS DE UM valor original distinto colidindo no mesmo canonico.
-- Isso simula em SQL puro o que macUtils.js#normalizeMac faz em JS.
with normalizado as (
  select
    id,
    num_os,
    mac_addr,
    upper(regexp_replace(coalesce(mac_addr, ''), '[^0-9A-Fa-f]', '', 'g')) as mac_canonico
  from ordens_servico
  where mac_addr is not null and mac_addr <> ''
)
select
  mac_canonico,
  count(*) as linhas,
  count(distinct mac_addr) as formatos_distintos,
  array_agg(distinct mac_addr) as valores_originais,
  array_agg(id) as ids_afetados
from normalizado
where length(mac_canonico) = 12 and mac_canonico <> 'FFFFFFFFFFFF'
group by mac_canonico
having count(distinct mac_addr) > 1
order by linhas desc;
```

- **0 linhas retornadas** → nenhuma colisão de formato (ex.: nunca existiu
  o mesmo MAC gravado como `AA:BB:CC:DD:EE:FF` e `aabbccddeeff` em duas
  linhas diferentes). Backfill seguro: `UPDATE ordens_servico SET mac_addr
  = upper(regexp_replace(mac_addr, '[^0-9A-Fa-f]', '', 'g')) WHERE
  mac_addr IS NOT NULL;` (ainda sem `UNIQUE`).
- **Alguma linha retornada** → existem duas ordens diferentes com o
  "mesmo" MAC em formatos diferentes. **Não decida sozinho qual é
  "a correta"** — isso pode ser duplicidade real de importação (mesmo
  equipamento processado duas vezes por fontes diferentes) ou coincidência
  de digitação. Precisa de alguém que conheça a operação pra revisar
  `ids_afetados` antes de qualquer merge/exclusão.
- **Só depois** de confirmar 0 colisões (ou resolver as existentes): considerar
  `UNIQUE` em `mac_addr` — e mesmo assim, avaliar se deve ser `UNIQUE`
  sozinho ou `UNIQUE(mac_addr) WHERE mac_addr IS NOT NULL` (parcial, já que
  nem toda ordem tem MAC).

## 2. `ordens_servico`/`agendamentos` — órfãos de regional

A tabela `regionais` (migration `030`) é a fonte normalizada; `ordens_servico.regional`
e `agendamentos.regional` continuam texto livre. Antes de considerar uma
FK:

```sql
-- ordens_servico: linhas cuja regional (texto) nao bate com nenhum nome
-- conhecido em regionais (comparação case-insensitive/sem acento, jeito
-- mais permissivo possível antes de considerar "orfao" de verdade).
select os.regional, count(*) as linhas
from ordens_servico os
where os.regional is not null and os.regional <> ''
  and not exists (
    select 1 from regionais r
    where lower(unaccent(r.nome)) = lower(unaccent(os.regional))
  )
group by os.regional
order by linhas desc;

-- mesma checagem pra agendamentos
select a.regional, count(*) as linhas
from agendamentos a
where a.regional is not null and a.regional <> ''
  and not exists (
    select 1 from regionais r
    where lower(unaccent(r.nome)) = lower(unaccent(a.regional))
  )
group by a.regional
order by linhas desc;
```

(Requer a extensão `unaccent` — `create extension if not exists unaccent;`
se ainda não estiver habilitada.)

- **Muitas linhas/valores distintos** (esperado, dado que a coluna sempre
  foi texto livre sem validação) → **não adicionar FK agora**. O valor de
  cada linha retornada aqui vira insumo pra decidir: normalizar o texto
  primeiro (ex.: mapear variações conhecidas pro nome oficial da
  `regionais`), ou aceitar que uma parcela do histórico nunca vai casar
  (ordens muito antigas, regional desativada/renomeada) e usar uma FK
  `NOT VALID` + `ON DELETE SET NULL`, sem exigir 100% de correspondência
  histórica.
- Se o relatório vier **limpo ou quase limpo**, a migration segura é:
  ```sql
  alter table ordens_servico
    add constraint ordens_servico_regional_fkey
    foreign key (regional_id) references regionais(id)
    on delete set null
    not valid; -- nao valida linhas existentes na hora de criar

  -- so depois de confirmar que os dados batem:
  alter table ordens_servico validate constraint ordens_servico_regional_fkey;
  ```
  (Precisa primeiro adicionar uma coluna `regional_id` preenchida a partir
  do texto — outra migration aditiva antes desta, seguindo o padrão do
  item 79 da missão: coluna nova → suporta as duas → migra dado → remove
  antiga numa release posterior.)

## 3. `status`/`tipo` de `ordens_servico` — fora do enum esperado

```sql
select status, count(*) from ordens_servico group by status order by 2 desc;
select tipo, count(*) from ordens_servico group by tipo order by 2 desc;
```

Rodar e comparar contra os valores que o frontend/integração realmente
usam hoje (não assumido aqui — nenhum enum de `status`/`tipo` de OS foi
confirmado durante o mapeamento da Fase 0, diferente de
`agendamentos.status`/`turno`, que já são validados pelo
`AgendamentoWriteDTO` da Fase C contra os valores reais do formulário).
Só depois de ver a distribuição real vale desenhar o `CHECK`.

## 4. `agendamentos.status`/`turno` — já mapeado, ainda não com CHECK

O DTO da Fase C (`vps/api/src/dtos/agendamentoDto.js`) já valida
`status`/`turno` contra os mesmos valores que
`src/modules/agendamentos/constants.js` usa no frontend — isso cobre
**escrita nova**. Dados históricos gravados antes do DTO existir podem ter
valor fora dessa lista. Preflight antes de um `CHECK`:

```sql
select status, count(*) from agendamentos
where status is not null
  and status not in ('Aguardando dia','Enviado ao tecnico','Entregue','Concluido','Nao recolhido','Cancelado')
group by status;

select turno, count(*) from agendamentos
where turno is not null
  and turno not in ('Manha','Tarde','Noite','Integral')
group by turno;
```

Se vier vazio, o `CHECK` é uma migration aditiva segura e pequena.

---

## Resumo do que fazer quando tiver acesso ao banco

1. Rodar as 5 queries acima (seções 1–4).
2. Colar os resultados de volta (pra mim ou pra quem for escrever a
   migration) — cada seção já diz o que decidir dependendo do resultado.
3. Só então escrever a migration real + o preflight pareado
   (`vps/sql/0NN_*.sql` + `vps/sql-tools/preflight_0NN_*.sql`, mecanismo já
   pronto desde a Fase B) — o preflight roda automaticamente no deploy e
   aborta sozinho se os dados mudarem entre a checagem manual e o deploy.
