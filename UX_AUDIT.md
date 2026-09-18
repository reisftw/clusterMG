# Auditoria UX/UI — Sistema Finan (Sempre Internet)

Escopo: `apps/finan/frontend/src` (produção `finan.retiradas.tech`), branch `finan`. Backend (`apps/finan/backend/src`) usado só como referência de contrato/permissão. Metodologia: leitura de código real — rotas (`routes.js`), navegação (`navigationConfig.jsx`), roteamento (`App.jsx`), layout (`FinanLayout.jsx`), ~20 páginas top-level em `components/`, o módulo `FinanceiroPage.jsx` (11.5k linhas) e componentes de orçamento em `modules/financeiro/components/budget/**`. Nenhuma alteração de código foi feita — este é um documento de diagnóstico.

Data da auditoria: 2026-09-10.

---

## 1. Resumo executivo

| Dimensão | Nota (0-10) |
|---|---|
| UX (fluxos, clareza, eficiência) | 5.5 |
| UI (visual, hierarquia, polimento) | 6.5 |
| Consistência | 4.5 |
| Produtividade (cliques, atalhos, densidade) | 5.0 |
| Acessibilidade | 3.5 |
| Responsividade | 5.0 |

**Nota geral ponderada: ~5.0/10** — sistema funcional, com uma arquitetura de navegação recentemente bem trabalhada (busca global, busca local do menu, favoritos, badges de contador, command palette), mas com uma fratura estrutural clara entre duas eras de desenvolvimento: (1) o núcleo antigo, inteiro dentro de `FinanceiroPage.jsx` (11.503 linhas, um único arquivo, `case`s por `page=`), e (2) páginas standalone novas em Tailwind puro (`FinanContasPagarPage.jsx`, `FinanFornecedoresPage.jsx`, `FinanOrcamentoCentrosCustoPage.jsx` etc.), escritas em sessões diferentes, cada uma reinventando modal, badge, loading e empty state do zero. O resultado visível para quem usa o sistema todo dia: a mesma ação (excluir, confirmar, editar) se comporta de um jeito em uma tela e de outro jeito na tela vizinha.

**Principais problemas (visão geral, detalhados na seção 2):**
1. Nenhuma biblioteca de toast/notificação — todo feedback de sucesso/erro é `<div>` inline ou `window.confirm` (o navegador nativo), sem padrão único.
2. Dois "Centros de Custo" diferentes no mesmo submenu Orçamento (`orcamento-lancamentos`/"Orçamento" → `FinanceiroPage.jsx page="orcamentoCentrosCusto"`, e `orcamento-centros-custo`/"Centros de Custo" → `FinanOrcamentoCentrosCustoPage.jsx`), sem nenhuma explicação visual da diferença entre as duas.
3. Ações financeiras irreversíveis (marcar conta como paga, aplicar template de importação, excluir centro de custo) com zero ou pouquíssima fricção — só `window.confirm` genérico (`"Cancelar esta conta a pagar?"`) ou nada.
4. `ModalShell.jsx` existe, tem focus-trap, ESC, `role="dialog"`, `aria-modal` — mas pelo menos 4 páginas novas (`FinanContasPagarPage`, `FinanFornecedoresPage`, `FinanOrcamentoCentrosCustoPage`, `FinanImportadorPage`-adjacentes) reimplementam modal na mão sem nenhum desses cuidados de acessibilidade.
5. Zero `aria-*` em `FinanContasPagarPage.jsx`, `FinanContasReceberPage.jsx`, `FinanFornecedoresPage.jsx`, `FinanImportadorPage.jsx`, `FinanOrcamentoCentrosCustoPage.jsx` — cinco páginas financeiras centrais sem nenhum rótulo de acessibilidade.
6. Status financeiro (estourado/na média/vencido/pago) comunicado só por cor de badge, sem ícone ou texto redundante em várias telas mais novas.
7. `FinanceiroPage.jsx` com 11.503 linhas é um ponto único de fragilidade documentado no próprio CLAUDE.md — qualquer novo recurso precisa entender um arquivo do tamanho de um módulo inteiro.
8. Responsividade desigual: `FinanceiroPage.jsx` tem ~129 classes responsivas (`sm:`/`md:`/`lg:`/`xl:`); `FinanContasPagarPage.jsx` e `FinanFornecedoresPage.jsx` têm 4-5 — tabelas provavelmente quebram ou exigem scroll horizontal difícil em tablet/mobile.
9. Sem paginação/filtro de data em Contas a Pagar/Receber — lista inteira carregada e renderizada de uma vez.
10. Onboarding pontual (`FinanWelcomeModal.jsx`) mas sem nenhum tour ou dica contextual nas páginas mais complexas (Orçamento, DRE, Fechamento).

---

## 2. Top 10 problemas mais críticos

| # | Local | Severidade | Problema | Impacto | Solução recomendada | Complexidade |
|---|---|---|---|---|---|---|
| 1 | `FinanContasPagarPage.jsx` (`handlePagar`) | **Crítica** | Botão de check verde marca a conta como paga direto no `onClick`, sem nenhuma confirmação, sem modal, sem desfazer. | Clique errado = conta marcada como paga incorretamente; pode distorcer relatório de fluxo de caixa sem ninguém perceber até o fechamento. | Confirmação explícita (modal com valor e data, não `window.confirm`) antes de marcar como paga; log de auditoria da ação (já existe padrão em `auditLog.js` no app principal). | Baixa |
| 2 | Menu "Orçamento" (submenu Planejamento) | **Crítica** | Dois itens de menu adjacentes — "Orçamento" e "Centros de Custo" — apontam para duas implementações diferentes do mesmo conceito (uma dentro de `FinanceiroPage.jsx`, outra em `FinanOrcamentoCentrosCustoPage.jsx`), sem nenhuma distinção visual do que cada uma faz. | Usuário não sabe qual tela usar para "ver o centro de custo que estourou"; times diferentes acabam usando telas diferentes para a mesma pergunta, com números que podem divergir por causa de filtro de período/cálculo distintos (mediana vs. sem filtro). | Fundir as duas telas ou renomear com clareza ("Orçamento por Categoria" vs. "Centros de Custo — Desempenho"), com um link cruzado explícito entre elas. | Média |
| 3 | `FinanImportadorPage.jsx` (`handleApplyTemplate`, botão "Salvar e importar agora") | **Crítica** | Importação em massa (criação/atualização de registros reais) roda direto ao clicar, sem etapa de revisão de "isto vai criar N e atualizar M registros, confirma?", sem dry-run visível ao usuário antes do commit. | Planilha errada ou template desatualizado corrompe dados reais em lote — exatamente o cenário que o CLAUDE.md pede para tratar com cautela ("Não altere `operationalImports.js`... sem isolar o risco"). | Adicionar etapa de confirmação com resumo do impacto (contagem esperada) antes de aplicar; manter link para desfazer/reverter o último import. | Média |
| 4 | Todas as páginas (global) | **Alta** | Nenhuma lib de toast (`react-hot-toast`/`sonner`/`react-toastify`) no projeto — confirmado por grep, zero ocorrências. Feedback é `window.confirm` nativo (20 ocorrências) ou `<div>` colorido que cada página posiciona onde quiser. | Comportamento imprevisível: às vezes o alerta é um diálogo bloqueante do navegador (feio, sem marca, sem `pt-BR` de fato controlado), às vezes é uma faixa que só aparece se o usuário rolar até o topo. | Adotar um toast/alert system único (ex.: pequeno provider próprio, já que `sonner` não está instalado e a política de CDN do projeto é restrita) reutilizado em 100% das mutações. | Média |
| 5 | `FinanContasPagarPage.jsx`, `FinanContasReceberPage.jsx`, `FinanFornecedoresPage.jsx`, `FinanImportadorPage.jsx`, `FinanOrcamentoCentrosCustoPage.jsx` | **Alta** | Zero atributos `aria-*` nessas 5 páginas (grep confirmado); ícones sem `aria-label` (`<Trash2 />` sozinho num `<button>`), modais construídos como `<div>` fixo sem `role="dialog"` nem foco preso. | Usuário de leitor de tela não consegue operar Contas a Pagar/Receber, Fornecedores, Importador ou Centros de Custo — 5 das telas financeiras mais usadas do sistema. | Migrar os modais dessas páginas para `ModalShell.jsx` (que já resolve foco/ESC/`aria-modal`); adicionar `aria-label` em todo botão só-ícone. | Média |
| 6 | Modais em `FinanContasPagarPage.jsx` (`NovaContaModal`), `FinanFornecedoresPage.jsx` (`FornecedorDetailModal`), `FinanOrcamentoCentrosCustoPage.jsx` (`CenterDetailsModal`) | **Alta** | Três reimplementações manuais de modal (`fixed inset-0 ... bg-slate-950/40 backdrop-blur-sm`), cada uma copiada e levemente diferente, nenhuma usando o `ModalShell.jsx` já existente no mesmo diretório `components/`. | Inconsistência visual sutil (raio de borda, padding, animação) entre modais; manutenção precisa ser feita em 3+ lugares para o mesmo comportamento; nenhuma delas tem focus-trap. | Substituir por `<ModalShell>` em todas; se faltar alguma prop (ex. footer customizado), estender `ModalShell` em vez de duplicar. | Baixa/Média |
| 7 | `modules/financeiro/components/FinanceiroPage.jsx` | **Alta** | Arquivo de 11.503 linhas concentrando dashboard, orçamento, DRE, aprovações, fechamento, relatórios Serasa/Tarifas, equipe — tudo num componente monolítico com múltiplos `page === "..."` como roteamento interno. Já documentado como frágil no CLAUDE.md. | Qualquer bug ou melhoria nessas telas exige entender um arquivo do tamanho de um app inteiro; alto risco de regressão cruzada (mudar DRE quebra Dashboard sem querer); onboarding de novo dev/IA nessa área é lento e caro. | Extração incremental por domínio (já começou com `FinanOrcamentoCentrosCustoPage.jsx` ficando fora do arquivão) — continuar isolando `page="orcamentoDashboard"`, `page="orcamentoDre"` etc. em componentes próprios, sem tocar tudo de uma vez. | Alta |
| 8 | Contas a Pagar / Contas a Receber (`FinanContasPagarPage.jsx`, `FinanContasReceberPage.jsx`) | **Média-Alta** | Sem paginação, sem filtro por período/status/fornecedor, sem busca — a tabela renderiza `contas.map(...)` inteiro. | Em uma empresa com volume real de contas, a tela fica lenta e difícil de navegar; usuário não consegue achar "as contas de julho" sem `Ctrl+F` do navegador. | Adicionar busca + filtro de status/vencimento + paginação, no mesmo padrão já usado em `FinanOrcamentoCentrosCustoPage.jsx` (que tem os três). | Média |
| 9 | Badges de status (estourado/vencido/pago) em várias telas | **Média** | Cor é o único sinal em muitos badges: `bg-red-100 text-red-700` para "Vencida" sem ícone nem padrão de texto reforçado consistente entre telas (algumas usam ícone + cor, outras só cor — ex. `FinanContasPagarPage.jsx` linha do status é só texto colorido, enquanto `FinanOrcamentoCentrosCustoPage.jsx` usa ícone `AlertTriangle`/`TrendingUp` + cor). | Daltônicos (cerca de 8% dos homens) não distinguem "vencida" de "pendente" sem ler o texto atentamente; inconsistência entre telas quebra o reconhecimento de padrão do usuário recorrente. | Padronizar um componente `<StatusBadge status="estourado|vencido|pago|..." />` com ícone + cor + texto sempre juntos. | Baixa |
| 10 | Responsividade (`sm:`/`md:`/`lg:`/`xl:` por arquivo) | **Média** | Páginas novas como `FinanContasPagarPage.jsx` (5 classes responsivas em 227 linhas), `FinanFornecedoresPage.jsx` (4 em 256 linhas) têm cobertura responsiva muito abaixo de `FinanceiroPage.jsx` (129 em 11.503 linhas, proporcionalmente ainda maior) — tabelas com `min-w-[760px]`/`min-w-[820px]` forçam scroll horizontal em qualquer tela abaixo disso, sem alternativa de cards em mobile. | Em tablet (768px) ou celular, essas telas ficam com scroll horizontal obrigatório em vez de um layout adaptado; pior experiência justamente nas páginas financeiras usadas no dia a dia por quem está fora do escritório. | Ao menos oferecer um layout de cards empilhados abaixo de `sm`, no padrão que `FinanOrcamentoCentrosCustoPage.jsx` já usa para os cards de centro de custo. | Média |

