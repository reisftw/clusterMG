# AUD-011 - Evolution

O ACK agora ocorre apenas depois de a confirmacao ou o callback terminar. Falhas retornam o evento a `PENDING` com backoff; depois de oito tentativas o estado `FAILED` funciona como DLQ. `requeueFailed(id)` permite recuperacao explicita.

O schema existente da migration 121 ja possui estados, tentativas e proxima execucao. Testes cobrem sucesso, falha na confirmacao, falha no callback, esgotamento e reprocessamento.

Validar em producao: taxa de `FAILED`, idade do evento pendente mais antigo, tentativas por evento e ausencia de crescimento sem consumidor. Rollback nao altera os eventos persistidos.
