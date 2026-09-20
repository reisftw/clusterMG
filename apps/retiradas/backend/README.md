# Retiradas VPS

Camada operacional do sistema Retiradas na VPS `145.223.27.204`, atendendo o dominio `https://retiradas.tech`.

## Componentes

- `api/`: API Node/Express usada pelo frontend.
- `sql/001_app_documents.sql`: schema inicial do PostgreSQL.
- `sql/003_rename_legacy_tables.sql`: migracao para renomear tabelas antigas da primeira carga.
- `scripts/import-documents-jsonl.js`: importador JSONL para `app_documents`.
- `scripts/seed-local-auth-users.js`: cria usuarios locais a partir da colecao `usuarios`.
- `scripts/database-backup.js`: gera backups PostgreSQL.
- `systemd/retiradas-api.service`: servico da API.
- `systemd/retiradas-db-backup.service` e `.timer`: backup diario as 00:01.

## Banco

```bash
psql -h 127.0.0.1 -U retorninho -d retiradas -f /opt/retiradas/vps/sql/001_app_documents.sql
```

Em servidores que ainda possuem nomes legados da primeira migracao:

```bash
psql -h 127.0.0.1 -U retorninho -d retiradas -f /opt/retiradas/vps/sql/003_rename_legacy_tables.sql
```

## Importacao JSONL

```bash
cd /opt/retiradas/vps
npm run import:documents -- --file output/documents-export.jsonl
```

## API

```bash
cd /opt/retiradas/vps
npm install
npm run api:start
```

Healthcheck:

```bash
curl http://127.0.0.1:3001/api/health
```

## Backup

```bash
systemctl enable --now retiradas-db-backup.timer
systemctl list-timers --all | grep retiradas
```

Backup manual:

```bash
cd /opt/retiradas/vps
npm run backup:database
```
