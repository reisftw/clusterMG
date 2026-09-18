# Mapeamento SonarQube — Sistema de Retiradas

> Levantamento 100% read-only. Nenhuma correção foi aplicada nesta etapa —
> este documento existe para priorizar o trabalho de correção em fases
> futuras, seguindo o mesmo princípio da missão anterior
> (`docs/TECHNICAL-AUDIT.md`): mapear antes de mexer, nunca corrigir às
> cegas em massa.
>
> **Escopo do scan**: `src/**` (frontend) + `vps/api/**` + `vps/scripts/**`
> (backend). `apps/finan/**` excluído (sistema separado, fora de escopo).
> **Dashboard ao vivo**: http://localhost:9000/dashboard?id=retiradas
> (SonarQube rodando localmente via Docker).

## 1. Números atuais (medidos em 2026-09-06)

| Métrica | Valor |
|---|---|
| Linhas de código analisadas | 209.846 |
| Issues abertas (total) | 1.561 |
| Bugs | 11 |
| Vulnerabilidades | 5 |
| Code smells | 1.545 |
| Security hotspots | 0 |
| Duplicação de código | 5,4% |
| Reliability rating | D |
| Security rating | D |
| Maintainability rating | A |
| Débito técnico estimado (Sonar) | ~10.000min (~167h) |
| Cobertura de testes real (frontend, `src/`) | **10,66%** statements / 8,96% branches / 8,74% funções / 10,85% linhas |
| Cobertura de testes (backend, `vps/api`) | **não medida** — ver seção 6 |
| Quality Gate | ❌ ERROR |

Severidade das 1.561 issues abertas: 1.000 MAJOR, 497 MINOR, 61 CRITICAL,
3 INFO, 0 BLOCKER.

**Importante — falsos positivos já verificados e descartados** (não estão
nos números acima porque já estão fechados/não são reais):
- `sonar.py` com "token hardcoded" — achado antigo (17/08), arquivo não
  existe mais no repo, já fechado no Sonar.
- `vps/api/src/auth.js:15` ("senha hardcoded") — é a constante
  `LEGACY_PASSWORD_ALGORITHM = "pbkdf2_sha256"` (nome de algoritmo, não
  senha real).
- 3 usos de `sha1` (`regionaisRepository.js`, `normalizedDualWrite.js`,
  `migrate-regionais-usuarios.js`) flagados como "hash fraco" — são para
  gerar UUID determinístico a partir de um seed, não protegem segredo
  nenhum. Uso benigno, mas ainda aparecem como VULNERABILITY MAJOR/CRITICAL
  porque o Sonar não distingue o contexto — candidatos a serem marcados
  "Won't Fix" no próprio SonarQube (decisão do time, não farei isso
  sozinho).

## 2. Bugs (11 abertos) — todos reais, nenhum introduzido nesta sessão

| Severidade | Arquivo:linha | Problema |
|---|---|---|
| CRITICAL | `vps/scripts/migrate-ordens.js:40` | `.sort()` sem função de comparação — ordena alfabeticamente ao invés de numérico/desejado |
| CRITICAL | `vps/scripts/migrate-imoveis.js:33` | idem |
| CRITICAL | `vps/api/src/financeiroBudgetConfigRepository.js:17` | idem |
| CRITICAL | `vps/scripts/migrate-financeiro-budget-config.js:15` | idem |
| CRITICAL | `vps/api/src/financeiroReportsRepository.js:20` | idem |
| CRITICAL | `vps/scripts/migrate-financeiro-reports.js:16` | idem |
| MAJOR | `vps/api/src/financeiro.js:3620` | `.map(normalizeBudgetDataRow)` passa a função direto — quebra se `.map` chamar com `(item, index, array)` e a função usar os args extras incorretamente |
| MAJOR | `vps/api/src/financeiro.js:4556` | mesmo padrão, `financialAccountPlanToAccount` |
| MAJOR | `src/pages/Terceiros/TerceirosConsultaMacPage.jsx:54` | uso de `BarcodeDetectorConstructor` como valor, não como construtor |
| MINOR | `src/components/layout/Sidebar.jsx:1874` | variável `DIRECT_MENU_DUPLICATE_PATHS` só pode ser vazia nesse ponto (lógica morta ou bug de fluxo) |
| MINOR | `src/pages/Mapa/components/MapaAgentes.jsx:70` | elemento clicável sem listener de teclado (acessibilidade) |

