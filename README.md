# Gestao Retiradas

Aplicacao React/Vite para a operacao de retiradas, usando backend proprio em VPS e PostgreSQL.

## Stack atual

- Frontend: React, Vite, Tailwind e lucide-react.
- Backend: Node.js/Express em `/vps/api`.
- Banco: PostgreSQL na VPS.
- Hospedagem: Nginx em `https://retiradas.tech`.
- Autenticacao: usuarios locais na tabela `app_users`.
- Dados operacionais: documentos JSON em `app_documents` e snapshots em `static_snapshots`.
- Backups: `pg_dump` diario via systemd timer.

## Scripts

```bash
npm run dev
npm run build
npm test
npm run test:coverage
```

## Variaveis do frontend

Copie `.env.example` para `.env`:

```env
VITE_API_BASE_URL=https://retiradas.tech/api
VITE_DATA_BACKEND=vps
```

## VPS

Os arquivos da API, SQL, backups e services ficam em `vps/`.

Principais comandos no servidor:

```bash
cd /opt/retiradas/vps
npm install
systemctl restart retiradas-api
curl https://retiradas.tech/api/health
```

## Deploy do frontend

```powershell
npm.cmd run build
scp -r .\dist\* root@145.223.27.204:/var/www/retiradas/dist/
```

No servidor:

```bash
chown -R www-data:www-data /var/www/retiradas/dist
```

## Backups

A tela **Configuracao > Banco de Dados** lista backups, tamanho do banco, quota e permite rollback com confirmacao.

O timer roda diariamente as 00:01:

```bash
systemctl list-timers --all | grep retiradas
```

## Monitoramento

A tela **Configuracao > APIs** monitora:

- API principal
- login
- banco de dados
- documentos
- dados publicos
- importacoes
- backups
- tempo real
