# Operação do Administrativo (ADM)

## Usuário de sistema do serviço (SEC-003)

`adm-api` roda como o usuário dedicado `svc-adm` (sem shell/login, criado
com `useradd --system --no-create-home --shell /usr/sbin/nologin svc-adm`),
nunca como `root`. O `EnvironmentFile=/opt/retiradas/apps/adm/.env`
continua em modo `600` dono `root` — isso não exige rodar o serviço como
root, porque o `systemd` (PID 1, sempre root) lê o `EnvironmentFile` antes
de trocar para o usuário configurado em `User=`.

Diretórios que o `svc-adm` precisa poder escrever:

- `/opt/retiradas/apps/adm/backend/uploads` (avatares de usuário).
- `/opt/retiradas/backups/adm-postgres` (backup de banco).

Ambos devem ter dono `svc-adm:svc-adm` antes de subir o serviço com o novo
usuário. O `.service` já traz `ReadWritePaths` apontando só para esses dois
diretórios e para `/tmp`; o restante do filesystem fica somente leitura
para o processo (`ProtectSystem=strict`).

## Aplicar (manual, uma vez por servidor)

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin svc-adm
mkdir -p /opt/retiradas/apps/adm/backend/uploads
chown -R svc-adm:svc-adm /opt/retiradas/apps/adm/backend/uploads
chown -R svc-adm:svc-adm /opt/retiradas/backups/adm-postgres
cp apps/adm/ops/adm-api.service.example /etc/systemd/system/adm-api.service
systemctl daemon-reload
systemctl restart adm-api
systemctl status adm-api
```
