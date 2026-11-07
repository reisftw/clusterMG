# Rollback

## Aplicacao

O workflow oficial mantem o release anterior e o backup do banco. Em regressao critica, restaurar o release anterior pelo mecanismo do proprio workflow e reiniciar `retiradas-api.service`.

## Banco

A migration 121 e aditiva. O codigo anterior ignora as novas colunas, indices e a tabela de inbox, portanto o rollback de codigo nao exige remocao imediata de schema.

Para minimizar risco, nao remover automaticamente:

- `evolution_webhook_events`;
- checkpoints de jobs;
- indices novos.

Se a fila Evolution for desativada, interromper primeiro o worker pela reversao do codigo. Manter eventos persistidos para auditoria. Nao executar `DELETE`, `TRUNCATE` ou reversao de dados operacionais.

## Recuperacao historica

O backfill e idempotente. Em falha, manter os registros ja persistidos e retomar pelo checkpoint; nao restaurar um banco apenas para desfazer leituras validas.
