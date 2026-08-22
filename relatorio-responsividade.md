# Relatorio de Responsividade e Layout

## Fase 1 - Auditoria

### Resumo executivo

Esta auditoria foi feita sem alterar codigo. O sistema usa React 19 com Vite 8, React Router, Tailwind CSS 4, CSS global em `src/index.css` e muitos estilos utilitarios diretamente nos componentes. Tambem existem CSS especificos em paginas publicas, como o painel publico.

O `index.html` possui `meta viewport` correto:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

O Tailwind esta configurado em `tailwind.config.js`, mas nao ha `screens` customizados. Portanto, o projeto usa os breakpoints padrao do Tailwind:

| Prefixo | Largura minima |
| --- | ---: |
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |
| `2xl` | 1536px |

Os problemas mais importantes nao parecem concentrados em uma unica pagina. O padrao recorrente e que o sistema cresceu com muitas telas operacionais densas, varias delas com tabelas, modais e grids manuais. Existe responsividade em boa parte do codigo, mas ela e inconsistente em telas pequenas e em larguras intermediarias, especialmente entre 360px e 1024px.

### Contagem estimada por severidade

| Severidade | Quantidade estimada | Impacto |
| --- | ---: | --- |
| 🔴 Critico | 10 | Pode quebrar uso no mobile, causar scroll horizontal, esconder botoes ou impedir leitura |
| 🟡 Moderado | 18 | Funciona, mas pode ficar apertado, desalinhado ou dificil de operar |
| 🟢 Menor | 8 | Ajustes finos de acabamento, consistencia e acessibilidade |

### Stack identificado

| Item | Tecnologia |
| --- | --- |
| Frontend | React 19.2.4 |
| Build | Vite 8 |
| Rotas | React Router DOM 7 |
| CSS principal | Tailwind CSS 4 + classes utilitarias |
| CSS adicional | `src/index.css` e CSS por pagina/componente |
| Icones | `lucide-react` |
| Graficos | Chart.js / react-chartjs-2 |
| Modais | Implementacao propria por pagina, geralmente com `fixed inset-0 z-50` |
| Tabelas | HTML table nativo, geralmente com `overflow-x-auto` |

### Rotas e paginas mapeadas

Principais rotas internas:

- Auth: `/login`, `/esqueci-senha`, `/redefinir-senha`, `/acesso-negado`
- Dashboard e operacao: `/`, `/diario`, `/acompanhamento`, `/metas`, `/retiradas`, `/entregas-tecnicos`
- Estoque: `/estoque`, `/estoque/equipamentos`, `/estoque/bolsa-tecnico`, `/estoque/consulta`, `/acerto-estoque`
- Cliente: `/agendamentos`
- Equipe: `/feriados`, `/ferias`, `/colaboradores`, `/agenda`
- Mensageria: `/mensageria`, `/mensageria/api`, `/mensageria/fila`, `/mensageria/enviados`, `/mensageria/relatorios`, `/mensageria/confirmacao-agendamentos`, `/mensageria/backlog`, `/mensageria/callback`
- Configuracoes: `/configuracoes/geral`, `/configuracoes/apis`, `/configuracoes/hubsoft`, `/configuracoes/cvortex`, `/configuracoes/banco-de-dados`, `/configuracoes/email`, `/configuracoes/cargos`
- Empresas: `/empresas`, `/empresas/:slug`
- Documentos: `/documentos/pendentes`, `/documentos/tratativas`, `/documentos/historico`, `/documentos/aprovados`, `/documentos/configuracao`, `/documentos/relatorios`
- Administrativo: `/administrativo/insumos`, `/administrativo/insumos/requisicoes`, `/administrativo/imoveis`, `/administrativo/imoveis/:id`, `/administrativo/imoveis/contratos`, `/administrativo/imoveis/historico`, `/administrativo/imoveis/relatorios`
- Publicas/PWA: `/painel`, `/painel/agentes`, `/painel/relatorios`, `/painel/mapa`, `/painel/match`, `/mapa`, `/mapa/historico`, `/duvidas`, `/devolucao`, `/terceiros`, `/terceirizados`, `/terceirizados/login`, `/terceirizados/consulta-mac`, `/terceiros/consulta-mac`

### Componentes reutilizaveis mapeados

| Tipo | Componentes/Padroes |
| --- | --- |
| Layout | `Sidebar.jsx`, `Topbar.jsx`, `PageWrapper.jsx`, `MelzFooter.jsx`, `PublicNotificationsButton.jsx` |
| Estado visual | `Spinner`, `RetorninhoLoader`, `ErrorPage`, `InternalStaticDataStatus` |
| Cards | Cards de KPI, cards de dashboard, cards de empresas, cards de documentos, cards de imoveis |
| Modais | Modais customizados por tela com `fixed inset-0`, `z-50`, `max-h-[85vh/90vh]` |
| Tabelas | Tabelas HTML com `overflow-x-auto`, normalmente sem versao mobile em cards |
| Formularios | Formularios por tela, muitos em grid responsivo com colunas arbitrarias |
| Menus | Sidebar colapsavel, topbar, menus publicos/PWA |

