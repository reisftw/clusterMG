# Backlog de hardening — `finan-api.service`

Etapa 8, Fase 9. Auditoria dos arquivos versionados relacionados ao serviço do Finan na VPS. **Nenhuma alteração foi feita no serviço real em produção** — este documento é só o plano, para execução e teste em uma etapa futura.

## Por que hoje usa `User=root`

`apps/finan/ops/finan-api.service.example` define `User=root` (linha `User=root`, sem hardening adicional — nenhum `ProtectSystem`, `NoNewPrivileges`, `CapabilityBoundingSet`, etc.). Isso destoa do padrão já aplicado em `apps/adm/ops/adm-api.service.example` (`User=svc-adm`) e `apps/operacao/ops/rot-api.service.example` (`User=operacao`), ambos com `ProtectSystem=strict`, `NoNewPrivileges=true`, `CapabilityBoundingSet=` vazio, etc.

Não há comentário no arquivo explicando a escolha por `root` — não foi encontrada justificativa técnica documentada no repositório. A hipótese mais provável, por analogia com o histórico do próprio Retiradas (`apps/retiradas/backend/systemd/retiradas-api.service`, que já usa `User=www-data`), é que o Finan foi provisionado antes de o padrão de usuário dedicado (`svc-*`) ser adotado para os apps novos do monorepo (ADM e Operação vieram depois, na mesma leva de reorganização). **Isso é uma inferência, não um fato documentado** — deve ser confirmado com quem provisionou o serviço na VPS antes de qualquer mudança.

## Diretórios que precisam de escrita

Levantado a partir do código-fonte (`git grep` por `mkdir`/`writeFile` em `apps/finan/backend`):

- `/opt/retiradas/backups/finan` (`FINAN_BACKUP_DIR`, usado por `scripts/database-backup.js` e pelas rotas de restore em `src/compat/routes.js`) — precisa de escrita.
- Diretório temporário do OS (`os.tmpdir()`, via `withTempDir` em `src/documentos/ocrExtraction.js`, usado para extração de OCR de documentos) — já coberto por `PrivateTmp=true` quando presente; hoje o `.service` do Finan **não tem `PrivateTmp=true`** (diferente de ADM/Operação/Retiradas).
- **Diferente do ADM e da Operação, o Finan não tem uma pasta `uploads/` própria fora do `/tmp`** — não há avatar ou anexo persistido em disco fora do backup. Isso simplifica o hardening: não precisa de `ReadWritePaths` para uma pasta de uploads.

## Permissões que um usuário dedicado (`svc-finan`) precisaria

Mínimo necessário, por analogia com `adm-api.service.example`:

```ini
User=svc-finan
Group=svc-finan
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictSUIDSGID=true
PrivateDevices=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=
ReadWritePaths=/opt/retiradas/backups/finan /tmp
```

`EnvironmentFile=/opt/retiradas/apps/finan/.env` continua funcionando sem alterar seu modo/dono (600, root) — o systemd (PID 1, sempre root) lê o `EnvironmentFile` antes de trocar para `User=svc-finan`, mesmo padrão já documentado em `apps/adm/ops/README.md` e nos comentários do `rot-api.service.example`.

`finan-db-backup.service.example` também roda hoje como `User=root` — se `svc-finan` for adotado para a API, o job de backup deveria migrar junto (mesmo usuário, para poder escrever em `/opt/retiradas/backups/finan` sem depender de root).

## Dependências que poderiam quebrar

- **Tesseract OCR** (`runTesseract` em `ocrExtraction.js`) — chama o binário `tesseract` via `child_process`. Precisa confirmar que o binário é executável pelo novo usuário (`svc-finan`) e que não depende de nenhuma permissão exclusiva de root (normalmente não depende, mas não foi testado nesta auditoria).
- **`npm run api:start`** — se algum script de start fizer alguma operação que hoje só funciona por acidente com root (ex.: bind em porta <1024 — não é o caso, a porta sugerida é 3101; ou escrita em algum caminho fora dos mapeados acima), precisa ser identificado durante o teste em homologação.
- Qualquer webhook ou integração que grave log fora de `/opt/retiradas/backups/finan` ou do tmpdir precisa ser mapeado antes da migração — esta auditoria só encontrou os dois caminhos acima nos arquivos versionados; não é uma garantia de que não existam outros (script de terceiros, dependência transitiva) não descobertos por `git grep`.

## Proposta de migração

1. Criar o usuário de sistema na VPS: `useradd --system --no-create-home --shell /usr/sbin/nologin svc-finan`.
2. `chown -R svc-finan:svc-finan /opt/retiradas/backups/finan`.
3. Atualizar `apps/finan/ops/finan-api.service.example` e `finan-db-backup.service.example` com o bloco de hardening acima (`User=svc-finan`, `ProtectSystem=strict`, etc.) — feito primeiro nos arquivos versionados, nunca direto no serviço ativo.
4. Copiar os `.service` atualizados para `/etc/systemd/system/` **em homologação primeiro** (não existe ambiente de homologação dedicado ao Finan hoje — ver `apps/finan/ops/README.md`, "Nada aqui é aplicado automaticamente"; validar num ambiente de teste manual antes de produção).
5. `systemctl daemon-reload && systemctl restart finan-api.service finan-db-backup.service`.
6. Validar: `GET /api/finan/health` responde 200; rotina de OCR processa um documento de teste; `npm run backup:database -- --scheduled` roda manualmente e grava em `/opt/retiradas/backups/finan` com o novo dono.

## Procedimento de teste

- Rodar os passos 1-3 num servidor de teste (ou, na ausência de um, em uma janela de manutenção documentada, com o rollback do passo abaixo pronto).
- Validar o health check, uma rota autenticada simples, o fluxo de OCR de documentos (upload real de um documento de teste) e o backup manual antes de considerar a migração concluída.
- Monitorar logs (`journalctl -u finan-api -f`) por avisos de permissão negada (`EACCES`, `EPERM`) nas primeiras 24h.

## Rollback

Reverter `User=svc-finan` para `User=root` nos dois `.service` e `systemctl daemon-reload && systemctl restart finan-api.service finan-db-backup.service`. Não requer mudança de dono de arquivo para reverter (root sempre tem acesso).

## Status

Backlog documentado. Nenhuma mudança aplicada ao serviço real. Não deve ser executado sem teste manual prévio em ambiente não produtivo, conforme restrição desta etapa.
