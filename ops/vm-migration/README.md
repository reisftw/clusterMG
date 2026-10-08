# Migracao para VM da empresa

Este diretorio deixa Retiradas e Operacao separados para migracao. Ele nao
inclui segredos reais. Preencha os `.env` na VM com base nos arquivos
`.example` antes de iniciar os servicos.

## Separacao dos apps

| App | Branch fonte | Frontend | Backend | Porta API | Systemd | Dominio esperado |
| --- | --- | --- | --- | --- | --- | --- |
| Retiradas | `master` | `/var/www/retiradas/dist` | `/opt/retiradas/vps` | `3001` | `retiradas-api.service` | `retiradas.sempre.net.br` |
| Operacao | `operacao` | `/opt/retiradas/apps/rot/frontend/dist` | `/opt/retiradas/apps/rot/backend` | `3201` | `rot-api.service` | `operacao.sempre.net.br` |

## Arquivos preparados

- `scripts/prepare-packages.ps1`: gera pacotes separados para copiar para a VM.
- `scripts/prepare-offline-deps.sh`: valida dependencias versionadas para instalar em redes restritas.
- `scripts/install-retiradas.sh`: instala/publica somente Retiradas.
- `scripts/install-operacao.sh`: instala/publica somente Operacao.
- `NETWORK-MATRIX.md`: portas, destinos e liberacoes para BTP/firewall.
- `vendor/xlsx-0.20.3.tgz`: copia local do `xlsx`, para evitar bloqueio do `cdn.sheetjs.com`.
- `env/retiradas.api.env.example`: variaveis do Retiradas.
- `env/operacao.env.example`: variaveis da Operacao.
- `systemd/*.service`: servicos separados.
- `nginx/*.conf`: vhosts separados.

## Preparar pacotes neste computador

No PowerShell, dentro da raiz do repo:

```powershell
.\ops\vm-migration\scripts\prepare-packages.ps1
```

Saida esperada:

```text
dist-vm-migration/
  retiradas-dist.tar.gz
  retiradas-backend.tar.gz
  operacao-app.tar.gz
```

Se quiser gerar apenas um app:

```powershell
.\ops\vm-migration\scripts\prepare-packages.ps1 -App retiradas
.\ops\vm-migration\scripts\prepare-packages.ps1 -App operacao
```

## Checklist da VM nova

1. Instalar base:

```bash
apt update
apt install -y nginx postgresql postgresql-client nodejs npm tar curl
```

Se o repositorio for clonado direto na VM, prepare as dependencias offline antes do `npm ci`:

```bash
cd /opt/clusterMG-source
bash ops/vm-migration/scripts/prepare-offline-deps.sh
```

2. Criar usuarios de servico:

```bash
adduser --system --group --home /var/www www-data || true
adduser --system --group --home /opt/retiradas/apps/rot operacao || true
```

3. Criar bancos separados. Sugestao:

```bash
sudo -u postgres psql
create user retiradas_user with encrypted password 'TROCAR';
create database retiradas owner retiradas_user;
create user operacao_user with encrypted password 'TROCAR';
create database operacao owner operacao_user;
\q
```

4. Copiar pacotes e arquivos desta pasta para a VM.

5. Criar envs:

```bash
mkdir -p /etc/retiradas /opt/retiradas/apps/rot
cp env/retiradas.api.env.example /etc/retiradas/api.env
cp env/operacao.env.example /opt/retiradas/apps/rot/.env
nano /etc/retiradas/api.env
nano /opt/retiradas/apps/rot/.env
chmod 600 /etc/retiradas/api.env /opt/retiradas/apps/rot/.env
```

6. Instalar servicos e nginx:

```bash
cp systemd/retiradas-api.service /etc/systemd/system/retiradas-api.service
cp systemd/rot-api.service /etc/systemd/system/rot-api.service
cp nginx/retiradas.conf /etc/nginx/sites-available/retiradas
cp nginx/operacao.conf /etc/nginx/sites-available/operacao
ln -sf /etc/nginx/sites-available/retiradas /etc/nginx/sites-enabled/retiradas
ln -sf /etc/nginx/sites-available/operacao /etc/nginx/sites-enabled/operacao
systemctl daemon-reload
nginx -t
```

7. Publicar cada app:

```bash
bash scripts/install-retiradas.sh /tmp/retiradas-dist.tar.gz /tmp/retiradas-backend.tar.gz
bash scripts/install-operacao.sh /tmp/operacao-app.tar.gz
```

8. Conferir:

```bash
systemctl status retiradas-api.service --no-pager
systemctl status rot-api.service --no-pager
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3201/api/health
nginx -t
```

## Dados que precisam ser migrados

Antes de virar DNS, exporte da VPS atual e restaure na VM:

```bash
pg_dump --format=custom --no-owner --no-privileges --file /tmp/retiradas.dump "$DATABASE_URL"
pg_restore --clean --if-exists --no-owner --dbname "$NOVA_DATABASE_URL" /tmp/retiradas.dump
```

Para Operacao, use o banco `ROT_DATABASE_URL` atual e restaure no banco da
Operacao novo. Tambem copie uploads/anexos, se existirem:

```bash
rsync -a /opt/retiradas/vps/uploads/ NOVA_VM:/opt/retiradas/vps/uploads/
rsync -a /opt/retiradas/apps/rot/backend/uploads/ NOVA_VM:/opt/retiradas/apps/rot/backend/uploads/
```

## Ordem recomendada

1. Subir VM com dois apps em paralelo, sem trocar DNS.
2. Restaurar banco e uploads.
3. Testar health/API/telas usando IP ou dominio temporario.
4. Rodar uma sincronizacao controlada do HubSoft/Playwright no Retiradas.
5. Trocar DNS.
6. Manter VPS antiga ligada por algumas horas para rollback.