**Prioridade de correção**: os 6 `.sort()` sem comparador são o item de
maior risco real — todos em scripts de migração/repositórios financeiros,
podem produzir ordenação incorreta silenciosa em dado de produção. Fácil
de corrigir (adicionar comparador) e fácil de testar.

## 3. Vulnerabilidades (5 abertas)

| Severidade | Arquivo:linha | Problema | Avaliação |
|---|---|---|---|
| MAJOR | `vps/api/src/financeiro/routes/financeiroRoutes.js:10` | limite de tamanho de payload não configurado explicitamente | Real, vale revisar — outros routers já têm limite explícito |
| CRITICAL | `vps/api/src/regionaisRepository.js:200` | "hash fraco" (sha1) | Falso positivo — ver seção 1 |
| CRITICAL | `vps/api/src/normalizedDualWrite.js:86` | idem | Falso positivo |
| CRITICAL | `vps/scripts/migrate-regionais-usuarios.js:53` | idem | Falso positivo |
| MAJOR | `vps/api/src/auth.js:15` | "senha hardcoded" | Falso positivo — ver seção 1 |

**Único item real de vulnerabilidade a revisar**: o limite de payload em
`financeiroRoutes.js`.

## 4. Code smells (1.545) — por regra, maior concentração

| Ocorrências | Regra | Severidade | O que é |
|---|---|---|---|
| 244 | `javascript:S3358` | MAJOR | Ternários aninhados |
| 188 | `javascript:S7744` | MINOR | Objeto fallback desnecessário em spread (`{...(x \|\| {})}`) |
| 165 | `javascript:S9011` | MAJOR | `<button>` sem atributo `type` explícito |
| 127 | `javascript:S6772` | MAJOR | Espaçamento entre elementos inline não explícito (CSS) |
| 105 | `javascript:S6853` | MAJOR | `<label>` sem texto/controle associado (acessibilidade) |
| 92 | `javascript:S6594` | MINOR | Preferir `RegExp.exec()` a `String.match()` |
| 81 | `javascript:S7781` | MINOR | Preferir `.replaceAll()` a `.replace()` com regex global |
| 77 | `javascript:S8786` | MAJOR | Regex com risco de backtracking não-linear (ReDoS) |
| 54 | `javascript:S3776` | CRITICAL | Complexidade cognitiva de função muito alta |
| 46 | `javascript:S6819` | MAJOR | Preferir tag semântica a `role` ARIA |
| 45 | `css:S7924` | MAJOR | Contraste de cor texto/fundo insuficiente (acessibilidade) |
| 40 | `javascript:S1788` | MAJOR | Parâmetros com valor default devem vir por último |
| 40 | `javascript:S7721` | MAJOR | Função deveria estar no escopo mais alto possível |
| 31 | `javascript:S4624` | MAJOR | Template literals aninhados |
| 20 | `css:S4666` | MAJOR | Seletor CSS duplicado |
| 17 | `javascript:S6479` | MAJOR | `key` de lista JSX usando índice do array |
| 16 | `javascript:S6582` | MINOR | Preferir optional chaining (`?.`) |
| 13 | `javascript:S1481` | MINOR | Variável/função local não usada |
| 31 (agrupado) | `javascript:S7750/S7755/S7756/S7776/S7778/S7780` | MINOR | Modernizações pontuais de API JS (`.find()`, `.at()`, `Set`, `Blob`, etc.) |
| 9 | `javascript:S6551` | MINOR | Objeto/classe coagido a string sem `toString()` |
| 8 | `javascript:S4144` | MAJOR | Funções com implementação idêntica (duplicação) |
| 6 | `javascript:S1854` | MAJOR | Atribuição morta (valor nunca lido) |
| 2 | `javascript:S2871` | CRITICAL | `.sort()`/`.toSorted()` sem comparador (mesmo padrão dos bugs da seção 2, mas classificado como smell aqui) |

