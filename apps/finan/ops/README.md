# Operação do Finan

Templates para a futura publicação em `finan.retiradas.tech`.

Nada aqui é aplicado automaticamente. São referências para quando o ambiente dedicado for criado na VPS.

## Portas sugeridas

- Frontend estático: servido pelo Nginx.
- Backend: `127.0.0.1:3101`.

## Ordem sugerida na VPS

1. Criar banco `finan`.
2. Configurar `.env` com `FINAN_DATABASE_URL`.
3. Rodar `npm install` em `apps/finan/backend`.
4. Rodar `npm run finan:migrate`.
5. Rodar `npm run finan:migrate:from-retiradas` com `RETIRADAS_DATABASE_URL`.
6. Buildar frontend com `npm run finan:frontend:build`.
7. Configurar systemd e Nginx.
8. Validar `/api/finan/health`.
