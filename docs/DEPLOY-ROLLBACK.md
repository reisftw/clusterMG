# Deploy e rollback — Sistema de Retiradas

Fase B da otimização técnica (`docs/TECHNICAL-AUDIT.md`, achado #4).
Documenta o que foi adicionado ao pipeline de deploy e o procedimento de
rollback — a estratégia atual de deploy (extração de pacote por cima do
diretório existente) não muda nesta fase; o que muda é a **rede de
segurança em volta dela**.

## O que o pipeline agora faz antes de aplicar migrations

Para `deploy-vps` (produção, branch `master`/`main`) e `deploy-homolog-vps`
(homologação, branch `homolog-dev`), depois de extrair o pacote e instalar
dependências, e **antes** de `migrate:sql`/`migrate:normalized:apply`:

1. **Preflight** (`npm run migrate:preflight`, script
   `vps/scripts/migration-preflight.js`) — verifica se alguma migration
   pendente tem um arquivo `vps/sql-tools/preflight_<versão>_*.sql`
   correspondente e, se tiver, roda essa query contra o banco. Qualquer
   violação encontrada **aborta o deploy inteiro** antes de qualquer
   escrita (nem o backup roda). Ver `vps/sql-tools/README.md` para a
   convenção completa.
2. **Backup** (`npm run backup:database -- --scheduled`) — só roda se o
   preflight passou. Usa o mesmo mecanismo de backup já existente
   (`vps/api/src/databaseBackups.js#createBackup`, `pg_dump --format=custom`,
   dump validado, com retenção). Este é **adicional** ao backup diário
   automatizado (`retiradas-db-backup.timer`, já existente) — roda
   especificamente pré-migration, a cada deploy.
3. Migrations aplicadas normalmente (`migrate:sql`, `migrate:normalized:apply`).
4. Restart do serviço + reload do nginx (como já era).
5. **Health check pós-deploy**: até 10 tentativas (3s de intervalo) de
   `GET /api/health` local (`http://127.0.0.1:$PORT/api/health`). Se todas
   falharem, o step (e o deploy) falha explicitamente — sem isso, um
   serviço que não voltou a subir depois do restart passaria despercebido
   até alguém notar manualmente.

Se qualquer uma dessas etapas falhar, o job do GitHub Actions falha e o
deploy é considerado **não concluído** — o pacote antigo pode já ter sido
sobrescrito pelo novo nos arquivos estáticos/código (isso não mudou nesta
fase, ver limitação abaixo), mas a falha fica visível imediatamente em vez
de silenciosa.

## Limitação conhecida (não resolvida nesta fase)

O deploy ainda extrai o novo pacote **por cima** do diretório existente
(sem `releases/<sha>` + symlink `current`, sem cópia do estado anterior
do código). Ou seja, se o health check falhar, o **código já foi
trocado** — não há como só "voltar" automaticamente pro código anterior
sem reimplantar. Isso é uma melhoria de infraestrutura maior (introduzir
um esquema de releases versionadas), fora do escopo desta fase — registrada
como recomendação futura (ver `docs/TECHNICAL-AUDIT.md`).

## Procedimento de rollback

### Rollback da aplicação (código)

Não há rollback automático — o procedimento é **reimplantar um commit
anterior conhecido-bom**:

```bash
# 1. Identifique o commit anterior estável (o SHA do deploy anterior bem-sucedido)
git log --oneline origin/master   # ou origin/homolog-dev

# 2. Crie um branch/commit de rollback (nunca force-push em master/homolog-dev)
git checkout master
git revert <commit-problemático>   # ou: git checkout -B rollback-temp <sha-bom> && ...
git push origin master
```

Isso dispara o pipeline normal (`security` + `build-and-test` + deploy),
reimplantando o código do commit revertido — mesmo fluxo de sempre, sem
atalho manual na VPS.

### Restauração de banco (quando necessária)

Só é necessária se uma migration corrompeu dados ou uma constraint nova
quebrou algo depois de aplicada (o preflight da Fase B existe justamente
para reduzir a chance disso, mas não elimina 100%).

1. **Via admin UI** (recomendado, já audita e mostra o dump correto): tela
   de administração → Backups de banco → escolher o backup feito
   **imediatamente antes do deploy problemático** (rotulado pelo motivo
   `scheduled` e timestamp) → Restaurar. Usa
   `databaseBackupsAdmin/routes/databaseBackupsAdminRoutes.js` →
   `databaseBackups.js#restoreBackup`.
2. **Via linha de comando na VPS** (se a API estiver fora do ar e a UI não
   for acessível):
   ```bash
   cd /opt/retiradas/vps   # ou /opt/retiradas/vps-homolog
   node -e "require('./api/src/databaseBackups').restoreBackup('<nome-do-arquivo>.dump').then(console.log).catch(e=>{console.error(e);process.exit(1)})"
   ```
   Confirme o nome exato do arquivo com `ls /opt/retiradas/backups/postgres/`
   (ou `$DB_BACKUP_DIR`, se configurado diferente).
3. Depois de restaurar, reinicie o serviço (`systemctl restart
   retiradas-api` / `retiradas-api-homolog`) para garantir que o pool de
   conexões não está com estado stale.

### Registro de cada deploy (para saber qual backup usar)

O nome do arquivo de backup criado no passo "Backup" do pipeline inclui
timestamp — cruze com o horário do deploy (visível no log do GitHub
Actions) para achar o backup certo. Não há hoje um registro automático
"backup X corresponde ao commit Y" — **recomendação futura**: gravar o
SHA do commit como metadado do backup quando criado pelo pipeline (fica no
backlog do `docs/TECHNICAL-AUDIT.md`).

## RPO / RTO (estimados, não medidos em incidente real)

- **RPO (Recovery Point Objective)**: no pior caso, até 24h (intervalo do
  backup diário `retiradas-db-backup.timer`) — mas na prática, para
  qualquer deploy que passe pelo pipeline, o RPO efetivo é "o instante
  imediatamente antes daquele deploy", graças ao backup pré-migration
  desta fase.
- **RTO (Recovery Time Objective)**: depende do tamanho do dump
  (`pg_dump --format=custom` + restauração) — não medido formalmente
  nesta fase. Recomenda-se medir o tempo real de restauração num
  ambiente de homologação como próximo passo (registrado no backlog).
