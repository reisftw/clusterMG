# Retiradas: continuidade da lista e bairros temporarios

## Escopo

- Modulo: Retiradas / Tentativas.
- Migration: `124_tentativas_bairro_solicitacoes.sql`.
- A lista operacional preserva pagina e posicao depois da classificacao.
- Tecnicos associados a cidade podem solicitar um bairro com exclusividade por 1 a 24 horas.
- `Todos os bairros` permanece compartilhado; uma reserva ativa impede outro tecnico de iniciar contato naquele bairro.

## Preflight

1. Confirmar que `tentativas_technician_cities`, `tentativas_opportunities` e `app_users` existem.
2. Confirmar que nao existe outra migration `124` aplicada com conteudo diferente.
3. Criar e verificar o backup exigido pelo procedimento de release.
4. Executar `npm run verify:retiradas` e `npm run test:contracts`.

## Compatibilidade e recuperacao

A migration apenas cria a tabela e os indices de reservas. Nenhum dado existente e alterado ou removido. Uma reversao da aplicacao pode ignorar a nova tabela e continuar usando a distribuicao anterior. A tabela nao deve ser removida durante o rollback; sua remocao, se algum dia necessaria, exige uma migration separada e revisada.

## Validacao apos publicacao

1. Solicitar um bairro como tecnico e confirmar o horario de expiracao.
2. Confirmar que outro tecnico da mesma cidade nao consegue abrir nem contatar clientes desse bairro durante a reserva.
3. Confirmar que `Todos os bairros` continua disponivel e omite bairros reservados por outro tecnico.
4. Classificar um contato em uma pagina posterior e confirmar retorno a mesma pagina e posicao.
5. Apos o vencimento, confirmar que o bairro volta a ficar disponivel sem acao manual.