---

## 3. Quick Wins

Itens de baixo esforço e alto retorno, sem redesenho:

1. **Trocar `window.confirm` por um modal padronizado com texto específico** (ex.: "Cancelar a conta 'Aluguel - Matriz', vencimento 10/09, R$ 3.200,00?" em vez de "Cancelar esta conta a pagar?"). Afeta 20 pontos no código, mas cada troca é mecânica.
2. **Adicionar `aria-label` em todo botão só-ícone** (`<Trash2 size={16} />` sozinho) nas 5 páginas listadas no problema #5 — mudança de poucas linhas por botão.
3. **Substituir os 3 modais manuais (`NovaContaModal`, `FornecedorDetailModal`, `CenterDetailsModal`) por `<ModalShell>`** — o componente já existe, já tem foco/ESC/backdrop prontos; é troca de wrapper, não de conteúdo.
4. **Adicionar contador de itens no cabeçalho de Contas a Pagar/Receber** (`"Contas a Pagar (42)"`), igual ao que `FinanOrcamentoCentrosCustoPage.jsx` já faz ("Clique em 'Todos' pra ver os N centros").
5. **Renomear o botão "Cancelar" de `FinanContasPagarPage.jsx` para bater com a função real** — o handler chama `deleteFinanContaPagar` (exclusão), mas o rótulo diz "Cancelar"; escolher um dos dois significados e ser consistente com o backend.
6. **Padronizar `StatusBadge`** com ícone + cor — reaproveitar exatamente o padrão de `FinanOrcamentoCentrosCustoPage.jsx` (`statusBadge()`), que já é o melhor exemplo do código.
7. **Adicionar `disabled`/spinner visual no botão "Nova conta" enquanto salva** (já existe em `NovaContaModal.handleSave`, faltando só propagar o texto "Salvando..." como padrão em todos os formulários — hoje é inconsistente: alguns botões desabilitam, outros não).
8. **Padronizar mensagem de erro genérica de rede** — hoje cada página escreve sua própria frase (`"Não foi possível carregar fornecedores."`, `"Não foi possível carregar centros de custo."`); criar uma função central `errorMessageFor(entity)` evita divergência de tom.

---

## 4. Melhorias por página

Convenção de prioridade: **P0** bloqueante/crítico, **P1** alto impacto, **P2** médio, **P3** polimento.

### 4.1 Dashboard (`FinanceiroPage.jsx page="dashboard"`)
- **Problemas:** parte do arquivo monolítico de 11.5k linhas; qualquer alteração aqui exige navegar um arquivo enorme; mistura lógica de Serasa/Tarifas/Orçamento no mesmo componente pai.
- **Melhorias:** extrair `DashboardView` para arquivo próprio (padrão já usado em `modules/financeiro/components/budget/BudgetDashboardView.jsx`); cada indicador do topo deveria linkar direto para a tela de detalhe correspondente.
- **Prioridade:** P2 (funciona, mas é a maior dívida estrutural do sistema).

### 4.2 Orçamento — Visão Geral (`page="orcamentoDashboard"`)
- **Problemas:** nome de rota (`ORCAMENTO_VISAO_GERAL`) some do usuário final — o item de menu chama só "Visão Geral" dentro de "Orçamento", sem breadcrumb explícito na página em si.
- **Melhorias:** adicionar breadcrumb "Planejamento > Orçamento > Visão Geral" no topo, coerente com a estrutura de 3 níveis que o menu já tem.
- **Prioridade:** P2.

### 4.3 Orçamento — Dados (`page="orcamentoDados"`, import de planilha do Sênior)
- **Problemas:** import de orçamento é uma ação de alto risco (mencionada no CLAUDE.md como área sensível) mas a UI não foi inspecionada em detalhe por estar embutida no arquivão; pelo padrão de `FinanImportadorPage.jsx`, é provável que também falte um passo de confirmação explícito antes de gravar.
- **Melhorias:** garantir preview + contagem de linhas afetadas antes de confirmar, igual ao quick win #3 da seção 3.
- **Prioridade:** P1.

