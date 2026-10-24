# Rollback 091 - métricas da Gestão de Tentativas

A migration `091_tentativas_gestao_metricas.sql` não remove tabelas ou dados.
Ela normaliza como contato efetivo os registros históricos que já estavam
confirmados e classificados com resultado de resposta, além de criar índices.

Em rollback operacional, mantenha a normalização histórica e remova somente os
índices novos, caso seja necessário investigar regressão de plano de execução:

```sql
drop index if exists tentativas_contacts_created_opportunity_idx;
drop index if exists tentativas_contacts_effective_created_idx;
drop index if exists tentativas_opportunities_completed_idx;
drop index if exists tentativas_recovery_equipments_validated_idx;
```

Não reverta `effective_contact` para `false`: a informação anterior era
incompleta e não é possível distinguir com segurança registros antigos de
novos apenas pela data.