Regras com 1–4 ocorrências (débito residual, cauda longa): `S4790`,
`S1874`, `S2004`, `S1135` (`TODO`), `S4030`, `S6848`, `S6749`, `S8980`,
`S6481`, `S7727`, `S107` (função com muitos parâmetros), `S7737`,
`S6754`, `S7763`, `S1128`, `S2068` (segredo suspeito — **vale checar
individualmente**, 1 ocorrência), `S2999`, `S5693`, `S1871`, `S4158`,
`S6035`, `S6478`, `S6557`, `S2589`, `S6353`, `S4165`, `S4138`.

### 4.1. Categorização por tipo de esforço

- **Acessibilidade** (~360 issues): `S9011` (botão sem type), `S6853`
  (label), `S6819` (ARIA), `css:S7924` (contraste). Maior bloco isolado —
  a maioria é mecânica (adicionar `type="button"` em botões que não
  submetem formulário, associar `<label htmlFor>`) mas contraste de cor
  exige decisão de design, não só código.
- **Modernização de sintaxe JS** (~430 issues): `S7744`, `S6594`, `S7781`,
  `S1788`, `S4624`, `S6582`, e o grupo S77xx. Baixo risco, alto volume,
  bom candidato a correção em lote com revisão por amostragem — mas ainda
  assim exige rodar a suíte de testes após cada lote, não tudo de uma vez.
- **Complexidade/manutenibilidade** (~340 issues): `S3358` (ternário
  aninhado), `S3776` (complexidade cognitiva), `S7721` (escopo de
  função). Exige refactor manual caso a caso, maior risco de regressão —
  não é mecânico.
- **Segurança de regex** (77 issues, `S8786`): merece triagem — a maioria
  provavelmente é falso positivo (regex simples que o analisador marca por
  padrão conservador), mas alguns podem ser reais (regex complexa
  processando input de usuário). Precisa ser revisado um por um antes de
  decidir.
- **CSS** (65 issues): `css:S7924` (contraste) + `css:S4666` (seletor
  duplicado). Duplicação é mecânica; contraste exige decisão de design.

## 5. Hotspots por arquivo (top 15 — concentram ~490 das 1.561 issues)

| Issues | Arquivo |
|---|---|
| 87 | `src/modules/financeiro/components/FinanceiroPage.jsx` |
| 65 | `vps/api/src/financeiro.js` |
| 55 | `src/pages/Acompanhamento/AcompanhamentoPage.jsx` |
| 53 | `vps/api/src/evolutionMessaging.js` |
| 41 | `src/pages/Acompanhamento/AcompanhamentoPage.css` |
| 36 | `vps/api/src/financeiro/controllers/financeiroController.js` |
| 33 | `vps/api/src/atendimento/atendimentoService.js` |
| 29 | `vps/api/src/app.js` |
| 23 | `src/modules/ferramentas/components/tabs/TabEmailFechamento.jsx` |
| 21 | `src/components/layout/Sidebar.jsx` |
| 21 | `vps/api/src/agendamentoConfirmacao.js` |
| 19 | `src/modules/ferramentas/components/tabs/TabRegionais.jsx` |
| 18 | `src/modules/financeiro/components/budget/costcenter/CostCenterRegistrationTab.jsx` |
| 18 | `vps/api/src/tecnicosBolsaAuditoria.js` |
| 17 | `src/modules/financeiro/components/equipe/FinanceiroEquipePage.jsx` |

