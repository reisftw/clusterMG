# Diagnostico inicial

Data: 2026-11-14. Escopo: Retiradas e o contrato compartilhado com Mercado. Operacao, ADM e Financeiro nao foram alterados.

| ID | Comportamento anterior reproduzido | Risco |
|---|---|---|
| AUD-009 | Dois consumidores podiam selecionar o mesmo webhook Meta ainda `PENDING`. | Efeito duplicado e status divergente. |
| AUD-010 | Jobs automaticos compartilhavam o owner `system`; uma instancia podia liberar o lock de outra. | Execucoes simultaneas e snapshot inconsistente. |
| AUD-011 | A falha da confirmacao Evolution era absorvida e o evento podia ser confirmado. | Mensagem perdida sem recuperacao. |
| AUD-012 | Chamadas externas auditadas nao tinham limite uniforme, backoff e concorrencia controlada. | Pool e jobs presos durante indisponibilidade externa. |
| AUD-013 | Toda atualizacao reconstruia todos os marcadores do Maps. | Custo proporcional a milhares de pontos, mesmo para delta unitario. |
| AUD-014 | O service worker ativava e recarregava a pagina sem decisao do usuario. | Perda de contexto e formularios em andamento. |
| AUD-015 | O rollback da aplicacao nao provava compatibilidade com migrations da release. | Versao antiga sobre schema incompatível. |

Baseline funcional herdada da etapa anterior: 110 arquivos de teste e 625 testes. A primeira execucao desta etapa detectou 15 falhas causadas pela tentativa de remover uma dependencia usada por Documentos; a mudanca foi desfeita antes de commit ou publicacao.
