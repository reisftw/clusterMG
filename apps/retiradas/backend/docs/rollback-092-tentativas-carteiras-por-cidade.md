# Rollback da migration 092

A migration 092 nao apaga dados. Ela desativa associacoes de cidade pertencentes a usuarios que nao sao tecnicos e encerra suas atribuicoes ativas, preservando o historico.

O indice pode ser removido sem perda de dados:

```sql
drop index if exists tentativas_assignments_city_active_owner_idx;
```

As associacoes e atribuicoes encerradas nao devem ser reativadas automaticamente, pois isso voltaria a conceder carteiras a administradores ou BackOffice. Se houver necessidade operacional comprovada, restaure registros individualmente pela auditoria, depois de alterar o cargo do proprietario para `tecnico`.
