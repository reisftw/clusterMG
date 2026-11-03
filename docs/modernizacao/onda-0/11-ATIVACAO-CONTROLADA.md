# Ativacao controlada

Valores iniciais recomendados:

```text
MAINTENANCE_METRICS_ENABLED=true
OBSERVABILITY_ENABLED=true
METRICS_ENABLED=false
MAINTENANCE_METRICS_FLUSH_INTERVAL_MS=60000
METRICS_MAX_ROUTE_CARDINALITY=500
METRICS_MAX_OPERATION_CARDINALITY=200
```

Procedimento:

1. CI valida migration 113 em PostgreSQL descartavel.
2. Workflow manual Retiradas aplica migrations e publica com rollback.
3. Validar `/api/health`, login e painel `/maintenance` como admin.
4. Observar erros de flush, heap, pool e P95 por 30 minutos.
5. Coletar 24 horas antes de propor a Onda 1.

Rollback: definir `OBSERVABILITY_ENABLED=false` ou reimplantar a release
anterior. `METRICS_ENABLED` permanece falso; nao habilitar SQL detalhado sem
uma necessidade de diagnostico com prazo definido.

