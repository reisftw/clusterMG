# AUD-015 - Rollback seguro

Rollback automatico de schema continua proibido porque pode apagar dados gravados depois da release. A seguranca foi fechada por compatibilidade: a CI identifica migrations SQL novas e bloqueia `DROP TABLE`, `DROP COLUMN`, renomes, alteracao de tipo e `TRUNCATE`.

Assim, a release integrada aceita apenas migrations aditivas que a versao anterior consegue ignorar. Uma migration destrutiva exige release separada, manutencao, backup verificado e plano supervisionado.

O deploy existente gera dump antes das migrations, valida o arquivo com `pg_restore --list` e mantem rollback atomico da aplicacao. O novo contrato e testado em CI e no workflow manual de release.

Rollback desta entrega: reativar o release anterior de frontend/backend; manter as colunas aditivas da migration 125. Nao remover claims nem restaurar dump em operacao normal.
