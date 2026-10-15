# Rollback V6 do Mercado

Cada publicação preserva a release anterior em `/var/www/mercado/releases` e um backup do backend em `/opt/retiradas/backups/mercado`.

Para retornar o frontend, aponte `/var/www/mercado/current` para a release anterior, teste `nginx -t` e recarregue o Nginx. Para retornar o backend, restaure o arquivo versionado salvo no backup e reinicie `retiradas-api.service`.

Nenhuma migração destrutiva é executada no deploy V6.
