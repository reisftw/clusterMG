# REVO - Correcao critica do dashboard publico

Data: 2026-11-14

## Resumo executivo

O endpoint `GET /api/public/static/dashboard` montava e serializava aproximadamente
59 MB de JSON a cada perda de cache. A maior parte nao era informacao nova: os
registros mensais combinados continham copias recursivas de meses anteriores nos
campos `onnet` e `onnetSempre`.

A correcao nao apaga nem reescreve o historico. O caminho padrao agora projeta no
PostgreSQL somente os campos usados pela interface, contabiliza colecoes por SQL e
impede que novas combinacoes mantenham fontes aninhadas. O contrato completo segue
disponivel com `?compact=0` para rollback funcional imediato.

## Evidencia anterior

Medicoes feitas diretamente em producao antes da alteracao:

| Endpoint | JSON | Transferencia comprimida | Tempo |
| --- | ---: | ---: | ---: |
| `/api/public/static/dashboard` | 59.235.905 bytes | 827.968 bytes | 4,94 s |
| `/api/public/static/dashboard?compact=true` | 404.948 bytes | 48.859 bytes | 4,93 s |
| `/api/public/dashboard` | 583.906 bytes | nao coletado | 0,23 s |
| `/api/public/dashboard?detail=match` | 1.131.463 bytes | nao coletado | 2,19 s |

O modo compacto anterior diminuia a resposta enviada, mas ainda carregava e montava
o documento completo na memoria. Por isso o tempo permanecia praticamente igual.

Decomposicao do snapshot completo:

| Bloco | Tamanho aproximado |
| --- | ---: |
| `metas` | 31,7 MB |
| `painel` | 27,5 MB |
| dados unicos do dashboard | 14,7 KB |

## Causa raiz

`combineMetaRecords` espalhava o registro Sempre completo para criar o consolidado.
Como esse registro ja podia conter `onnet` e `onnetSempre`, cada nova importacao
preservava a arvore anterior. Foram observados ate 32 niveis de aninhamento.

O endpoint estatico agravava o problema ao consultar documentos completos antes de
compacta-los em JavaScript. Isso aumentava leitura do PostgreSQL, alocacao de RAM,
serializacao e tempo de resposta.

## Correcao

1. O dashboard estatico usa formato compacto por padrao.
2. A projecao remove `onnet` e `onnetSempre` aninhados dentro do PostgreSQL, antes da transferencia.
3. Totais de feriados, ferias e colaboradores sao calculados com `count(*)`, sem carregar listas completas.
4. Novos consolidados descartam fontes recursivas antes de persistir o resultado.
5. `?compact=0` preserva temporariamente o contrato completo para consumidores legados.
6. O teste de desempenho bloqueia respostas compactas acima de 500 KB.

Nenhuma migration, exclusao ou reescrita dos documentos historicos foi executada.

## Auditoria das APIs

As rotas publicas foram medidas individualmente. As rotas autenticadas nao foram
forcadas sem uma sessao de teste, para evitar contornar autorizacao ou alterar dados
operacionais.

| Grupo | Resultado | Acao |
| --- | --- | --- |
| Dashboard estatico | Gargalo critico confirmado | Corrigido na origem e na leitura |
| Dashboard publico | Resposta funcional, abaixo de 1 s na amostra | Mantido |
| Detalhe de match | Aproximadamente 2,19 s na amostra | Monitorar; fora do hotfix |
| Mapa publico | Aproximadamente 0,09 s na amostra | Mantido |
| Match publico | Aproximadamente 0,18 s na amostra | Mantido |
| Agentes publico | Aproximadamente 0,10 s na amostra | Mantido |
| Rotas autenticadas | Sem credencial dedicada para teste destrutivo seguro | Validar por telemetria apos deploy |

O teste controlado de leitura publica executado antes desta correcao completou 6.555
requisicoes entre 10 e 1.000 usuarios concorrentes sem erro. Ele comprova apenas o
caminho publico em cache; nao comprova a capacidade total das telas autenticadas.

## Validacao automatizada

| Gate | Resultado |
| --- | --- |
| Lint Retiradas | Aprovado |
| Frontend | 111 arquivos e 630 testes aprovados |
| Build de producao | Aprovado |
| Contratos compartilhados | 14 testes aprovados |
| Regressao do dashboard | 4 testes aprovados |
| Limite do snapshot compacto | Menor que 500 KB em base representativa |

## Matriz antes, depois e producao

| Correcao | Antes reproduzido | Depois automatizado | Metrica em producao |
| --- | --- | --- | --- |
| Payload recursivo | 59,2 MB e 4,94 s | Projecao compacta abaixo de 500 KB | bytes, P50, P95 e P99 da rota |
| Compactacao tardia | Compacto ainda levava 4,93 s | SQL nao retorna fontes aninhadas | tempo SQL e RAM do processo |
| Crescimento futuro | Consolidado retinha fontes antigas | teste rejeita novo aninhamento | tamanho mensal dos documentos |
| Compatibilidade | Contrato completo era padrao | escape `?compact=0` testado | erros 4xx/5xx por consumidor |

## Publicacao e rollback

Publicacao: workflow manual oficial de Retiradas, somente depois de CI, seguranca e
Sonar aprovados.

Rollback de aplicacao: executar o workflow oficial com a revisao anterior. Rollback
funcional imediato: chamar o endpoint com `?compact=0`. Nao ha rollback de banco,
pois nao existe migration nem alteracao destrutiva.

## Gate pos-deploy

Considerar a entrega validada somente quando:

- `/api/health` responder com sucesso;
- o endpoint padrao responder abaixo de 500 KB;
- P95 permanecer abaixo de 2 s e erros abaixo de 1%;
- nao houver aumento de 5xx, espera do pool ou consumo de RAM;
- snapshots continuarem atualizados dentro do SLA;
- o formato completo continuar acessivel apenas pelo escape documentado.

