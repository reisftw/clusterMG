# Etapa 1 - Rollback

## Caracteristica

A alteracao nao possui migration, escrita de dados, novo segredo ou mudanca de
contrato. O rollback e somente de aplicacao.

## Procedimento

1. Interromper a publicacao se os testes de smoke falharem.
2. Reapontar frontend e backend para o artefato saudavel anterior.
3. Reiniciar somente o servico Retiradas API, se o backend tiver sido trocado.
4. Validar `/api/health`.
5. Abrir `/acompanhamento` e consultar um serial conhecido.
6. Confirmar login, RBAC e atualizacao realtime.
7. Registrar motivo, commit e horario do rollback.

Em Git, o mesmo resultado pode ser obtido revertendo o commit da Etapa 1. Nao
restaurar banco de dados: nenhum schema ou dado foi alterado.

## Sinais para rollback

- consulta serial deixa de retornar o fallback parcial existente;
- login HubSoft fica preso ou falha em todas as consultas;
- acompanhamento deixa de atualizar por realtime ou no intervalo de 60 s;
- aumento sustentado de erros 5xx nas rotas alteradas.

## Compatibilidade

O artefato anterior e posterior usa o mesmo schema da migration 113. O rollback
de aplicacao e compativel com o banco atual.
