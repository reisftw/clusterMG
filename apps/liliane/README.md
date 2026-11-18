# Aprovações Lili

Aplicação isolada publicada sob `/liliane`, com API em `/liliane/api`.

## Componentes

- React/Vite/TypeScript em `frontend`.
- Express/TypeScript em `backend`.
- Banco PostgreSQL exclusivo `aprovacoes_lili`.
- Instância Evolution, PostgreSQL e Redis exclusivos definidos em `ops/docker-compose.evolution.yml`.
- Serviço systemd próprio em `ops/liliane-api.service`.

## Validação local

```bash
npm ci --prefix apps/liliane/backend
npm ci --prefix apps/liliane/frontend
npm run verify:liliane
```

## Segurança operacional

O primeiro provisionamento exige `BOOTSTRAP_ADMIN_PASSWORD` forte. O valor não é versionado e deixa de ter efeito depois que o administrador existe. Segredos TOTP são cifrados com AES-256-GCM. Decisões por WhatsApp só são aceitas da instância, enquete e aprovador vinculados à solicitação.

## Backup e restauração

Faça backup do banco antes de cada release:

```bash
sudo -u postgres pg_dump -Fc aprovacoes_lili > /opt/liliane/backups/aprovacoes_lili.dump
```

Restaure em um banco vazio e valide `/liliane/api/health` antes de trocar o symlink `current`. A aplicação usa releases imutáveis em `/opt/liliane/releases`; rollback consiste em apontar `current` para a release anterior e reiniciar `liliane-api.service`. As migrações desta primeira versão são aditivas.

## Publicação

O CI do GitHub apenas valida testes, build e dependências. O deploy é manual. Gere os builds, envie `backend/dist`, `backend/migrations`, os manifests do backend, `frontend/dist` e `ops` para uma pasta temporária da VPS e execute:

```bash
bash ops/install-manual.sh /tmp/liliane-release <commit-ou-versao>
```

Na primeira instalação, a senha provisória fica disponível somente para root em `/opt/liliane/shared/bootstrap-admin.txt`. Depois do bootstrap, o segredo é removido do ambiente da aplicação.
