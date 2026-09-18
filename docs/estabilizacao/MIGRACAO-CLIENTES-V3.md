# Migracao de clientes da esteira para schema v3

## Objetivo

Mover clientes de arrays nos blocos para documentos individuais em
`agendamento_esteira_clientes`, preservando disponibilidade e rollback. O ID do
documento e SHA-256 de `bloco_id:cliente_id`, tornando a migracao idempotente.

## Sequencia

1. Publicar Functions com dual-write e regras negando acesso direto.
2. Executar em homologacao:
   `npm run backfill:scheduling-customers`
3. Corrigir qualquer cliente sem ID ou duplicado.
4. Aplicar:
   `npm run backfill:scheduling-customers:apply`
5. Reconciliar cada documento:
   `npm run backfill:scheduling-customers:verify`
6. Publicar API paginada que le os documentos v3.
7. Ativar leitura v3 por feature flag para usuarios internos.
8. Comparar contadores de bloco e status de clientes por 24 horas.
9. Parar de gravar a projecao `clientes` no array.
10. Remover arrays somente depois da janela de rollback.

## Rollback

Enquanto o dual-write estiver ativo, desabilitar a leitura v3 restaura a tela
ao array legado sem perda. Depois da remocao dos arrays, rollback exige gerar a
projecao a partir dos documentos v3; por isso a remocao nao pode ocorrer antes
da reconciliacao e da janela de observacao.

## Criterios de aceite

- Zero conflitos no dry-run.
- Zero documentos ausentes ou divergentes no `--verify`.
- Todas as transicoes escrevem bloco, cliente, auditoria e recibo na mesma
  transacao.
- Nenhum cliente Firebase possui leitura ou escrita direta na colecao v3.
- Consultas paginadas usam `bloco_id`, `status` e `ordem`.
- Retencao usa `privacy_expires_at` e preserva somente dados agregados.
