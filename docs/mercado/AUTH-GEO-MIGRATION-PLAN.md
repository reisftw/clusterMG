# Mercado: plano de migracao de autenticacao e geolocalizacao

## Estado atual

O Mercado usa as tabelas `mercado_*` para configuracao, habilitacoes, lotes,
OS, eventos, evidencias, aprovacao e financeiro. As rotas atuais em
`/api/mercado` dependem de `req.user`, da sessao `retiradas_session` e do RBAC
geral do Retiradas. A fonte empresarial continua sendo
`mercado_empresa_habilitacoes`, vinculada ao identificador estavel da empresa.

## Mudanca aditiva

- Criar contas, vinculos empresariais, papeis, permissoes, sessoes, convites e
  recuperacao de senha em tabelas `mercado_*` novas.
- Usar cookie `mercado_session`, com path `/api/mercado`, audience propria e
  segredo separado. Nenhuma senha, hash ou token de `app_users` sera copiado.
- Preservar os lotes, evidencias, apuracoes e habilitacoes existentes.
- Acrescentar ordem congelada, grupo de liberacao e instante de liberacao em
  `mercado_lote_os`; nao duplicar dados de clientes em novas tabelas.
- Entregar agregados por cidade sem dados pessoais para o mapa e a montagem.

## Reaproveitamento

- `mercado_lotes`, `mercado_lote_os`, financeiro, evidencias e eventos.
- Motor de precificacao e limites empresariais ja existentes.
- Fontes operacionais e HubSoft, apenas no backend.

## Migracao e rollback

A migration e somente aditiva e idempotente. Nenhuma sessao do Retiradas,
Operacao, Finan ou ADM e invalidada. O rollback consiste em desativar as novas
rotas do Mercado; as tabelas novas e os campos adicionais permanecem para
preservar auditoria e integridade historica.
# Plano de autenticação, geografia e liberação progressiva

Este documento acompanha a migration `077_mercado_auth_geo_progressive.sql`.

## Ordem de homologação

1. Aplicar a migration 077 após a 076.
2. Criar uma conta de prestador e vinculá-la a uma empresa habilitada.
3. Validar login, recuperação por SMTP e logout no domínio HTTPS de homologação.
4. Validar prévia e confirmação de lote com duas sessões de empresas diferentes.
5. Validar que apenas três OS aparecem no detalhe e que as demais retornam `403` em ações diretas.
6. Após submeter o grupo, validar a liberação exclusiva do grupo seguinte.

## Reversão

Não remover tabelas nem colunas em ambiente compartilhado. Para interromper o recurso, revogue as sessões em `mercado_sessions` e retire o acesso das contas em `mercado_account_empresas`; o Mercado legado permanece isolado.
