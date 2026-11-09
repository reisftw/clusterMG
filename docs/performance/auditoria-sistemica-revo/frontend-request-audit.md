# Auditoria de requisições do frontend

Foram localizadas 247 ocorrências estáticas de timers/schedulers. A maior concentração está em `AcompanhamentoPage`, cancelamentos, Maps e configurações HubSoft. A contagem inclui timeouts de UI e não autoriza remoção em massa.

Problemas P1 confirmados nesta entrega estavam no caminho de leitura do backend: requisições simultâneas aguardavam a mesma reconstrução de cache. A correção mantém os contratos HTTP e passa a compartilhar uma única atualização, servindo o último resultado íntegro durante a revalidação.

Não foi introduzida uma segunda biblioteca de fetching. Pollings funcionais de localização, alertas e operação foram preservados. Uma revisão individual dos 247 candidatos permanece P2 e exige teste de comportamento por tela.
