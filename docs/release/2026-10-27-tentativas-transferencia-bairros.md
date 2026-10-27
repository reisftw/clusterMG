# Tentativas: transferencia de bairros

## Escopo

- Modulo: Retiradas / Tentativas.
- Migration: `101_tentativas_transferencia_bairros.sql`.
- Alteracao: persistencia aditiva da preferencia manual de responsavel por bairro.

## Preflight

Antes da publicacao:

1. Confirmar que as migrations `089`, `092` e `094` constam em `schema_migrations`.
2. Confirmar a existencia de `tentativas_technician_cities`, `tentativas_neighborhood_locks` e `app_users`.
3. Criar e verificar o backup padrao do banco.
4. Executar os testes de Tentativas e o build do Retiradas.

## Compatibilidade

A migration cria somente uma tabela e um indice. A versao anterior do aplicativo
nao consulta esses objetos, portanto continua compativel com o esquema expandido.

## Recuperacao

Em caso de falha, restaurar frontend e backend para o release anterior. A tabela
`tentativas_neighborhood_overrides` deve permanecer no banco para preservar as
transferencias registradas. Nao executar `DROP`, `TRUNCATE` ou exclusao dos dados.

## Validacao posterior

1. Selecionar uma cidade na aba Distribuicao.
2. Transferir um bairro para outro tecnico ativo da mesma cidade.
3. Confirmar a mudanca em Minha Carteira para ambos os tecnicos.
4. Executar novo balanceamento e confirmar que a atribuicao manual foi mantida.
5. Verificar o evento `neighborhood.transfer` na auditoria.

