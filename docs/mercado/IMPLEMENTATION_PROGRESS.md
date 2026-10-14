# Mercado de Retiradas - Progresso de Implementacao

Branch de trabalho: `homolog-dev`

Escopo ativo: implementacao homologavel do Mercado de Retiradas sem push, deploy ou alteracao destrutiva em producao.

## Premissas da V3

- O Mercado usa a estrutura existente de usuarios, cargos, empresas e permissoes.
- Nao foram criados cargos `mercado_*`.
- Nao foi criada tabela paralela de cadastro de empresas.
- Configuracoes ficam dentro do menu existente de Configuracoes em `/configuracoes/mercado`.
- HubSoft permanece somente leitura para este modulo.

## Checkpoint 1 - Base tecnica

Concluido:

- Criada migration `076_mercado_retiradas.sql` com tabelas normalizadas para configuracoes, habilitacoes, lotes, O.S., tentativas, agendamentos, evidencias, suspensoes, aprovacoes, apuracoes financeiras e lancamentos.
- Criado catalogo de permissoes em `app_permissions`.
- Criada API `/api/mercado` com rotas para dashboard, configuracao, empresas habilitadas, lotes, execucao, backoffice, financeiro e historico.
- Criado service backend reaproveitando o cadastro existente de empresas em `empresas_tecnicos`.

## Checkpoint 2 - Interface

Concluido:

- Criado modulo frontend em `modules/mercado`.
- Criado layout proprio do Mercado em `/mercado`.
- Criadas telas iniciais para dashboard, lotes disponiveis, todos os lotes, meus lotes, detalhe do lote, execucao, aprovacoes, financeiro, historico, relatorios e configuracao.
- Adicionado Mercado ao menu principal.
- Adicionada configuracao do Mercado dentro de Configuracoes.
- Adicionados rotulos/grupo de permissoes para Cargos e Permissoes.

## Pendencias Tecnicas Conhecidas

- Executar a migration em banco de homologacao antes de validar fluxo completo.
- Validar os cenarios com dados reais de O.S. cancelada apos migration.
- Evoluir relatorios financeiros para PDF/XLSX caso seja exigido na homologacao.
- Ajustar regras finas de SLA, suspensao e precificacao apos validacao operacional.
