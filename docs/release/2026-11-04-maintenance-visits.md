# Retiradas - historico de visitas da manutencao

- Modulo: Retiradas
- Migration: `120_maintenance_visit_metrics.sql`
- Impacto: tabela agregada diaria, trigger de consolidacao e leitura administrativa
  de visitas mensais e acumuladas.
- Preflight: validar que `maintenance_service_worker_events` existe e que o
  usuario da migration pode criar tabela, funcao e trigger no schema ativo.
- Compatibilidade: aditiva; a versao anterior da aplicacao ignora a nova tabela.
- Recuperacao: restaurar o backend anterior. A tabela e o trigger podem permanecer
  inertes. Se a remocao for indispensavel, executar o rollback comentado no topo
  da migration somente depois de confirmar o backup criado pelo deploy.
- Evidencia de producao: preencher com commit, backup, operador, horario e resultado
  do smoke test ao concluir a publicacao.
