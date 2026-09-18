# Retencao e minimizacao de dados

## Escopo

Esta politica tecnica cobre os dados criados pela esteira, Mercado e auditoria.
A base legal e os prazos finais devem ser aprovados por DPO/Juridico antes do
gate de producao. O sistema aplica os prazos abaixo como limites padrao, sem
impedir reducao posterior.

| Dado | Finalidade | Retencao | Controle |
| --- | --- | --- | --- |
| Recibo idempotente | Evitar repeticao de comando | 7 dias | Exclusao diaria por `expires_at` |
| Rate limit | Prevencao de abuso | 10 minutos | Exclusao diaria por `expires_at` |
| IP do Mercado | Prevencao de fraude | Nao armazenado em claro | HMAC com secret gerenciado |
| Metadados de navegador | Investigacao de abuso | 90 dias | Remocao automatica do documento de compra |
| Logs da esteira | Auditoria operacional | 730 dias | Exclusao diaria por `criado_em` |
| Activity log legado | Auditoria operacional | 730 dias | Exclusao diaria por `criado_em` |

## Controles

- O IP bruto nao e persistido.
- O hash usa HMAC e o secret `AUDIT_HASH_SECRET`.
- O secret nao pode ser exposto no frontend ou em arquivo versionado.
- Recibos, indices e rate limits nao podem ser lidos por clientes Firebase.
- A Function `cleanupPrivacyRetention` executa diariamente.
- Cada execucao processa no maximo 400 documentos por categoria para manter
  tempo e custo previsiveis; execucoes seguintes drenam eventual backlog.

## Dados pessoais da esteira

O comando administrativo `customer_anonymize` localiza o titular pelo indice
SHA-256 do codigo, anonimiza atomicamente o cliente no bloco e o agendamento
associado, encerra o indice e grava auditoria sem nome, telefone ou codigo
legivel. As bases legais aceitas sao codigos controlados:

- `data_subject_request`
- `retention_expired`
- `legal_determination`

Texto livre nao e persistido no log para impedir que a justificativa se torne
uma nova fonte de dados pessoais. Evidencias e aprovacoes devem permanecer no
processo corporativo do encarregado de dados.

## Pendencia vinculada a Fase 2

Clientes ainda vivem dentro de arrays de blocos. A operacao individual e
eficiente porque usa o indice, mas a retencao automatica em massa requer
documentos de cliente com `terminal_at` e `privacy_expires_at`. Essa migracao
tambem eliminara reescritas concorrentes do bloco e permitira paginacao.
