# Deploy em producao

Status inicial: nao publicado. A publicacao deve ocorrer somente pela branch `master`, apos PR aprovado e CI verde, usando o workflow manual `Prepare Retiradas Release`.

Sequencia: gerar candidato verificavel, validar checksum e manifest, criar backup de aplicacao e dump PostgreSQL validado, aplicar migration 125, publicar backend, health local, troca atomica do frontend, health publico e smoke tests.

Validacao: `/api/health`, login, Maps, Meta, Evolution, ultima execucao de jobs HubSoft, idade dos snapshots, 5xx e latencia. Atualizar este documento com commit, workflow, horario e resultado real; nao declarar producao com base apenas no build local.
