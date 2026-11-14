# AUD-010 - Locks HubSoft

Cada lock agora recebe owner composto por identidade da instancia, processo, ator e UUID da execucao. Renovacao e liberacao exigem `profile`, `run_id` e owner. O heartbeat renova jobs longos e a limpeza de expirados confirma os mesmos valores observados antes de remover a linha, evitando corrida.

Nao houve mudanca de schema: `hubsoft_sync_locks.locked_by` ja suporta a identidade. Testes provam owners diferentes e liberacao condicionada.

Metricas de validacao: nenhuma sobreposicao por profile, nenhum `LOCK_LOST` em fluxo normal e retomada de locks realmente expirados. Rollback e somente de aplicacao.