## Problemas encontrados

| Arquivo/componente | Problema | Severidade | Breakpoint onde ocorre |
| --- | --- | --- | --- |
| `src/components/ui/ErrorPage.jsx` | Usa `h-screen overflow-hidden` com imagem `max-w-none w-[128%]` e texto gigante. Em telas baixas pode cortar conteudo e botoes. | 🔴 Critico | <=480px e telas com pouca altura |
| `src/components/layout/PageWrapper.jsx` | Wrapper principal usa `h-screen overflow-hidden`. Conteudos internos dependem de scroll correto; paginas com modais/tabelas grandes podem ficar presas. | 🔴 Critico | <=768px |
| `src/modules/dashboard/components/DashboardPage.jsx` | Grid principal usa `xl:grid-cols-[minmax(360px,0.85fr)_minmax(560px,1.15fr)]`; em transicoes desktop/tablet pode forcar largura minima grande. | 🔴 Critico | 1024px-1279px |
| `src/pages/Terceiros/TerceirizadosDocumentosPage.jsx` | Formulario usa `lg:grid-cols-[minmax(0,1fr)_420px]`, hero com `min-h-72/80` e card grande. Pode ficar pesado em mobile e telas baixas. | 🔴 Critico | <=480px e <=768px |
| `src/modules/insumosAdministrativos/components/InsumosAdministrativosPage.jsx` | Tela tem muitas tabelas e modais grandes. Estrategia mobile depende de scroll horizontal, dificultando uso em celular. | 🔴 Critico | <=480px |
| `src/modules/auth/components/UsuariosPage.jsx` | Tabela de usuarios e modal de cadastro/edicao podem ficar longos; a tela depende de scroll e nao tem apresentacao mobile em cards. | 🔴 Critico | <=480px |
| `src/modules/empresasTecnicos/components/EmpresasTecnicosPage.jsx` | Cadastro tecnico usa grid `md:grid-cols-[1fr_150px_1fr_38px]`; tabelas e acoes podem comprimir campos e botoes. | 🔴 Critico | <=768px |
| `src/modules/imoveisAdministrativos/components/ImoveisAdministrativosPage.jsx` | Dashboard possui layouts com colunas fixas como `lg:grid-cols-[320px_minmax(0,1fr)]` e varios modais extensos. | 🔴 Critico | <=768px e 1024px |
| `src/modules/entregasTecnicos/components/EntregasTecnicosPage.jsx` | Modal `max-w-6xl`, filtros com `min-w-[240px]` e tabelas largas podem gerar rolagem horizontal intensa. | 🔴 Critico | <=768px |
| `src/modules/hubsoft/components/HubsoftSettingsPage.jsx` | Grid `lg:grid-cols-[220px_1fr_160px_140px]` pode comprimir campos em telas de 1024px e causar desalinhamento. | 🔴 Critico | 1024px |
| `src/components/layout/Sidebar.jsx` | Sidebar tem estado colapsado, mas a auditoria estatica nao encontrou uma estrategia clara de drawer mobile para navegacao completa. | 🟡 Moderado | <=768px |
| `src/components/layout/Topbar.jsx` | Busca some ate `xl`, menu de usuario usa dropdown `w-[min(92vw,390px)]`; bom sinal, mas pode conflitar com notificacoes/modais. | 🟡 Moderado | <=480px |
| `src/components/layout/PublicNotificationsButton.jsx` | Modal global usa `fixed inset-0 z-[140]`; pode ficar acima de modais de pagina e gerar conflito de camadas. | 🟡 Moderado | Todos, mais visivel em mobile |
| `src/pages/Acompanhamento/AcompanhamentoPage.jsx` | Tela e orientada a TV/desktop. Possui imagens e blocos densos; nao parece ter foco mobile completo. | 🟡 Moderado | <=768px |
| `src/pages/PainelPublico/components/CityTable.jsx` | Usa tabela publica (`city-table`). Precisa confirmar CSS mobile; risco de tabela larga sem card mobile. | 🟡 Moderado | <=480px |
| `src/pages/PainelPublico/RelatoriosPublicoPage.jsx` | Container `max-w-[1400px] p-6` e cards com `xl:min-w-[420px]`; pode sobrar scroll em tablet. | 🟡 Moderado | <=768px |
| `src/pages/Mapa/MapaPage.jsx` | Blocos com `min-w-[320px]` e cards de ranking `min-w-[280px]`; em telas pequenas pode criar rolagem horizontal. | 🟡 Moderado | <=480px |
| `src/pages/Mapa/components/MapaCidadeDrawer.jsx` | Drawer fixo `max-w-sm` e `w-full`; aceitavel, mas precisa verificar altura e acoes no rodape em mobile. | 🟡 Moderado | <=480px |
| `src/pages/Mapa/components/MapaGeoModal.jsx` | Modal de mapa `fixed inset-4 md:inset-8`; bom para desktop, mas em mobile mapa pode ficar muito apertado. | 🟡 Moderado | <=480px |
| `src/modules/mensageria/components/MensageriaEnviadosPage.jsx` | Lista usa grid fixo `grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr_1.2fr]`, nao uma tabela responsiva/card mobile. | 🟡 Moderado | <=768px |
| `src/modules/mensageria/components/MensageriaPage.jsx` | Varios grids arbitrarios e tabelas; preview WhatsApp com `max-w-[92%]` e paineis laterais podem comprimir. | 🟡 Moderado | <=768px |
| `src/modules/mensageria/components/MensageriaFilaPage.jsx` | Filtros `lg:grid-cols-[1fr_220px_220px_120px]` e tabela larga; precisa de alternativa mobile. | 🟡 Moderado | <=768px |
| `src/modules/mensageria/components/AgendamentoConfirmacaoPage.jsx` | Grid lateral `xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]`; modais largos `max-w-5xl`. | 🟡 Moderado | <=768px |
| `src/modules/logistica/components/LogisticaPage.jsx` | Layout com painel lateral `xl:grid-cols-[420px_1fr]`; em tablet pode alternar tarde demais e ficar denso. | 🟡 Moderado | <=1024px |
| `src/modules/documentos/components/*` | Fluxos de PDF, aprovacao e historico tendem a usar modais/tabelas. Precisa padronizar visualizacao mobile de documentos. | 🟡 Moderado | <=768px |
| `src/pages/Devolucao/DevolucaoPage.jsx` | Hero e secoes com posicoes negativas, mapas/iframes de `h-[500px]`, muitos grids arbitrarios; usa `overflow-x-hidden`, mas pode esconder problema. | 🟡 Moderado | <=768px |
| `src/pages/Terceiros/TerceirosHomePage.jsx` | PWA tem boa direcao mobile, mas usa decoracoes absolutas negativas; depende de `overflow-x-hidden`. | 🟡 Moderado | <=480px |
| `src/modules/metas/components/*` | Varias tabelas com `whitespace-nowrap`, `w-full` e `overflow-x-auto`; leitura em celular pode ficar cansativa. | 🟡 Moderado | <=480px |
| `src/modules/colaboradores/components/*` | Tabelas e modais usam `max-h-[90vh]`; funcional, mas precisa verificar botoes em telas baixas. | 🟡 Moderado | <=480px |
| `src/components/layout/MelzFooter.jsx` | Tooltip usa `whitespace-nowrap`; pode sair da tela em celulares estreitos. | 🟢 Menor | <=360px |
| `src/index.css` | Nao ha regra global clara de `box-sizing`, `overflow-wrap` ou protecao contra palavras longas em cards. | 🟢 Menor | Todos |
| Imagens gerais | A maioria usa `object-contain`/`object-cover`, mas nao ha `srcset` para logos/imagens maiores. | 🟢 Menor | Todos |
| Botoes pequenos em tabelas | Alguns botoes de icone parecem menores que 44px; precisa ajuste de area de toque. | 🟢 Menor | <=480px |
| Textos pequenos | Existem varios `text-xs`, `text-[10px]`, `text-[11px]`; em mobile podem prejudicar leitura. | 🟢 Menor | <=480px |
| Grids arbitrarios | Uso frequente de `grid-cols-[...]` cria layouts pontuais dificeis de manter. | 🟢 Menor | Todos |
| Z-index | Modais de paginas usam `z-50`, notificacoes usam `z-[140]`; falta uma escala formal de camadas. | 🟢 Menor | Todos |
| Tabelas | Padrao atual e scroll horizontal. Funciona, mas nao e a melhor UX mobile para telas operacionais frequentes. | 🟢 Menor | <=480px |

