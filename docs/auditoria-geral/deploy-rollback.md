# Deploy e rollback

## Publicacao

1. Integrar somente apos CI Retiradas, contratos e seguranca verdes.
2. Iniciar manualmente o workflow oficial de Retiradas.
3. Nao publicar Operacao, ADM ou Financeiro como efeito colateral.
4. Verificar health, login, Mapa, Mensageria, snapshots e jobs apos a publicacao.

## Rollback independente

- Documentos: reverter o commit restaura as rotas anteriores; preferir manter o bloqueio e corrigir consumidores, pois a reversao reabre exposicao anonima.
- Maps: reverter apenas `MapsPage.jsx` e `mapsService.js`; nao envolve dados.
- Modal/PWA: reverter `ModalShell.jsx` ou `main.jsx`; nao envolve dados.
- Runner: reverter o codigo nao apaga a tabela convertida. `file_name` preserva os registros anteriores e e compativel com a informacao antiga.

## Migration runner

A conversao de `schema_migrations` e aditiva. Antes do deploy, o teste PostgreSQL cria uma tabela no formato legado, converte a chave e comprova que dois arquivos `013` coexistem. Se o teste falhar, a publicacao deve parar antes de alterar producao.

## Observacao

Rollback automatico de banco nao foi introduzido: restaurar schema sem avaliar dados posteriores pode causar perda. A estrategia e interromper antes da aplicacao quando os gates falharem e tratar reversao de dados como procedimento supervisionado.

