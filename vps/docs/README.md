# Retiradas API Docs

Documentacao Swagger/OpenAPI para publicar em `https://docs.retiradas.tech`.

## Estrutura

- `index.html`: Swagger UI estatico.
- `openapi.yaml`: contrato inicial da API REST.
- `nginx/retiradas-docs.conf`: exemplo de Nginx para o subdominio.
- Acesso: login do proprio sistema Retiradas. O Nginx proxya `/api` para a API local e a tela dos docs aplica o JWT automaticamente no Swagger.

## Deploy recomendado

No computador local:

```powershell
cd C:\Users\rodri\Desktop\vps-producao\retiradas
scp -r .\vps\docs\* root@145.223.27.204:/var/www/retiradas-docs/
scp .\vps\nginx\retiradas-docs.conf root@145.223.27.204:/etc/nginx/sites-available/retiradas-docs
```

Na VPS:

```bash
mkdir -p /var/www/retiradas-docs
chown -R www-data:www-data /var/www/retiradas-docs
ln -sf /etc/nginx/sites-available/retiradas-docs /etc/nginx/sites-enabled/retiradas-docs
nginx -t
systemctl reload nginx
certbot --nginx -d docs.retiradas.tech
```

## DNS

Criar registro:

```text
Tipo: A
Nome: docs
Valor: 145.223.27.204
```

## Validacao

```bash
nginx -t
systemctl reload nginx
curl -I https://docs.retiradas.tech
```
