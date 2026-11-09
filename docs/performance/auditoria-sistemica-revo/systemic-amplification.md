# Amplificações sistêmicas

| Padrão | Antes | Correção |
| --- | --- | --- |
| Leitura concorrente | N consumidores aguardavam/repetiam uma reconstrução expirada | Uma reconstrução por chave; snapshot anterior servido imediatamente |
| Banco | Resumo operacional chegava a ~19,75 SQL por acesso na janela recente | A maioria dos acessos usa o resultado compartilhado durante o TTL/revalidação |
| HubSoft | Falha podia gerar retries imediatos e nova tentativa no minuto seguinte | Backoff persistido de 15 min e retries internos padrão zero |
| LOJA | Rotina diária e horário da meta podiam executar LOJA no mesmo ciclo | Uma execução de LOJA por ciclo |
| Notificações | IDs enviados pelo cliente chegavam à atualização | O servidor recarrega e filtra cada ID pelo usuário autenticado |

O cache reduz trabalho redundante, mas não substitui atualização da fonte. A idade do snapshot permanece observável.