## Padroes recorrentes identificados

1. Muitas paginas usam `overflow-x-hidden` para esconder scroll horizontal. Isso melhora a aparencia, mas pode mascarar conteudo vazando.
2. Ha muitos grids com valores arbitrarios, por exemplo `grid-cols-[420px_1fr]`, `grid-cols-[1fr_220px_220px_120px]`, `minmax(560px,...)`.
3. Tabelas geralmente usam `overflow-x-auto`, mas poucas parecem ter alternativa mobile em formato de card.
4. Modais sao implementados separadamente por pagina, com tamanhos e comportamentos diferentes.
5. O sistema tem muitos componentes densos de administracao, o que exige padrao mais forte para action bars, filtros, tabelas e modais.
6. Falta uma politica global de quebra de texto para nomes longos, emails, codigos, URLs, telefones e mensagens de WhatsApp.
7. A navegacao lateral tem bom colapso desktop, mas a auditoria estatica indica que a experiencia mobile ainda precisa de verificacao visual.
8. A maioria das imagens usa classes responsivas basicas, mas nao ha estrategia de `srcset`/tamanhos para assets grandes.

## Estimativa de esforco

O esforco e medio/alto, mas bem controlavel se for feito por camadas. A maior parte dos problemas vem de padroes repetidos:

