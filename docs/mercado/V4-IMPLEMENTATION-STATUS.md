# Mercado de Retiradas V4 - Status de Implementacao

## Escopo entregue nesta worktree

- Autenticacao independente sob `/api/mercado/auth`, com cookie proprio (`mercado_session`), hash Argon2id e vinculo de conta a empresa.
- Recuperacao de senha com token aleatorio, hash persistido, validade de 30 minutos, uso unico e revogacao das sessoes anteriores.
- Portal independente em `/mercado/login`, `/mercado/recuperar-senha`, `/mercado/redefinir-senha`, `/mercado/dashboard`, `/mercado/montar-lote` e `/mercado/meus-lotes`.
- API de prestador sob `/api/mercado/provider`, sem dependencia da sessao do Retiradas.
- Agregacao de oportunidades por cidade/equipamento, sem dados de cliente no mapa ou na previa.
- O artefato GeoJSON oficial do IBGE com 853 municípios de Minas Gerais e seu script de atualização foram adicionados na V5; a migração da visualização para polígonos é rastreada junto ao portal.
- Montagem transacional de lotes de 15, 25 ou 35 OS, com `FOR UPDATE SKIP LOCKED`, advisory lock por empresa, bloqueio de empresa suspensa, limite de lotes e bloqueio de cidade duplicada.
- Liberacao progressiva: primeiro grupo de tres OS no aceite; os proximos grupos so sao desbloqueados apos submissao valida do grupo anterior.

## Protecao de dados

Os endpoints de mapa e previa retornam somente totais agregados. O endpoint de detalhe do prestador consulta somente OS com `liberada_em` e entrega somente o grupo corrente. As rotas de tentativa, agendamento, evidencia e execucao reutilizam a verificacao de escopo da empresa e recusam OS sem liberacao.

Teste local executado: `node --test apps/retiradas/backend/api/src/mercado/progressivePrivacy.test.js`.

Casos cobertos: grupo desbloqueado, acesso direto a OS bloqueada/estrangeira e nao reenvio dos dados do grupo anterior quando o proximo grupo abre.

## Migration

Aplicar, em homologacao, depois da migration `076_mercado_retiradas.sql`:

`apps/retiradas/backend/sql/077_mercado_auth_geo_progressive.sql`

Ela somente cria tabelas/indices e adiciona campos. O backfill atribui grupos de tres aos lotes existentes, sem apagar dados.

## Pendencias de homologacao reais

- Criar as contas de prestador em `mercado_accounts` e os vinculos em `mercado_account_empresas`; nao foi criada conta real automaticamente.
- Confirmar configuracao SMTP no ambiente para envio do e-mail de recuperacao.
- O mapa usa pontos interativos de municipios para nao depender de CDN nem acrescentar uma biblioteca sem aprovacao. Para poligonos oficiais completos de todos os municipios, importar uma fonte IBGE/GeoJSON versionada no repositorio ou disponibilizada pela infraestrutura.
- Executar a migration e testes integrados contra o banco de homologacao. Esta worktree nao possui credenciais de banco e, por isso, nao foram executados testes que escrevem lote ou enviam e-mail.

## Sem operacoes externas

Nenhum push, deploy, migration ou chamada a integracao HubSoft foi executado durante esta implementacao.
