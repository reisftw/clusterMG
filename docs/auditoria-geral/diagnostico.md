# Auditoria geral do Retiradas (REVO)

Data: 13/11/2026. Escopo: `apps/retiradas`, contratos compartilhados do Mercado e pipelines de CI/CD relacionados.

## Inventario verificado

- 588 arquivos no frontend e 349 no backend.
- 149 arquivos de teste e 121 migrations SQL.
- 534 registros de rotas/endpoints no inventario gerado em `docs/release/retiradas-endpoint-inventory.json`.
- 88 arquivos candidatos a paginas/dashboards, 237 componentes React e 198 arquivos de codigo da API catalogados.
- 12 caminhos SQL representativos inspecionados em migrations, documentos, mapas, snapshots e jobs.

## Arquitetura

O frontend React/Vite consome uma API Express e snapshots PostgreSQL. Retiradas e Mercado compartilham backend e banco. Mapas, HubSoft, Evolution/WhatsApp, notificacoes, PWA e jobs agendados cruzam esse limite. O deploy de Retiradas e feito pelo workflow manual documentado, apos CI.

## Prioridades encontradas

1. P0: colecoes operacionais com dados pessoais eram acessiveis anonimamente.
2. P0: migrations com o mesmo prefixo numerico podiam ser marcadas como aplicadas sem executar.
3. P1: execucoes concorrentes de migration nao possuam trava global nem timeouts locais.
4. P1: respostas antigas do mapa podiam substituir filtros mais recentes.
5. P1: navegacao do mapa era recalculada em toda leitura de GPS.
6. P2: modais permitiam rolagem do documento ao fundo.
7. P2: o PWA redirecionava `/painel/agentes` para `/painel`.

Os demais achados estao em `bugs-encontrados.md`. A auditoria nao executou operacoes destrutivas, migrations em producao ou testes invasivos contra integracoes externas.

