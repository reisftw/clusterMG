# Auditoria de processamento no backend

| Categoria | Rotas | Diagnóstico |
| --- | --- | --- |
| B - snapshot/cache | dashboards e resumo operacional | Não chamam HubSoft; agregações simultâneas eram consolidadas apenas enquanto o cache estava fresco |
| D - processamento pesado | recuperação de ativos | Já separado em job e snapshot na correção anterior |
| E - integração externa | sincronizações MAPA/MATCH/META/LOJA/MULTAS | Executadas pelo scheduler, fora das rotas de dashboard |
| F - mutação | notificações lidas | IDs do cliente precisavam ser revalidados no servidor |

Na janela pré-deploy mais recente, `/api/acompanhamento/operational-summary` teve 1.517 acessos, média de 180,38 ms e 29.961 consultas SQL, aproximadamente 19,75 consultas por acesso. A correção serve o snapshot em memória durante a atualização e informa `X-Cache-Status` e `X-Cache-Age-Ms`.
