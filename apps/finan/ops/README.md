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

## Usuário de sistema do serviço (SEC-003)

`finan-api`, `finan-calendar-alerts` e `finan-db-backup` rodam como o usuário
dedicado `svc-finan` (sem shell/login, criado com
`useradd --system --no-create-home --shell /usr/sbin/nologin svc-finan`),
nunca como `root`. O `EnvironmentFile=/opt/retiradas/apps/finan/.env`
continua em modo `600` dono `root` — isso não exige rodar o serviço como
root, porque o `systemd` (PID 1, sempre root) lê o `EnvironmentFile` antes
de trocar para o usuário configurado em `User=`.

Diretórios que o `svc-finan` precisa poder escrever:

- `/opt/retiradas/backups/finan` (dono `svc-finan:svc-finan`, criado
  antecipadamente — o diretório pai `/opt/retiradas/backups` continua
  `www-data:www-data` e não precisa ser alterado).

Os três `.service` já trazem `ReadWritePaths` apontando só para esse
diretório e para `/tmp`; o restante do filesystem fica somente leitura
para o processo (`ProtectSystem=strict`).