### 4.4 Centros de Custo — `FinanOrcamentoCentrosCustoPage.jsx` (a mais nova, com melhor padrão do sistema)
- **Problemas:** (a) duplicidade conceitual com "Orçamento" no mesmo submenu (ver problema #2); (b) cálculo de "uso" some o campo `comprometido` quando um período é filtrado, mas isso só é explicado em um texto pequeno azul que o usuário pode não ler ("comprometido não entra no uso — só existe 'do mês atual'"); (c) modal de detalhes (`CenterDetailsModal`) não usa `ModalShell`; (d) zero `aria-*`.
- **Melhorias:** essa página é, ironicamente, o melhor exemplo de UI do sistema (indicadores que respondem pergunta de negócio, filtro de período, paginação, busca, badge com ícone). Vale usá-la como **referência de padrão** para retrofitar as páginas mais antigas — mas precisa corrigir a acessibilidade e a duplicidade de conceito antes.
- **Prioridade:** P1 (resolver duplicidade de menu) / P2 (acessibilidade e modal).

### 4.5 Orçamento — Configurações (`page="orcamentoConfiguracoes"`, inclui `CostCentersTreeConfigSection.jsx`)
- **Problemas:** é o único lugar onde o centro de custo pode de fato ser editado (via `?editarCentro=`) — mas o link para lá a partir de Centros de Custo e do Fornecedor não indica que abrirá outra página inteira, não um modal rápido.
- **Melhorias:** considerar abrir a edição em um modal sobre a própria tela de Centros de Custo, em vez de navegar para "Configurações" (rota administrativa, conceitualmente diferente de "editar um registro").
- **Prioridade:** P2.

### 4.6 Aprovações (`page="orcamentoAprovacoes"`)
- **Problemas:** não inspecionado em detalhe (dentro do arquivão); pelo padrão do restante do app, aprovar/rejeitar uma solicitação orçamentária provavelmente usa `window.confirm` também.
- **Melhorias:** ação de aprovação deveria exigir, no mínimo, visualizar o valor e o solicitante antes de confirmar — não um alerta genérico.
- **Prioridade:** P1 (é uma ação financeira que compromete orçamento real).

### 4.7 Fechamento Mensal — `FinanFechamentoPage.jsx`
- **Problemas:** fechar o mês é a ação mais irreversível do sistema financeiro (trava lançamentos) — precisa ser conferida com atenção redobrada por ser um ponto de não-retorno.
- **Melhorias:** confirmação com digitação do mês/ano (padrão "digite MM/AAAA para confirmar"), não apenas um clique; resumo do que será travado antes de confirmar.
- **Prioridade:** P0 se hoje não tiver esse tipo de confirmação (recomenda-se checagem manual antes do próximo ciclo de fechamento).

### 4.8 DRE (`page="orcamentoDre"`, rota `/relatorios-financeiros/dre`)
- **Problemas:** **dívida técnica confirmada no CLAUDE.md** — `dre_lancamentos` nunca foi criado no banco do Finan; a rota retorna 500 hoje. Isso significa que o item de menu "DRE" (visível, com `description` no `navigationConfig.jsx` — "Demonstra resultado, receitas, custos...") leva a um erro para qualquer usuário que clicar.
- **Melhorias:** enquanto não implementado, o item de menu deveria mostrar um badge "Em breve"/estado desabilitado em vez de parecer uma funcionalidade pronta que quebra ao clicar — isso é uma quebra de confiança direta com o usuário.
- **Prioridade:** P0 (item de menu ativo levando a erro 500 é um dos piores tipos de falha de UX — parece bug do sistema, não feature pendente).

### 4.9 Contas a Pagar (`FinanContasPagarPage.jsx`)
- Ver problemas #1, #8, #9 e #10 da seção 2. Adicionalmente: cards de resumo (`Total a pagar`, `Vence hoje` etc.) não são clicáveis/filtráveis — clicar em "Vencidas" deveria filtrar a tabela abaixo, mas não filtra.
- **Prioridade:** P0 (confirmação de pagamento) / P1 (filtro/paginação) / P2 (cards clicáveis).

### 4.10 Contas a Receber (`FinanContasReceberPage.jsx`)
- Estrutura em espelho de Contas a Pagar (mesmo padrão, mesmos problemas) — herda tudo dos itens #8, #9, #10.
- **Prioridade:** P1.

### 4.11 Fornecedores — `FinanFornecedoresPage.jsx`
- **Problemas:** tabela sem paginação (assume poucos fornecedores, mas cresce com o tempo); modal de detalhe não usa `ModalShell`; Supplier Score é mostrado sem nenhuma explicação de como é calculado (usuário vê "72" sem saber o que compõe a nota além dos 3 rótulos pequenos).
- **Melhorias:** tooltip/link explicando a metodologia do Supplier Score; paginação; adicionar `aria-*`.
- **Prioridade:** P2.

### 4.12 Contratos Recorrentes — `FinanContratosPage.jsx`
- **Problemas:** não lido em profundidade, mas usa `window.confirm` (confirmado por grep) — mesmo padrão de confirmação frágil do resto do sistema.
- **Melhorias:** revisar se exclusão/cancelamento de contrato tem consequência financeira que justifique confirmação mais forte que um alerta genérico.
- **Prioridade:** P2.

### 4.13 Central de Importações — `FinanImportadorPage.jsx`
- Ver problema #3 (crítico). Adicionalmente: campos obrigatórios (`campo.required`) são marcados só com um `*` vermelho pequeno ao lado do label — fácil de não perceber ao mapear rapidamente 10+ colunas.
- **Melhorias:** resumo de "X campos obrigatórios ainda não mapeados" fixo/destacado antes de liberar o botão de importar.
- **Prioridade:** P0 (confirmação antes de gravar em massa) / P2 (campos obrigatórios).

### 4.14 Equipe — `FinanceiroEquipePage.jsx` (dentro de `modules/financeiro/components/equipe/`)
- **Problemas:** botões "Salvar" genéricos (3 ocorrências confirmadas por grep) sem indicar o que está sendo salvo (setor? cargo? colaborador?) — má prática de microcopy (ver seção 14 da metodologia).
- **Melhorias:** trocar para "Salvar setor", "Salvar cargo", "Salvar colaborador" conforme o formulário.
- **Prioridade:** P3.

### 4.15 Usuários / Cargos e Permissões — `FinanUsersPage.jsx` (maior arquivo depois de `FinanceiroPage.jsx`, 1.894 linhas)
- **Problemas:** botão "Gerenciar" genérico (linha 1831) sem dizer gerenciar o quê; arquivo grande o suficiente para acumular a mesma fragilidade que `FinanceiroPage.jsx` já tem, só que em estágio inicial.
- **Melhorias:** dividir em sub-abas com componentes próprios antes que cresça mais; trocar "Gerenciar" por algo específico ("Editar permissões").
- **Prioridade:** P2.

### 4.16 Roadmap — `FinanRoadmapPage.jsx`
- **Problemas:** página voltada para transparência interna (24 ideias mapeadas conforme commits recentes) — não é operacional, então risco de UX é baixo, mas compete por atenção no menu com telas de uso diário.
- **Melhorias:** já fica em "Administração", seção corretamente colapsada por padrão (`collapsedByDefault: true` em `navigationConfig.jsx`) — bom exemplo de priorização de IA já aplicada.
- **Prioridade:** P3.

### 4.17 Central de Pendências — `FinanPendenciasPage.jsx`
- **Problemas:** não inspecionado a fundo; tem `badgeKey: "pendencias"` no menu, o que é positivo (contador visível sem precisar entrar na página).
- **Melhorias:** garantir que o clique no badge no menu já filtre para o tipo de pendência mais urgente.
- **Prioridade:** P2.

### 4.18 Caixa de Entrada — `FinanCaixaEntradaPage.jsx`
- **Problemas:** usa `window.confirm` (confirmado); é o ponto de entrada de documentos/OCR — ações de exclusão de documento recebido merecem confirmação mais cuidadosa que um alerta genérico, já que pode ser a única cópia digital de uma nota.
- **Melhorias:** confirmação com preview do documento antes de excluir.
- **Prioridade:** P1.

### 4.19 Qualidade de Dados — `FinanQualidadeDadosPage.jsx`
- **Problemas:** feature nova (Roteiro #29), 185 linhas — provavelmente ainda enxuta; oportunidade de já nascer no padrão certo (badges com ícone, `ModalShell`, `aria-*`) antes que vire dívida.
- **Melhorias:** usar como piloto do design system corrigido antes de propagar para as páginas antigas.
- **Prioridade:** P2.

### 4.20 Biblioteca de Documentos (Anexos) — `FinanAnexosPage.jsx`
- **Problemas:** feature nova (Roteiro #30) com detecção de duplicado e versionamento — funcionalidade de alto valor, mas duplicado/versionamento são conceitos que exigem explicação visual clara (qual versão é a "vigente"?).
- **Melhorias:** indicador explícito de "versão atual" vs. histórico, e aviso visível quando um upload é detectado como duplicado (não apenas um erro genérico).
- **Prioridade:** P2.

### 4.21 Login — `FinanLoginPage.jsx`
- **Problemas:** página bem cuidada visualmente (cards flutuantes, benefícios, MFA por e-mail com máscara do e-mail exibida) — um dos poucos lugares com atenção de copywriting real ("Enviamos um código para ***@..."). Ponto de atenção: fluxo de "esqueci a senha" e MFA dividem estado (`mode`) no mesmo componente de 413 linhas, o que é aceitável nesse tamanho.
- **Melhorias:** nenhuma crítica forte aqui — é um bom exemplo a seguir para outras telas em termos de microcopy.
- **Prioridade:** P3.

---

## 5. Melhorias globais

1. **Um único sistema de feedback (toast/alert/banner)** substituindo `window.confirm` + `<div>` ad-hoc, usado em 100% das mutações do sistema.
2. **Padronizar todos os modais em `ModalShell.jsx`** — hoje é o componente certo, subutilizado.
3. **Extrair um `StatusBadge` e um `EmptyState` compartilhados** — `EmptyState` já existe, mas só dentro de `FinanceiroPage.jsx` (linha 2713), não exportado/reutilizado pelas páginas novas.
4. **Padronizar mensagens de erro e loading** — hoje cada página escreve sua própria frase de "Carregando..." (60 ocorrências de "Carregando" no código, praticamente uma por página, sem componente compartilhado tipo `<PageLoading />`).
5. **Auditoria de ações financeiras críticas** — inventariar todo `window.confirm` (20 pontos) e decidir, caso a caso, se basta confirmação simples, confirmação com resumo, ou confirmação com digitação (fechamento, exclusão de conta paga, aplicar import em massa).
6. **Consolidar responsividade** — adotar como regra mínima que toda tabela tenha uma versão de cards empilhados abaixo de `sm` (768px), replicando o padrão já bom de `FinanOrcamentoCentrosCustoPage.jsx`.
7. **Checklist de acessibilidade mínima para páginas novas** — `aria-label` em botão só-ícone, `role="dialog"`/`aria-modal` em modal, foco visível — aplicado como regra de PR (o projeto já tem uma regra de lint automática para try/catch em rota async do Finan — o mesmo espírito serviria aqui).

---

## 6. Navegação e arquitetura da informação

A navegação (`navigationConfig.jsx`) já passou por uma reformulação recente (comentários no próprio arquivo documentam isso: 6 grupos por intenção de uso, `keywords` para busca, `badgeKey` para contadores, colapso padrão em seções de baixa prioridade). Isso é um ponto forte real do sistema — não precisa de reorganização de menu. Os problemas de IA aqui são pontuais, não estruturais:

**MENU ATUAL** → Planejamento > Orçamento > "Orçamento" (`orcamento-lancamentos`) e "Centros de Custo" (`orcamento-centros-custo`) lado a lado, mesmo nível, nomes parecidos.
**Problema:** rótulos não deixam claro que são duas telas com fontes de cálculo diferentes (uma é o embutido `FinanceiroPage.jsx page="orcamentoCentrosCusto"`, agrupado por categoria; outra é a standalone `FinanOrcamentoCentrosCustoPage.jsx`, por centro individual com mediana/status). O usuário não tem como adivinhar a diferença pelo nome.
**MENU PROPOSTO** → renomear "Orçamento" (`orcamento-lancamentos`) para "Orçamento por Categoria" e manter "Centros de Custo" como está (já é o nome mais claro dos dois), OU migrar de vez o conteúdo de `orcamentoCentrosCusto` (dentro do arquivão) para dentro da página standalone e eliminar a rota antiga.
**Motivo:** nomes de menu devem descrever o recorte de dado (categoria vs. centro), não repetir a mesma palavra genérica "Orçamento" para conceitos vizinhos.

**MENU ATUAL** → item "DRE" dentro de "Indicadores", com `description` detalhada, indistinguível visualmente de itens que funcionam.
**Problema:** leva a erro 500 (dívida técnica confirmada no CLAUDE.md — `dre_lancamentos` não existe no banco do Finan).
**MENU PROPOSTO** → manter o item, mas com um badge "Em breve" (o `navigationConfig.jsx` já tem infraestrutura de `badgeKey`, fácil reaproveitar o mesmo mecanismo para um badge estático de "indisponível") até a migration existir.
**Motivo:** um item de menu clicável que sempre quebra é pior para a confiança do usuário do que a ausência do item.

Pontos positivos a preservar, citados explicitamente porque a metodologia pede honestidade nos dois sentidos:
- Busca global (`GlobalSearchBar`, `FinanLayout.jsx` linha ~946) e busca local do menu (`SidebarSearch`, linha ~663) coexistindo sem confundir função — ambas documentadas nos comentários do próprio código.
- Favoritos persistidos por usuário (`favoritos`, `FavoriteToggle`).
- `FinanCommandPalette.jsx` dedicado — atalho de teclado para navegação rápida, recurso raro em sistemas internos desse porte.
- Badges de contador (`badgeKey: "pendencias"`, `"caixaEntrada"`, `"notificacoes"`) ligando menu a dados reais via `fetchFinanContadoresNavegacao`.
- Seção "Administração" colapsada por padrão (`collapsedByDefault: true`) — boa priorização de carga cognitiva para quem não mexe em configuração todo dia.

---

## 7. Fluxos com excesso de cliques

### 7.1 Marcar conta a pagar como paga
- **Atual:** 1 clique no ícone de check → ação já acontece (sem confirmação). Rápido, mas perigoso — 0 cliques de segurança para uma ação financeira.
- **Recomendado:** 1 clique no ícone → modal de confirmação com valor/data → 1 clique para confirmar = 2 cliques totais, mas com barreira real contra erro.
- **Ganho:** não é redução de cliques, é a inclusão de uma barreira que hoje simplesmente não existe.

### 7.2 Criar centro de custo / editar centro de custo (fluxo hoje: Centros de Custo → Editar → navega para Configurações Orçamentárias)
- **Atual:** na tela "Centros de Custo", clicar em "Editar" → navegação de página inteira para "Configurações Orçamentárias" (`?editarCentro=id`) → localizar/esperar o modal de edição abrir automaticamente. 1 clique, mas com troca de contexto completa (nova tela, novo header, novo breadcrumb mental).
- **Recomendado:** abrir a edição em modal sobre a própria tela de Centros de Custo (a tela já tem todos os dados do centro carregados em memória — `config.centers` — não precisaria nem de nova chamada de API para os campos básicos).
- **Ganho:** elimina 1 navegação completa de página + tempo de carregamento da tela de Configurações; usuário nunca perde o contexto de "estava olhando centros estourados".

### 7.3 Importar planilha via template (Central de Importações)
- **Atual:** selecionar arquivo (1) → mapear campos (N cliques, um select por campo) → nomear template (1 campo) → clicar "Salvar e importar agora" (1 clique) → **fim, já gravado**. Total: sem nenhuma etapa de revisão do impacto.
- **Recomendado:** adicionar 1 clique extra de "Revisar e confirmar" mostrando "X criados, Y atualizados, Z linhas inválidas" antes do commit final.
- **Ganho:** não é redução de cliques (é +1), mas evita o retrabalho de reverter uma importação malfeita manualmente no banco — trade-off claramente positivo dado o risco.

### 7.4 Ver quem é o fornecedor mais concentrado / investigar risco de dependência
- **Atual:** Fornecedores → observar card "Concentração top 3" (sem clique) → mas não há link direto do card para a lista filtrada dos 3 fornecedores em questão; usuário precisa ordenar a tabela manualmente (a tabela nem tem ordenação por coluna, é `filtered.map` sem `sort` exposto ao usuário — só ordena por relevância de busca).
- **Recomendado:** tornar o card clicável, filtrando automaticamente para os top 3.
- **Ganho:** de "abrir a tabela e adivinhar quais são os 3 maiores" para 1 clique direto.

### 7.5 Investigar um centro de custo estourado (fluxo já bom, citado como exemplo positivo)
- **Atual:** Centros de Custo → filtro "Estourados" (1 clique) → "Ver detalhes" no card (1 clique) → modal com movimentações por mês, já carregado sem nova chamada de API. Total: 2 cliques até o detalhe completo.
- **Este fluxo já está bem desenhado** — é citado aqui como referência positiva, não como problema. O ganho de qualquer reorganização futura deve preservar esse padrão.

### 7.6 Aplicar template de importação já salvo
- **Atual:** localizar o template na lista (scroll) → escolher arquivo (1 clique + seleção do SO) → "Aplicar" (1 clique) → resultado aparece como banner verde no topo da página, fora do campo de visão se a lista de templates for longa (o `feedback` é renderizado no topo da página, mas a ação aconteceu na lista, possivelmente abaixo da dobra).
- **Recomendado:** mostrar o resultado da aplicação inline, próximo ao template usado (ou usar um toast que aparece independente do scroll).
- **Ganho:** elimina a necessidade de rolar para cima para saber se a importação funcionou.

---

## 8. Design System

### Existentes
- `ModalShell.jsx` — modal genérico com tamanhos (`sm` a `full`), focus-trap, ESC, backdrop clicável, header/footer configuráveis. **Bem construído, subutilizado.**
- `UserAvatar.jsx` — avatar de usuário, componente pequeno e focado.
- `EmptyState` (dentro de `FinanceiroPage.jsx`, linha 2713) — existe, mas não é exportado/compartilhado.
- `FinanCommandPalette.jsx` — paleta de comando dedicada.
- `FinanPinDigitsInput.jsx` — input de dígitos de PIN, componente especializado bem isolado.

### Duplicados
- **Modal**: `ModalShell.jsx` (correto) vs. pelo menos 3 reimplementações manuais (`NovaContaModal` em `FinanContasPagarPage.jsx`, `FornecedorDetailModal` em `FinanFornecedoresPage.jsx`, `CenterDetailsModal` em `FinanOrcamentoCentrosCustoPage.jsx`), todas com `fixed inset-0 ... bg-slate-950/40 backdrop-blur-sm` copiado e colado, nenhuma com focus-trap.
- **Badge de status**: reimplementado inline em quase toda página com classes Tailwind diferentes (`bg-red-100 text-red-700` em um lugar, `bg-red-50 text-red-700` em outro — nem a tonalidade é consistente).
- **Card de indicador/resumo (header com número grande)**: o padrão `rounded-2xl border border-slate-200 bg-white p-5 shadow-sm` se repete quase identicamente em `FinanContasPagarPage.jsx`, `FinanFornecedoresPage.jsx`, `FinanOrcamentoCentrosCustoPage.jsx` — nunca extraído para um componente `<StatCard>`.

### Inconsistentes
- **Confirmação de ação destrutiva**: `window.confirm` nativo em 20 pontos vs. nenhuma confirmação em outros pontos igualmente críticos (marcar conta como paga).
- **Loading de página inteira**: texto simples (`"Carregando..."`) em quase todo lugar, sem skeleton — nenhuma ocorrência de `Skeleton` encontrada no código (grep vazio). Contraste: `App.jsx` usa `<div className="finan-loading">Carregando Finan...</div>` para o carregamento de rota (Suspense), enquanto páginas individuais usam frases levemente diferentes ("Carregando...", "Carregando centros de custo...", "Carregando fornecedores...") — nem o texto é padronizado.
- **Botões primários**: cor varia sem regra clara aparente — `bg-blue-600` em Contas a Pagar/Importador, `bg-emerald-600` para "Salvar e importar agora" no mesmo `FinanImportadorPage.jsx` (dois botões primários com cores diferentes na mesma tela, sem hierarquia clara entre eles).

### Faltantes
- Nenhum componente `Toast`/`Alert` de sistema.
- Nenhum `Skeleton` (loading é só texto).
- Nenhum `StatusBadge` compartilhado.
- Nenhum `StatCard`/`KpiCard` compartilhado (apesar do padrão visual já estar decidido de fato, só não extraído).
- Nenhum `DataTable` reutilizável com paginação/ordenação embutida — cada tabela é HTML puro reimplementado.
- Nenhum `ConfirmDialog` com variantes de risco (baixo/médio/alto, com digitação obrigatória para o alto).
- `FilterBar`/`DatePicker` reutilizável — cada página com filtro de período reimplementa seus próprios `<select>` de ano/mês (`FinanOrcamentoCentrosCustoPage.jsx` tem o exemplo mais completo, mas não é componentizado para reuso).

---

## 9. Acessibilidade

- **Contraste**: cores usadas (`slate-950`, `blue-600`, `red-700` sobre `red-50`/`white`) tendem a ter contraste adequado (textos escuros sobre fundos claros), mas não foi possível validar programaticamente sem browser — recomenda-se checagem com Lighthouse/axe em produção.
- **Foco visível**: presente em campos de formulário (`focus:ring-4 focus:ring-blue-100`, `focus:border-blue-400`) de forma consistente nos `<input>`/`<select>` — ponto positivo real. Ausente ou incompleto em botões só-ícone e nos modais manuais (sem focus-trap).
- **`aria-label`**: 87 ocorrências totais no projeto, mas concentradas em poucos arquivos (`FinanLayout.jsx`, `ModalShell.jsx`) — 5 páginas financeiras centrais (seção 2, problema #5) com zero.
- **Semântica**: uso correto de `<table>`/`<thead>`/`<tbody>` nas listagens (bom); `<button type="button">` usado consistentemente (evita submits acidentais) — ponto positivo.
- **Tamanho de área clicável**: botões de ação em linha de tabela usam `h-9 w-9` (36px) — no limite recomendado pelo WCAG (44x44 é o ideal, 24x24 o mínimo AA); aceitável mas não ideal para uso em tablet/mobile com o dedo.
- **Cor como único indicador**: badges de status (ver problema #9) e barra de progresso de uso do orçamento (`FinanOrcamentoCentrosCustoPage.jsx`, barra colorida sem porcentagem sobreposta na própria barra, só abaixo) são o ponto mais frágil — usuário com deficiência de percepção de cor depende só do texto ao lado, que nem sempre está presente.
- **Modais sem `role="dialog"`/`aria-modal`**: os 3+ modais manuais identificados não anunciam corretamente para leitor de tela que um diálogo modal foi aberto, nem prendem o foco dentro dele — usuário de teclado pode tabular para trás da página, atrás do modal.

---

## 10. Responsividade

Avaliação por presença/ausência de classes responsivas Tailwind (não foi possível renderizar em browser real neste agente):

- **Desktop grande (1920x1080) / 1366x768**: bem atendido em geral — grids `sm:grid-cols-2 xl:grid-cols-4` são comuns e devem se comportar bem.
- **Tablet (768px, breakpoint `md`)**: risco médio nas páginas novas com poucas classes responsivas. Tabelas com `min-w-[760px]`/`min-w-[820px]` (`FinanFornecedoresPage.jsx`, `FinanContasPagarPage.jsx`) vão forçar scroll horizontal em qualquer viewport abaixo da largura mínima — comum em tablets em modo retrato.
- **Mobile**: mesmo risco, agravado. `FinanceiroPage.jsx` tem ~129 classes responsivas para 11.5k linhas (proporção baixa, mas ainda assim mais alta que as páginas novas); `FinanContasPagarPage.jsx` tem 5 em 227 linhas e `FinanFornecedoresPage.jsx` 4 em 256 — proporcionalmente as páginas mais novas têm MENOS cuidado responsivo que o arquivão antigo, o que é contraintuitivo (o esperado seria o código novo ser mais cuidadoso, não menos).
- **Sidebar/layout**: `FinanLayout.jsx` tem tratamento explícito de `mobileSidebarOpen`, então a navegação em si (o esqueleto do app) parece coberta para mobile — o problema está concentrado no conteúdo das páginas, não no chrome do app.
- **Recomendação prática**: qualquer tabela nova deveria nascer com uma versão de cards empilhados abaixo de `sm`, replicando `FinanOrcamentoCentrosCustoPage.jsx` (que já faz `grid gap-4 md:grid-cols-2 xl:grid-cols-3` para os cards de centro de custo — funciona em qualquer largura).

---

## 11. Dívida de UX

1. **`FinanceiroPage.jsx` monolítico** — a maior dívida do sistema, já reconhecida no CLAUDE.md ("evitar reacoplar lógica grande nesse arquivo"). Cada nova feature dentro dele aumenta o custo de qualquer mudança futura.
2. **Ausência de design system componentizado** — decisões visuais corretas já foram tomadas (cores, tipografia, raio de borda), só não foram extraídas para componentes reutilizáveis; o retrabalho de padronizar cresce a cada página nova escrita do zero.
3. **DRE quebrado em produção com item de menu ativo** — dívida técnica que virou dívida de UX porque o usuário só descobre ao clicar (ver seção 4.8).
4. **Duas implementações de Centros de Custo coexistindo** — dívida gerada pela decisão consciente (documentada no próprio `FinanOrcamentoCentrosCustoPage.jsx`) de não tocar no arquivão antigo; correta como decisão técnica de curto prazo, mas precisa de um plano de unificação.
5. **`window.confirm` como padrão de confirmação** — dívida de UX que também é dívida de acessibilidade e de marca (diálogo do navegador quebra a identidade visual do produto).
6. **Ausência de testes de acessibilidade automatizados** — nada no `package.json`/CI sugere `axe-core`/`jest-axe`/Lighthouse CI rodando sobre o Finan; a dívida de acessibilidade tende a crescer silenciosamente sem esse alarme.

---

## 12. Funcionalidades que poderiam ser simplificadas

- **Import de orçamento (Dados) vs. Central de Importações (Importador) vs. Caixa de Entrada (OCR)** — são 3 pontos de entrada de dados diferentes, cada um com sua própria lógica de mapeamento/preview. Vale avaliar se, do ponto de vista do usuário, isso deveria ser 1 hub único de "Importar dados" com abas por tipo, em vez de 3 telas espalhadas em 3 seções de menu diferentes (Planejamento/Dados, Administração/Integrações/Importador, Início/Caixa de Entrada).
- **Menu "Orçamento" com 7 sub-itens** (Visão Geral, Dados, Orçamento, Centros de Custo, Aprovações, Configurações, Fechamento Mensal + Metas) — nível de profundidade alto para um único agrupamento; candidatos a fundir: "Orçamento" (lançamentos) poderia virar uma aba dentro de "Centros de Custo" em vez de item de menu próprio, uma vez resolvida a duplicidade do problema #2.
- **Filtro de período em `FinanOrcamentoCentrosCustoPage.jsx`** calculado inteiramente no cliente com duas fórmulas distintas (`centerMetrics` sem filtro vs. `periodCenterMetrics` com filtro) — funcionalmente correto pelos comentários do próprio código, mas é uma regra de negócio sutil (comprometido só existe "do mês atual") que usuários vão esquecer; simplificar exibindo sempre os 4 números com a mesma composição, e não sonegar "comprometido" silenciosamente ao filtrar.

---

## 13. Funcionalidades que poderiam ser criadas

Somente com ganho claro e justificado pelo que foi observado no código:

1. **Log de auditoria visível ao lado da ação financeira crítica** (marcar como paga, aplicar import, fechar mês) — o backend já tem conceito de auditoria (padrão citado no CLAUDE.md, `auditLog.js` no app principal); trazer "quem/quando" para a UI de Contas a Pagar reduziria a necessidade de confirmação pesada em toda ação, porque o rastro fica visível e reversível por outro caminho.
2. **Botão "desfazer" (undo) de curta duração (ex. 5-10s) após marcar conta como paga** — em vez de bloquear com confirmação pesada toda vez, um padrão de "Conta marcada como paga. Desfazer" por alguns segundos reduz fricção no caso comum e ainda protege contra erro de clique.
3. **Indicador de "última importação" visível na Central de Importações e em Dados Orçamentários** — hoje o usuário só sabe que um import rodou pelo banner de feedback que desaparece; um histórico simples (`data, arquivo, resultado`) evitaria repetir a mesma importação por engano.
4. **Link cruzado entre "Fornecedores" e "Centros de Custo"** — hoje são telas irmãs (ambas agregam `finan_orcamento_lancamentos`) sem nenhum link entre si; ao ver um fornecedor concentrado, seria útil um link direto para os centros de custo que mais gastam com ele.

---

## 14. Matriz impacto x esforço

| Melhoria | Impacto | Esforço | Risco | Prioridade |
|---|---|---|---|---|
| Confirmação real antes de marcar conta como paga | Alto | Baixo | Baixo | **QUICK WIN** |
| Badge "Em breve" no item de menu DRE | Alto | Baixo | Baixo | **QUICK WIN** |
| Substituir modais manuais por `ModalShell` | Médio-Alto | Baixo-Médio | Baixo | **QUICK WIN** |
| `aria-label` em botões só-ícone (5 páginas) | Médio | Baixo | Baixo | **QUICK WIN** |
| Confirmação/resumo antes de aplicar importação em massa | Alto | Médio | Médio | **ESTRATÉGICA** |
| Paginação/filtro em Contas a Pagar/Receber | Médio-Alto | Médio | Baixo | **ESTRATÉGICA** |
| `StatusBadge` componentizado | Médio | Baixo | Baixo | **QUICK WIN** |
| Sistema de toast único | Alto | Médio | Baixo | **ESTRATÉGICA** |
| Unificar/renomear os dois "Centros de Custo" | Alto | Médio | Médio | **ESTRATÉGICA** |
| Extrair `FinanceiroPage.jsx` por domínio (contínuo) | Alto | Alto | Alto | **ESTRATÉGICA** |
| Migration de `dre_lancamentos` no banco do Finan | Alto | Médio (já citado como pendente no CLAUDE.md) | Médio | **ESTRATÉGICA** |
| Cards de resumo clicáveis (filtro rápido) | Médio | Baixo | Baixo | **QUICK WIN** |
| Responsividade com cards em mobile para tabelas | Médio | Médio | Baixo | **OPORTUNIDADE** |
| Hub único de importação (unificar 3 pontos de entrada) | Médio | Alto | Médio | **OPORTUNIDADE** |
| Undo de 10s pós-ação | Médio | Médio | Baixo | **OPORTUNIDADE** |
| Tour/onboarding contextual em telas complexas | Baixo-Médio | Médio | Baixo | **BAIXA PRIORIDADE** |
| Testes de acessibilidade automatizados no CI | Médio (preventivo) | Médio | Baixo | **OPORTUNIDADE** |

---

## 15. Roadmap recomendado

### Fase 1 — Correções críticas
- Confirmação real (não `window.confirm`) antes de marcar conta a pagar/receber como paga.
- Badge "Em breve"/estado desabilitado no item de menu DRE até a migration `dre_lancamentos` existir.
- Confirmação com resumo de impacto antes de aplicar template de importação em massa (`FinanImportadorPage.jsx`).
- Checagem manual do fluxo de Fechamento Mensal (`FinanFechamentoPage.jsx`) — confirmar se hoje tem barreira adequada; se não tiver, é P0.

### Fase 2 — Quick Wins
- Substituir os 3 modais manuais identificados por `ModalShell`.
- `aria-label` em botões só-ícone nas 5 páginas sem nenhum `aria-*`.
- `StatusBadge` componentizado (ícone + cor + texto) reaproveitando o padrão de `FinanOrcamentoCentrosCustoPage.jsx`.
- Cards de resumo clicáveis em Contas a Pagar/Receber e Fornecedores.
- Corrigir o rótulo "Cancelar" vs. a ação real de exclusão em Contas a Pagar.

### Fase 3 — Padronização (Design System)
- Extrair `EmptyState`, `StatCard`, `PageLoading` para componentes compartilhados (fora de `FinanceiroPage.jsx`).
- Implementar sistema de toast único, substituindo `<div>` ad-hoc de feedback.
- Consolidar paleta de cores de badges/botões primários (hoje `blue-600` e `emerald-600` competem sem hierarquia clara em algumas telas).
- Checklist de acessibilidade mínima obrigatório para páginas novas (mesmo espírito da regra de lint já existente para try/catch em rotas async do Finan).

### Fase 4 — Otimização de fluxos
- Paginação, busca e filtro em Contas a Pagar/Receber e Fornecedores.
- Edição de centro de custo em modal sobre a própria tela de Centros de Custo, sem navegar para Configurações.
- Unificar/renomear os dois "Centros de Custo" (fundir ou diferenciar claramente por nome).
- Link cruzado entre Fornecedores e Centros de Custo.

### Fase 5 — Evolução
- Extração incremental e contínua de `FinanceiroPage.jsx` por domínio (dashboard, DRE, aprovações, fechamento como componentes próprios), sem big-bang.
- ~~Avaliar hub único de importação~~ — **feito** (`FinanCentralDadosPage.jsx`, 2026-09-10, ver seção 16).
- Testes automatizados de acessibilidade no CI.
- Onboarding contextual (tours/dicas) nas telas de maior complexidade (Orçamento, DRE após implementado, Fechamento).

---

## 16. Reavaliação pós-implementação (Fases 1-4, 2026-09-10)

Fases 1 a 4 do roadmap foram implementadas e deployadas na mesma sessão da auditoria original. Fase 5 ficou **deliberadamente não feita** nesta rodada — ver justificativa abaixo — então a nota não reflete o teto do roadmap, só o que já está em produção.

**O que mudou de fato:**
- Confirmação real (não `window.confirm`) em ações financeiras críticas — marcar como pago/recebido, cancelar conta, aplicar importação em massa, fechar período.
- Sistema de toast único (`FinanToastContext`) substituindo banners `<div>` ad-hoc.
- 4 componentes compartilhados novos (`ModalShell` adotado, `StatusBadge`, `StatCard`, `EmptyState`, `PageLoading`), aplicados nas 6 páginas standalone mais usadas do dia a dia (Contas a Pagar/Receber, Fornecedores, Importador, Centros de Custo, Fechamento).
- Busca + paginação em Contas a Pagar/Receber/Fornecedores.
- Cards de resumo viraram filtro rápido clicável.
- Central de Dados (hub único pros 3 pontos de envio de arquivo) + menu limpo dos itens redundantes.
- Os dois "Orçamento"/"Centros de Custo" ganharam nomes e descrições diferentes.
- DRE (feature pendente conhecida) para de fingir estar funcional quando dá erro 500.

**O que NÃO mudou (por quê):**
- `FinanceiroPage.jsx` (11.503 linhas) continua intocado — é ~60% do sistema em uso (Dashboard, Orçamento por Categoria, Aprovações, Configurações, DRE, Equipe) e o próprio roadmap pede extração "incremental, sem big-bang". Ainda é a maior fonte de inconsistência do sistema.
- Nenhuma auditoria de acessibilidade automatizada (`eslint-plugin-jsx-a11y`) — adicionar um plugin novo hoje arriscava travar o CI com um volume desconhecido de violações pré-existentes em todo o resto do app; fica como ação isolada, não bloqueada por nada além de tempo.
- Responsividade não foi tocada (fora do escopo das Fases 1-4 que foram implementadas).
- Paleta de cor de botão primário ainda não unificada globalmente (só nos componentes novos).

| Dimensão | Nota original | Nota agora | Por quê |
|---|---|---|---|
| UX (fluxos, clareza, eficiência) | 5.5 | **7.0** | Confirmação/feedback consistentes e busca/filtro nos fluxos mais usados do dia a dia — mas o núcleo antigo (DRE, Aprovações, Dashboard, Equipe) não mudou. |
| UI (visual, hierarquia, polimento) | 6.5 | **7.0** | Ganho é mais de consistência do que de polimento visual novo — nenhuma mudança de tipografia/hierarquia/espaçamento foi feita. |
| Consistência | 4.5 | **6.5** | Maior salto: 4 componentes compartilhados novos eliminaram a reimplementação duplicada nas páginas mais usadas. Ainda falta a metade do sistema que vive em `FinanceiroPage.jsx`. |
| Produtividade (cliques, atalhos, densidade) | 5.0 | **6.5** | Busca+paginação+filtro rápido reduzem cliques nos 3 fluxos mais recorrentes. Ainda sem atalhos de teclado, seleção múltipla ou edição inline. |
| Acessibilidade | 3.5 | **4.5** | Ganho real, mas modesto — só havia 1 botão genuinamente ícone-only sem rótulo (os demais já tinham texto visível); os modais convertidos para `ModalShell` ganharam foco/ESC de graça. Ainda sem verificação automatizada nem cobertura das telas dentro de `FinanceiroPage.jsx`. |
| Responsividade | 5.0 | **6.0** | Rodada separada (mesmo dia): as 3 tabelas apontadas na seção 10 (Contas a Pagar/Receber, Fornecedores) ganharam versão de cards empilhados abaixo de `sm` — sem mais scroll horizontal forçado nessas telas. `FinanceiroPage.jsx` e o restante do sistema continuam sem tratamento. |

**Nota geral ponderada: ~5.0 → ~6.2/10.** Melhora consistente e real nas telas do dia a dia (financeiro operacional: contas, fornecedores, importação, centros de custo, fechamento), sem ainda destravar o maior item de dívida do sistema (`FinanceiroPage.jsx`) nem cobrir acessibilidade automatizada — que é exatamente o que a Fase 5 existe para resolver, de forma incremental e sem pressa.

**Responsividade — o que foi feito (mesmo dia, rodada separada):** abaixo de `sm` (640px), `FinanContasPagarPage.jsx`, `FinanContasReceberPage.jsx` e `FinanFornecedoresPage.jsx` trocam a tabela (que tinha `min-w-[760/820px]`, forçando scroll horizontal em qualquer tela menor) por uma lista de cards empilhados com a mesma informação — replicando o padrão que `FinanOrcamentoCentrosCustoPage.jsx` já usava. `FinanImportadorPage.jsx` foi avaliado e deixado como está de propósito: sua tabela de preview tem colunas dinâmicas (vêm da planilha enviada), então não há como prever um layout de card fixo — `overflow-auto` continua sendo o padrão correto ali. `FinanceiroPage.jsx` e o restante das páginas com tabela (Notas, Contas dentro da Central de Dados, etc.) não foram tocados.

---

## 17. Fase 5 implementada (2026-09-11)

Os 4 itens da Fase 5 foram implementados e deployados nesta sessão.

**O que mudou de fato:**
- **Acessibilidade automatizada**: `eslint-plugin-jsx-a11y` instalado e escopado só ao Finan (`eslint.config.js`) — roda dentro de `npm run lint`, que já é o job `build-and-test` do CI, então isso conta como "teste automatizado de acessibilidade no CI" (item que a Fase 5 original também listava). 17 violações reais corrigidas (nenhuma pré-existia em volume assustador, ao contrário do que a seção 16 temia).
- **Extração incremental de `FinanceiroPage.jsx`**: `DashboardView.jsx` (355 linhas) + `shared/DashboardPrimitives.jsx` (6 componentes: `EmptyState`, `ChartCard`, `FinancePanel`, `PanelActionButton`, `CardFooterLink`, `barOptions`) extraídos do arquivão. **Achado relevante durante a validação**: esse Dashboard (`page === "dashboard"` dentro do antigo `FinanceiroPage.jsx`) não está roteado em nenhum lugar acessível do app hoje — o Finan usa `FinanModulePage` (mais simples: resumo matinal, calendário, favoritos, sem os gráficos de faturamento/recebíveis/evolução) como home real. Parece código órfão de uma versão anterior do roteamento (o comentário em `financeiroRoutes.js` menciona "portado do Retiradas em 2026-09-07"). Decisão de produto pendente — ver seção 18.
- **Responsividade**: cards em mobile em Contratos, Notas Fiscais e Usuários/Cargos — mesmo padrão das telas já corrigidas.
- **Paleta de botão primário**: 3 pares de botões com `bg-emerald-600` competindo com `bg-blue-600` na mesma tela corrigidos (Importador, Integração Sênior, Serasa) — secundário virou outline colorido, só 1 CTA sólido por tela. "Nova conta financeira" normalizada pro azul do padrão "Nova X" do resto do app.

**O que ainda NÃO mudou:**
- `FinanceiroPage.jsx` ainda tem ~11.150 linhas (só o Dashboard, que nem é usado, saiu) — Orçamento por Categoria, Aprovações, Configurações, DRE e Equipe continuam no arquivão.
- Responsividade não cobre o resto do sistema (telas dentro do arquivão, Central de Dados).
- Paleta de botão primário não foi unificada globalmente, só nos 4 pontos de conflito real identificados — vários botões emerald "solo" (sem competir com nada na tela) ficaram como estão, por decisão deliberada (cor semântica correta onde não há ambiguidade).
- Migration `dre_lancamentos` continua pendente — DRE mostra "Em breve" em vez de dado real.
- Undo pós-ação e onboarding contextual (tours) — não iniciados, baixa prioridade.

| Dimensão | Nota Fase 1-4 | Nota agora | Por quê |
|---|---|---|---|
| Acessibilidade | 4.5 | **6.0** | Primeira verificação automatizada real, rodando no CI a cada push. 17 violações reais corrigidas. Ainda sem cobertura das telas dentro do arquivão (Orçamento/Aprovações/Equipe). |
| Consistência | 6.5 | **7.0** | 6 primitivas de UI a mais viraram compartilhadas; paleta de botão primário sem mais conflito visível nas 4 telas identificadas. |
| Responsividade | 6.0 | **6.5** | +3 telas de lista com cards mobile (Contratos, Notas, Usuários). Arquivão continua sem tratamento. |
| UX/Produtividade | 7.0 / 6.5 | sem mudança | Fase 5 focou em dívida técnica/acessibilidade/consistência, não em novos fluxos. |

**Nota geral ponderada: ~6.2 → ~6.6/10.**

---

## 18. Próximos passos recomendados (por prioridade)

1. **Decidir o destino do Dashboard órfão** (`DashboardView.jsx`) — apagar de vez (é código morto, ninguém navega até ele) ou promovê-lo a dashboard real do Finan (tem gráficos de faturamento/recebíveis/evolução/alertas que `FinanModulePage` não tem). Decisão de produto, não de engenharia — bloqueia qualquer trabalho futuro nessa área até resolvida.
2. **Migration `dre_lancamentos`** — é a única peça que falta pra DRE parar de ser "Em breve" e virar funcionalidade real. Maior item de valor de negócio pendente da auditoria inteira.
3. **Continuar a extração de `FinanceiroPage.jsx`** — próximo alvo natural depois do Dashboard é Aprovações (`BudgetApprovalsView.jsx` já existe como padrão a seguir) ou Equipe, que já tem página própria fora do arquivão parcialmente.
4. **Responsividade no resto do sistema** — telas dentro do arquivão (Aprovações, Equipe, Configurações) ainda forçam scroll horizontal em mobile.
5. **Undo de 10s pós-ação** e **onboarding contextual** — baixa prioridade, ganho incremental, sem urgência.

---

## 19. Reavaliação (2026-09-11) — Dashboard órfão excluído + DRE ativada

**O que mudou:**
- `DashboardView.jsx` (código morto, sem rota) excluído por decisão do usuário.
- Migration `039_finan_dre_lancamentos.sql` aplicada em produção (preflight rodado antes) — a DRE, que a seção 4.8 apontava como "um dos piores tipos de falha de UX" (item de menu ativo levando a erro 500), **agora funciona de verdade**: demonstrativo completo carregando (Receita Bruta, Deduções, Lucro Bruto, Resultado antes IRPJ/CSLL, Resultado Líquido), botão de importação de XLSX ativo. Validado ao vivo em produção.
- Varredura de responsividade no resto do sistema: só restam 4 tabelas largas, todas grades densas legítimas (dados de fornecedor com 12+ colunas, preview de planilha com colunas dinâmicas) — mesmo critério já aceito pro Importador. Nada convertido, nada precisava ser.
- Extração adicional do arquivão avaliada e **deliberadamente não feita**: o que resta (`CostCentersConfigSection`, 717 linhas de estado de configuração orçamentária, único ponto de uso) tem risco de regressão real demais pra mexer sem tempo de validação adequado.

| Dimensão | Nota Fase 5 | Nota agora | Por quê |
|---|---|---|---|
| UX (fluxos, clareza, eficiência) | 7.0 | **7.5** | Resolve um dos piores achados da auditoria original (P0: item de menu que sempre quebrava). Único módulo financeiro do menu principal que ainda faltava funcionar. |
| UI (visual, hierarquia, polimento) | 7.0 | 7.0 | Sem mudança — nenhum trabalho visual novo nesta rodada. |
| Consistência | 7.0 | 7.0 | Sem mudança direta, mas menos código morto no arquivão ajuda a manutenção futura. |
| Produtividade | 6.5 | 6.5 | Sem mudança. |
| Acessibilidade | 6.0 | 6.0 | Sem mudança. |
| Responsividade | 6.5 | 6.5 | Confirmado que não sobrou nada de baixo esforço/alto retorno pra converter. |

**Nota geral ponderada: ~6.6 → ~6.8/10.**

**O que ainda separa o sistema de 9/10** (nenhum item novo, mesma lista da seção 18, só reordenada por impacto real):
1. Extrair o resto do arquivão (`CostCentersConfigSection` e o que sobrar) — maior fonte de risco de regressão futura e de inconsistência visual, mas exige tempo dedicado de validação, não uma sessão corrida.
2. Cobertura de acessibilidade além do lint automatizado — teste real com leitor de tela, não só `jsx-a11y`.
3. Produtividade: atalhos de teclado, seleção múltipla, edição inline — nenhum existe hoje.
4. UI: nenhuma rodada de polimento visual (tipografia/hierarquia/espaçamento) desde a auditoria original — o ganho até aqui foi todo de consistência/funcionalidade, não de acabamento.

---

## 20. Arquivão finalizado (2026-09-11) — `FinanceiroPage.jsx` de 11.067 para 784 linhas

**O que mudou:**
- Item 1 da lista de prioridades da seção 19 (maior item pendente da auditoria inteira) foi concluído nesta sessão: o resto do arquivão — domínio completo de Orçamento (Dashboard, Centros de Custo, Aprovações, DRE, Dados, Configurações — `CostCentersConfigSection` incluído), Tarifas, Serasa, Importação de Dados do Orçamento e Configurações (Google Sheets) — foi extraído de `FinanceiroPage.jsx` para 6 arquivos próprios, seguindo o mesmo padrão já usado para `DashboardView.jsx`/`DashboardPrimitives.jsx` na Fase 5.
- Código morto adicional removido durante a extração: subsistema inteiro de exportação de PDF (`ExportFinanceiroModal`, `EXPORT_OPTIONS` e afins) só era alcançável a partir do mesmo `page === "dashboard"` inatingível que já tinha motivado a exclusão do Dashboard órfão na seção 19 — ninguém navegava até o botão que abria esse modal.
- `FinanceiroPage.jsx` final (784 linhas) ficou só com o shell: roteamento por página, header, registro do Chart.js e os dois seletores de período compartilhados. O domínio de Orçamento (a maior extração, ~6.200 linhas) virou chunk lazy separado — carrega só quando o usuário entra em alguma tela de Orçamento.
- **Incidente em produção, mesmo dia, corrigido antes de fechar a sessão**: o primeiro deploy da extração saiu com 3 componentes usados via JSX sem import — o eslint deste projeto não tem `eslint-plugin-react`/`jsx-no-undef`, só `no-unused-vars`, então referência a componente inexistente em JSX passa batido (identificador normal fora de JSX o `no-undef` já pega, como aconteceu e foi corrigido antes do primeiro deploy). Quebrou Orçamento/Aprovações/DRE/Centros de Custo, Faturamento/Contas a Pagar/Receber/Notas e o modal de configuração de diretores por alguns minutos, até a correção e redeploy. Validado depois com uma varredura própria (AST via babel, comparando todo componente JSX maiúsculo contra imports+declarações de cada arquivo) — ferramenta que passa a valer pra qualquer extração futura do tipo.

| Dimensão | Nota seção 19 | Nota agora | Por quê |
|---|---|---|---|
| Consistência | 7.0 | **7.5** | Maior fonte de risco de regressão e inconsistência do sistema (o arquivão) deixou de existir. Dead code adicional (exportação de PDF órfã) removido junto. |
| UX (fluxos, clareza, eficiência) | 7.5 | 7.5 | Sem mudança de fluxo pro usuário final — refactor é transparente, mesmo comportamento, só reorganização de arquivo. |
| UI | 7.0 | 7.0 | Sem mudança. |
| Produtividade | 6.5 | 6.5 | Sem mudança. |
| Acessibilidade | 6.0 | 6.0 | Sem mudança. |
| Responsividade | 6.5 | 6.5 | Sem mudança. |

**Nota geral ponderada: ~6.8 → ~7.0/10.**

**O que ainda separa o sistema de 9/10** (lista da seção 19, com o item 1 concluído e removido):
1. Cobertura de acessibilidade além do lint automatizado — teste real com leitor de tela, não só `jsx-a11y`.
2. Produtividade: atalhos de teclado, seleção múltipla, edição inline — nenhum existe hoje.
3. UI: nenhuma rodada de polimento visual (tipografia/hierarquia/espaçamento) desde a auditoria original — o ganho até aqui foi todo de consistência/funcionalidade, não de acabamento.
4. Cobertura de teste automatizado pro tipo específico de bug encontrado nesta rodada (componente JSX sem import) — vale considerar `eslint-plugin-react` com `jsx-no-undef` pro projeto todo, não só uma varredura manual ad-hoc.

---

## 21. Acessibilidade além do lint + motion (2026-09-11)

Item 4 da seção anterior foi resolvido em sessão à parte (`eslint-plugin-react` com só a regra `jsx-no-undef` ligada no projeto todo — ver commit `a3664d4`, fora do escopo desta seção). Esta rodada ataca o item 1 (parcialmente — ver ressalva) e o pedaço de motion do item 3.

**O que mudou:**
- **Varredura real além do lint automatizado**: `jsx-a11y` recommended (já ligado) não pega tudo sozinho. Rodei o preset `strict` do `eslint-plugin-jsx-a11y` como checagem pontual (sem deixar ligado no projeto — só pra achar o que faltava) e revisei manualmente cada achado, descartando falso-positivo. Achado real: `no-static-element-interactions` no drop-zone de drag-and-drop do organograma (`FinanceiroEquipePage.jsx`) — documentado e suprimido com justificativa, porque a mesma ação (mover colaborador de setor) já é 100% operável por teclado via "Editar usuário" → campo "Setor" → Salvar. DnD nativo HTML5 não tem equivalente real de teclado (limitação conhecida da API, não um bug corrigível com `role`/`tabIndex` fake).
- **8 inputs/selects com foco invisível pro teclado** (WCAG 2.4.7): usavam `outline-none` sem nenhum substituto — quem navega por Tab não via onde estava. Achados via varredura AST própria (não grep por linha — um grep ingênuo por `outline-none` dava ~70 falsos positivos porque a maioria já tinha o `focus:ring` no elemento pai). Corrigido com `focus-within`/`focus:ring` consistente com a cor semântica de cada contexto (azul padrão, âmbar no campo de reabertura de período auditado em `FinanFechamentoPage`).
- **Toast de erro tinha a mesma urgência de sucesso/info** (`aria-live="polite"` pros três) — agora erro usa `role="alert"` + `aria-live="assertive"`, que interrompe o leitor de tela em vez de esperar a fila, coerente com a severidade real.
- **Motion**: `prefers-reduced-motion` só cobria as 4 animações do login. Trocado por uma regra global (`animation-duration`/`transition-duration` quase zero pra quem pede motion reduzido no SO) cobrindo o app inteiro — inclui `animate-spin`/`animate-pulse` do Tailwind (~52 usos, spinners e skeletons) e, o achado mais relevante, um pulso vermelho **contínuo** de urgência em `FinanLayout.jsx` (contagem de PIN/sessão) que rodava sem parar independente da preferência do usuário — o tipo de animação persistente que motiva a própria existência dessa media query.

**Ressalva importante — o que NÃO foi feito**: "teste real com leitor de tela" (o texto original do item 1) significa literalmente rodar NVDA/VoiceOver/TalkBack e navegar o app ouvindo — isso exige um humano com o software rodando, não é algo que se faz por análise de código. O que foi feito aqui é uma auditoria de código rigorosa (lint estrito + revisão manual de cada achado), que é um passo real e necessário, mas não substitui esse teste. Ainda vale a pena fazer numa sessão futura.

| Dimensão | Nota seção 20 | Nota agora | Por quê |
|---|---|---|---|
| Acessibilidade | 6.0 | **6.5** | Ganho real (foco visível em 8 pontos, toast de erro urgente, DnD documentado) mas parcial — sem teste de leitor de tela de verdade, não dá pra fechar o item. |
| UI | 7.0 | **7.2** | Motion agora respeita a preferência do usuário em todo o app, não só no login — é polimento real, mas não é a rodada de tipografia/hierarquia/espaçamento que o item 3 original também pede. |
| UX | 7.5 | 7.5 | Sem mudança de fluxo — os fixes são invisíveis pra quem não usa teclado/leitor de tela ou não pediu motion reduzido. |
| Consistência | 7.5 | 7.5 | Sem mudança. |
| Produtividade | 6.5 | 6.5 | Sem mudança. |
| Responsividade | 6.5 | 6.5 | Sem mudança. |

**Nota geral ponderada: ~7.0 → ~7.1/10.**

**O que ainda separa o sistema de 9/10** (lista atualizada):
1. Teste real com leitor de tela (NVDA/VoiceOver) — a varredura de código não substitui.
2. Produtividade: atalhos de teclado, seleção múltipla, edição inline — nenhum existe hoje.
3. UI: rodada de polimento visual de tipografia/hierarquia/espaçamento — motion já resolvido, mas isso ainda não.

---

## 22. Rodada final: acessibilidade sem leitor real, produtividade, polimento (2026-09-11)

Ataca os 3 itens da lista acima. Nenhum foi fechado 100% — cada um tem uma ressalva honesta abaixo — mas os três avançaram de verdade.

### 1. Acessibilidade — sem leitor de tela real, mas mais fundo que antes

Não rodei NVDA/VoiceOver (não tenho saída de áudio, isso continua precisando de um humano). O que fiz foi a aproximação mais honesta possível: navegar só por teclado e inspecionar a árvore de acessibilidade (exatamente o que um leitor de tela consome — roles, labels, ordem de foco, landmarks), tanto ao vivo (tela de login, pública) quanto por leitura direta do código-fonte pras telas autenticadas (não tinha sessão logada disponível nesta sessão).

Achados reais, sem depender de nenhum lint novo:
- **153 `<th>` em 19 arquivos de tabela sem `scope="col"`** (WCAG 1.3.1) — confirmado via AST que 100% são cabeçalho de coluna antes de aplicar em massa. Não é algo que `jsx-a11y` cobre (é semântica de HTML, não ARIA).
- **Painel decorativo da tela de login sem `aria-hidden`** — um leitor de tela em modo "ler tudo" tinha que ouvir um parágrafo inteiro de marketing (headline, 3 cards flutuantes, 3 benefícios, frase institucional) antes de chegar no formulário de verdade.

### 2. Produtividade — seleção múltipla, ação em massa, edição inline

Focado nas duas telas de maior tráfego do dia a dia (Contas a Pagar/Receber — não em todo o sistema, ver ressalva):
- Checkbox por linha + "selecionar todas da página", barra de ação em massa ("Marcar N como pagas/recebidas", "Cancelar N contas"), reaproveitando o mesmo `ConfirmDialog.jsx` de sempre.
- Edição inline de descrição/valor/vencimento direto na linha — usando `PUT /contas-pagar/:id` e `PUT /contas-receber/:id`, que já existiam no backend (com DTO parcial) mas nunca tinham sido expostos no client do frontend.
- Atalho "n" abre "Nova conta". Ctrl+K/"/" pra busca global já existiam via `FinanCommandPalette.jsx` (achado ao investigar: esse item já estava mais resolvido do que a auditoria original sabia).

### 3. UI — polimento de tipografia, mas só no que dá pra verificar com confiança

A escala tipográfica já era consistente (várias sessões de Fase 3/Padronização), mas quase tudo usa `font-black` igual — sem variação de peso, nada se destaca de verdade. Uma reescala arquivo-por-arquivo em mais de 100 arquivos não é escopo seguro/verificável numa sessão sem QA visual ao vivo (sem sessão autenticada). Fiz o que dá pra aplicar com confiança:
- `font-variant-numeric: tabular-nums` global — achado real: só 1 arquivo em ~9 que exibem valor monetário usava isso antes. Sem dígito de largura fixa, coluna de R$ desalinha.
- `text-wrap: balance` em h1-h3 global.
- `StatCard.jsx` (usado em quase toda tela): label e valor tinham o mesmo peso, competindo por atenção — label mais leve, valor com mais presença.

### Achado de infra, fora do escopo dos 3 itens mas descoberto verificando o deploy

O nginx de `finan.retiradas.tech` não tinha `Cache-Control` nenhum explícito pro `index.html` — o navegador aplicava cache heurístico e servia uma versão de vários deploys atrás mesmo depois de reload forçado (mesmo sintoma já visto antes no `status.retiradas.tech`/Grafana, mesma causa raiz). Corrigido: `index.html` agora é `no-cache, no-store, must-revalidate`; `/assets/` (nomes com hash do build) ganhou `Cache-Control: public, max-age=31536000, immutable`, que é o correto — hash muda se o conteúdo muda, então cache "pra sempre" é seguro. Isso não é um problema de código do Finan, é config de servidor — não versionado no commit, mas documentado aqui pelo impacto real (todo deploy futuro do Finan se beneficia).

| Dimensão | Nota seção 21 | Nota agora | Por quê |
|---|---|---|---|
| Acessibilidade | 6.5 | **6.8** | Mais dois achados reais e corrigidos (scope de tabela, painel de login), mas o item 1 da lista de 9/10 continua sem fechar — falta o teste com leitor de tela de verdade. |
| Produtividade | 6.5 | **7.3** | Salto real: as duas telas de maior tráfego ganharam seleção múltipla, ação em massa e edição inline — mas é só essas duas, não o sistema inteiro. |
| UI | 7.2 | **7.4** | Ganho real e seguro (tabular-nums, StatCard), mas não é a "rodada de tipografia/hierarquia/espaçamento" completa que o item pedia — isso ainda exigiria QA visual ao vivo, arquivo por arquivo. |
| UX | 7.5 | 7.5 | Sem mudança de fluxo pra quem não usa as features novas. |
| Consistência | 7.5 | 7.5 | Sem mudança. |
| Responsividade | 6.5 | 6.5 | Sem mudança. |

**Nota geral ponderada: ~7.1 → ~7.3/10.**

**O que ainda separa o sistema de 9/10** (lista final, cada item agora com escopo mais preciso):
1. Teste real com leitor de tela (NVDA/VoiceOver) — continua exigindo um humano, nenhuma sessão de código substitui.
2. Estender seleção múltipla/ação em massa/edição inline pras outras listas do sistema (Fornecedores, Notas Fiscais, Centros de Custo...) — o padrão já está pronto em Contas a Pagar/Receber como referência.
3. Rodada de tipografia/hierarquia/espaçamento arquivo-por-arquivo, com QA visual ao vivo (precisa de sessão autenticada) — hoje só o nível global/componente compartilhado foi coberto.
