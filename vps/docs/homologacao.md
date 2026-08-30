# Homologacao

Ambiente separado para validar a branch `homolog-dev` sem gravar dados no banco de
producao.

## Estrutura

- Frontend: `/var/www/retiradas-homolog/dist`
- Backend: `/opt/retiradas/vps-homolog`
- API: `retiradas-api-homolog.service`
- Porta API: `3002`
- Banco: `retiradas_homolog`
- Dominio: `https://homolog.retiradas.tech`

## Clonar banco de producao para homologacao

Execute na VPS:

```bash
sudo -u postgres dropdb --if-exists retiradas_homolog
sudo -u postgres createdb -O retorninho retiradas_homolog
pg_dump -h 127.0.0.1 -U retorninho -d retiradas --no-owner --no-acl | psql -h 127.0.0.1 -U retorninho -d retiradas_homolog
```

## Configurar API de homologacao

```bash
mkdir -p /opt/retiradas/vps-homolog
cp /opt/retiradas/vps/api/api-homolog.env.example /etc/retiradas/api-homolog.env
nano /etc/retiradas/api-homolog.env
cp /opt/retiradas/vps/systemd/retiradas-api-homolog.service /etc/systemd/system/retiradas-api-homolog.service
systemctl daemon-reload
systemctl enable --now retiradas-api-homolog
systemctl status retiradas-api-homolog --no-pager
curl http://127.0.0.1:3002/api/health
```

## Configurar Nginx

```bash
cp /opt/retiradas/vps/nginx/retiradas-homolog.conf /etc/nginx/sites-available/retiradas-homolog
ln -sf /etc/nginx/sites-available/retiradas-homolog /etc/nginx/sites-enabled/retiradas-homolog
nginx -t
systemctl reload nginx
certbot --nginx -d homolog.retiradas.tech
```

## Deploy

Todo push na branch `homolog-dev` gera build com:

- `v<commit> · Homologação` no rodape
- API em `https://homolog.retiradas.tech/api`
- deploy frontend em `/var/www/retiradas-homolog/dist`
- deploy backend em `/opt/retiradas/vps-homolog`
- migrations SQL pendentes aplicadas por `npm run migrate:sql`
