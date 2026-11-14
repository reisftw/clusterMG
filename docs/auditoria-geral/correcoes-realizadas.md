# Correcoes realizadas

## AUD-001 - protecao de documentos operacionais

- Antes: tres colecoes com dados pessoais podiam ser lidas sem sessao.
- Depois: a leitura usa `/api/documents`, exige sessao e preserva acesso dos papeis autenticados que ja utilizavam Mapa e Mensageria.
- Teste: regressao de backend impede o retorno da rota publica; frontend confirma a URL autenticada.
- Impacto esperado: eliminar leitura anonima sem alterar snapshots publicos agregados.

## AUD-002 a AUD-004 - migrations confiaveis

- A identidade passou a ser o nome completo do arquivo, com conversao da tabela legada.
- Migrations repetindo o mesmo numero permanecem independentes.
- Uma trava advisory global impede dois runners simultaneos.
- Cada transacao usa `lock_timeout=5s` e `statement_timeout=15min`.
- CI e release executam teste de integracao PostgreSQL do runner.

## AUD-005 e AUD-006 - Maps

- Respostas possuem revisao monotona; somente a solicitacao mais recente altera o estado.
- Navegacao anterior e cancelada e so e recalculada depois de 15 metros ou 10 segundos.
- O `AbortSignal` e propagado ate o cliente HTTP.

## AUD-007 e AUD-008 - mobile/PWA

- O modal bloqueia a rolagem do `body`, inclusive com modais sobrepostos, e restaura o valor anterior ao fechar.
- `/painel/agentes` foi incluido entre as rotas validas do PWA standalone.