**Atenção explícita**: `FinanceiroPage.jsx` é o maior hotspot (87 issues)
e o `CLAUDE.md` pede cuidado extra nele ("não mexer em grandes
refatorações recentes... sem contexto — várias partes já foram extraídas
para hooks/utils/subcomponentes"). Qualquer correção ali deve ser feita
em lotes pequenos, com teste antes/depois, nunca como refactor amplo.

### 5.1. Distribuição por diretório

| Issues | Diretório |
|---|---|
| 338 | `vps/api/src` (raiz do backend) |
| 160 | `src/modules/ferramentas/components/tabs` |
| 96 | `src/pages/Acompanhamento` |
| 87 | `src/modules/financeiro/components` |
| 50 | `src/pages/Mapa/components` |
| 39 | `src/modules/regionais/components` |
| 38 | `src/modules/auth/components` |
| 37 | `src/modules/metas/components` |
| 36 | `src/modules/mensageria/components` |
| 36 | `vps/api/src/financeiro/controllers` |
| 33 | `vps/api/src/atendimento` |
| 30 | `src/pages/PainelPublico/components` |
| 29 | `src/components/layout` |
| 27 | `src/modules/financeiro/utils` |
| 25 | `src/modules/ferias/components` |

O módulo `ferramentas/components/tabs` (160 issues, majoritariamente
acessibilidade — cada aba tem o mesmo padrão de clique sem teclado) é um
bom candidato a correção em lote única, já que o padrão se repete.

## 6. Cobertura de testes — situação real

- **Frontend (`src/`)**: 10,66% statements, 8,96% branches, 8,74%
  funções, 10,85% linhas (medido via `npm run test:coverage`, Istanbul).
  Configurado em `vite.config.js` com `reporter: ["text", "html", "lcov"]`
  — o `lcov.info` já existe pra alimentar o Sonar, mas o scan desta sessão
  não usou (`sonar.javascript.lcov.reportPaths` foi adicionado agora ao
  `sonar-project.properties`, então o **próximo** scan vai refletir
  cobertura real ao invés de 0%).
- **Backend (`vps/api`)**: **não medido**. `vite.config.js`'s
  `coverage.include` é `["src/**/*.{js,jsx}"]` — só instrumenta arquivos
  dentro de `src/`. Os testes em `src/backend/*.test.js` **exercitam**
  código de `vps/api/src` via `require()`, mas como esses arquivos vivem
  fora de `src/`, o Istanbul não os instrumenta e não aparecem no
  relatório de cobertura. Isso é uma lacuna de tooling, não s
  necessariamente de teste real — o backend pode ter mais cobertura
  funcional do que os números sugerem, mas não há como provar sem ajustar
  a config.
- **Domínios sem nenhum teste de frontend** (achado #12 já registrado em
  `docs/TECHNICAL-AUDIT.md`, ainda válido): agendamentos, cancelamentos,
  técnicos, usuários/cargos, mapa/match como componentes.

### 6.1. Recomendação de tooling (não aplicada ainda)

Para medir cobertura real do backend, seria necessário um config de
coverage separado para `vps/api` (Istanbul pode instrumentar CommonJS,
mas hoje só há um `vite.config.js` compartilhado escopado a `src/`).
Alternativa mais simples: adicionar um segundo comando
`test:coverage:backend` usando `c8` ou `nyc` diretamente sobre os testes
que rodam contra `vps/api` (via `createRequire`), sem depender do
pipeline do Vite. Isso é trabalho de configuração, não de correção de
bug — fica registrado aqui como próximo passo, não decidido ainda.

## 7. Quality Gate atual

```
status: ERROR
- new_coverage: 0.0% (esperado >= 80%) — resolve sozinho no próximo scan com lcov plugado
- new_duplicated_lines_density: 5.26% (esperado <= 3%)
- new_violations: 797 (esperado 0)
```

O período de comparação ("New Code") está configurado como
`PREVIOUS_VERSION`, com baseline em 17/08/2026 — ou seja, os "797 issues
novas" são tudo que mudou desde então, incluindo toda a missão de
otimização (Fases A–I) já concluída. Isso infla o número artificialmente
para este primeiro scan pós-missão; não reflete só código realmente novo
no sentido de "recém-escrito sem contexto".

## 8. Proposta de fases para correção (não iniciada — aguardando sua priorização)

Seguindo o mesmo princípio da missão anterior: nada de correção em massa
sem teste e sem entender o "porquê" de cada categoria.

| Fase | Escopo | Risco | Por quê nessa ordem |
|---|---|---|---|
| **S-A** | 6 bugs `.sort()` sem comparador (seção 2) | Baixo, alto valor | Bug real de produção potencial, correção pontual e testável |
| **S-B** | Vulnerabilidade real do payload limit (`financeiroRoutes.js`) + revisão individual dos 77 `S8786` (regex ReDoS) pra separar reais de falso-positivo | Baixo (revisão) | Segurança, mas precisa triagem antes de mexer em regex de produção |
| **S-C** | Acessibilidade mecânica: `S9011` (button type, 165) + `S6853` (label, 105) | Baixo | Alto volume, mudança quase sempre mecânica e local, sem risco de lógica |
| **S-D** | Modernização de sintaxe (~430 issues: `S7744`, `S6594`, `S7781`, `S1788`, `S4624`, `S6582`, grupo S77xx) | Baixo | Mecânico, mas exige rodar teste completo após cada lote — fazer por diretório, não tudo de uma vez |
| **S-E** | Complexidade/manutenibilidade (`S3358` ternário aninhado, `S3776` complexidade cognitiva, `S7721`) nos hotspots da seção 5, **exceto `FinanceiroPage.jsx`** que fica isolado | Médio | Refactor manual caso a caso — começar pelos arquivos menores antes de qualquer coisa em `FinanceiroPage.jsx` |
| **S-F** | `FinanceiroPage.jsx` especificamente (87 issues) | Médio-alto | Arquivo com aviso explícito no `CLAUDE.md` — fase isolada, lotes pequenos, checagem manual de tela após cada lote |
| **S-G** | CSS (`css:S7924` contraste, `css:S4666` duplicidade) | Baixo (duplicidade) / precisa decisão de design (contraste) | Contraste exige input de design, não é só código |
| **S-H** | Configurar cobertura real de backend (`vps/api`) + escrever testes pros domínios sem cobertura de frontend (achado #12) | — | Habilita medir progresso real de "mais testes", que é parte do seu pedido |
| **S-I** | Re-scan completo, confirmar Quality Gate verde | — | Fechamento — só depois de S-A a S-H |

Cada fase segue o mesmo checklist da missão anterior: analisar → criar/
atualizar teste → implementar → lint → teste focado → teste completo →
build → revisar diff → só então seguir pra próxima.

## 9. O que fica de fora deste mapeamento (por design)

- `apps/finan/**` — sistema separado, fora de escopo desta análise.
- Correções em si — este documento é só o mapa, nada foi alterado no
  código nesta etapa.
- Rating de "Reliability"/"Security" D não significa necessariamente
  código perigoso — é calculado a partir dos 11 bugs + 5 vulnerabilidades
  (a maioria falso-positivo, ver seção 1/3), não do volume de code smells.

---

*Gerado via SonarQube Community `26.8.0` rodando localmente via Docker
(`sonarsource/sonar-scanner-cli`), 2026-09-06. Nenhuma métrica foi
estimada — todos os números vieram de consultas reais à API do SonarQube
(`/api/issues/search`, `/api/measures/component`,
`/api/qualitygates/project_status`) e de `npm run test:coverage` rodado
localmente.*
