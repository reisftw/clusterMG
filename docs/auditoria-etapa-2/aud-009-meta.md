# AUD-009 - Webhook Meta

## Causa e correcao

O consumidor lia eventos pendentes sem reservar a linha. A correcao usa um unico `UPDATE` com `FOR UPDATE SKIP LOCKED`, muda o estado para `PROCESSING`, grava um token UUID por worker e incrementa tentativas. A conclusao ou falha exige o mesmo token. Claims abandonados por mais de cinco minutos voltam a ser elegiveis.

A migration `125_webhook_claims_and_reliability.sql` e aditiva e inclui indice parcial para a fila ativa.

## Evidencia

Testes cobrem reentrega simultanea e dois workers concorrentes. O efeito esperado em producao e um unico processamento por `dedupe_key`, sem crescimento anormal de claims expirados.

## Rollback

O codigo anterior ignora as colunas novas; portanto, rollback de aplicacao e compatível e nao exige remover dados.
