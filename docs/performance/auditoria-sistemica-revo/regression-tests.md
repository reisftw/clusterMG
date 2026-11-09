# Testes de regressão

Cobertura adicionada:

- cache frio, hit, revalidação concorrente, falha e modo bloqueante;
- resumo operacional compartilhado e metadados de idade;
- dashboard sem dependência de sincronização HubSoft;
- notificação por ID, usuário, e-mail, cargo, regional e empresa;
- notificação chegada durante “marcar todas” permanece não lida;
- backoff após falha e próxima janela normal;
- LOJA não executa duas vezes no mesmo ciclo;
- desativação da localização nativa no APK;
- contrato de release único com publicação Android opcional.

O workflow de CI e o workflow de release executam os testes críticos do backend explicitamente, além do Vitest, contratos e build.

Validação local final: 106 arquivos Vitest, 602 testes aprovados, 22 testes críticos do backend aprovados, 12 contratos de CI/CD aprovados, 3 testes de privacidade do Mercado aprovados e build Vite de produção concluído.