- corrigir um `ModalShell` reutilizavel reduz risco em muitas telas;
- corrigir `ResponsiveTable` ou `DataList` reduz problemas em usuarios, empresas, documentos, insumos, mensageria e imoveis;
- corrigir `PageHeader`/`ActionBar` melhora filtros e botoes em varias paginas;
- ajustar `PageWrapper`, `Sidebar` e `Topbar` melhora o sistema inteiro.

Estimativa:

| Frente | Esforco |
| --- | --- |
| Layout base, sidebar/topbar e camadas | Medio |
| Modais reutilizaveis | Medio |
| Tabelas/listagens mobile | Alto |
| Dashboards/cards principais | Medio |
| Paginas publicas/PWA | Medio |
| Ajustes finos de imagem/tipografia/toque | Baixo/medio |

## Fase 2 - Plano de acao proposto

Nenhuma correcao deve ser feita antes da aprovacao deste plano.

### Estrategia geral

1. Padronizar o projeto com abordagem mobile-first.
2. Criar ou consolidar componentes compartilhados para:
   - `PageHeader`
   - `ActionBar`
   - `StatCard`
   - `ModalShell`
   - `ResponsiveTable`
   - `FilterGrid`
   - `EmptyState`
3. Definir tokens praticos de layout:
   - espacamento fluido por breakpoint;
   - largura maxima padrao para paginas;
   - escala de z-index;
   - altura maxima e scroll interno para modais;
   - area minima de toque de 44px.
4. Adicionar utilitarios globais seguros:
   - `box-sizing: border-box`;
   - `overflow-wrap: anywhere` em areas de texto controladas;
   - tratamento padrao para codigos, emails, URLs e mensagens longas.
5. Trocar tabelas criticas por estrategia responsiva:
   - desktop: tabela;
   - mobile: cards empilhados ou tabela com colunas essenciais + detalhes expansivos.

### Ordem sugerida de execucao

#### 1. Criticos

1. Corrigir `PageWrapper`, `Sidebar`, `Topbar` e escala de z-index para evitar sobreposicoes e travamento de scroll.
2. Criar `ModalShell` e aplicar primeiro em Usuarios, Insumos, Empresas, Imoveis, Mensageria e Documentos.
3. Criar padrao de tabela/listagem responsiva e aplicar em:
   - `UsuariosPage`
   - `InsumosAdministrativosPage`
   - `EmpresasTecnicosPage`
   - `ImoveisAdministrativosPage`
   - `MensageriaEnviadosPage`
   - `MensageriaFilaPage`
4. Ajustar `DashboardPage` e `ErrorPage`, pois sao telas muito visiveis.
5. Revisar `TerceirizadosDocumentosPage`, porque e fluxo publico/mobile importante.

#### 2. Moderados

1. Ajustar paginas publicas do painel:
   - `/painel`
   - `/painel/agentes`
   - `/painel/mapa`
   - `/painel/match`
2. Ajustar telas de Mapa e Logistica.
3. Ajustar Mensageria API, Backlog, Callback, Relatorios e Confirmacao.
4. Ajustar Documentos e visualizacao de PDF.
5. Ajustar Metas e tabelas auxiliares.

#### 3. Menores

1. Melhorar `srcset`/tamanhos de imagens pesadas.
2. Revisar textos muito pequenos.
3. Garantir area de toque minima para botoes de icone.
4. Padronizar truncamento com tooltip ou detalhe expansivo.
5. Revisar tooltips que usam `whitespace-nowrap`.

### Validacao recomendada para as fases futuras

Para cada correcao futura, validar pelo menos:

- Mobile: 360px e 480px
- Tablet: 768px
- Desktop: 1366px ou 1440px

Validar tambem:

- ausencia de scroll horizontal no `body`;
- botoes principais visiveis sem cortar;
- modais com scroll interno funcional;
- tabelas/listagens legiveis;
- menu navegavel em mobile;
- notificacoes sem cobrir modais indevidamente.

## Status

Fase 1 concluida como auditoria estatica. Nenhum codigo do sistema foi alterado.

Fase 2 proposta acima. Aguardando aprovacao antes de qualquer edicao.
