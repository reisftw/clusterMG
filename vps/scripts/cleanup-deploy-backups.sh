#!/usr/bin/env bash
# Limpa snapshots/backups de deploy manual esquecidos na VPS, nos 4 apps
# (Retiradas, ADM, Operacao, Finan). Motivo: sessoes de deploy manual
# criam copias "antes da mudanca" (tar/zip do diretorio inteiro, ou
# renomear a pasta atual pra *.previous.<timestamp>/*.bak.<timestamp>)
# como rede de seguranca pra rollback rapido, mas nada limpava isso
# depois — em 2026-09-16 isso somava 36GB so em apps/adm/backups/
# adm-before-*.tgz, alem de dezenas de deploy-*/dist-* de Ago/2026 na
# raiz do /opt/retiradas do app principal.
#
# So apaga o que bate com os padroes de nome abaixo (nunca um glob
# generico tipo *), e so o que for mais velho que RETENTION_DAYS. Nunca
# toca em /opt/retiradas/backups/postgres (dump diario do banco, tem
# retencao propria) nem em apps/*/backend/uploads ou qualquer diretorio
# em uso pelas aplicacoes.
#
# Uso:
#   ./cleanup-deploy-backups.sh            # dry-run, so lista o que apagaria
#   ./cleanup-deploy-backups.sh --apply    # apaga de verdade
#
# Variaveis de ambiente (opcionais):
#   RETENTION_DAYS       dias de retencao pros snapshots de "antes da mudanca" (default: 3)
#   ROOT_BACKUP_DAYS      dias de retencao pros backups de sessao em /root/*-backup-* (default: 14)

set -euo pipefail

RETENTION_DAYS="${RETENTION_DAYS:-3}"
ROOT_BACKUP_DAYS="${ROOT_BACKUP_DAYS:-14}"
APPLY=false
if [[ "${1:-}" == "--apply" ]]; then
	APPLY=true
fi

TOTAL_BYTES=0
COUNT=0

log() {
	echo "[cleanup-deploy-backups] $*"
}

# Recebe uma lista de caminhos (um por linha, via stdin) mais velhos que
# N dias e remove (ou so lista, em dry-run).
purge_matches() {
	local label="$1"
	local pattern_desc="$2"
	local found=0
	while IFS= read -r -d '' path; do
		found=1
		local size
		size=$(du -sb "$path" 2>/dev/null | cut -f1)
		size=${size:-0}
		TOTAL_BYTES=$((TOTAL_BYTES + size))
		COUNT=$((COUNT + 1))
		if [[ "$APPLY" == true ]]; then
			rm -rf -- "$path"
			log "removido  [$label] $path ($(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B"))"
		else
			log "encontrado [$label] $path ($(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B")) — $pattern_desc"
		fi
	done < <(eval "$3")
	if [[ "$found" -eq 0 ]]; then
		log "nada a limpar em [$label]"
	fi
}

if [[ "$APPLY" == true ]]; then
	log "modo: APLICANDO (remove de verdade)"
else
	log "modo: dry-run (use --apply para remover de verdade)"
fi
log "retencao: snapshots de deploy > ${RETENTION_DAYS}d, backups de sessao em /root > ${ROOT_BACKUP_DAYS}d"
echo

# 1) App principal (Retiradas) — pastas/zips de deploy manual antigo na
#    raiz do /opt/retiradas (ex.: deploy-serasa-fix, deploy-tarifas-*.zip,
#    dist-backup-finan-redirect-*).
purge_matches "retiradas:deploy-*" "diretorio/zip de deploy manual antigo" \
	"find /opt/retiradas -maxdepth 1 \\( -iname 'deploy-*' -o -iname 'dist-*' \\) -mtime +${RETENTION_DAYS} -print0"

# 2) Backups "antes da mudanca" em tgz por app, em /opt/retiradas/backups
#    (ex.: adm-before-*.tgz — o padrao pode se repetir pra outros apps
#    no futuro, ex. rot-before-*.tgz, finan-before-*.tgz).
purge_matches "backups:*-before-*.tgz" "snapshot tgz 'antes da mudanca'" \
	"find /opt/retiradas/backups -maxdepth 1 -iname '*-before-*.tgz' -mtime +${RETENTION_DAYS} -print0"

# 3) ADM backend — pastas src.previous.<timestamp> / scripts.previous.<timestamp>
#    deixadas por deploys manuais que renomeiam a pasta atual antes de
#    substituir em vez de apagar.
purge_matches "adm:backend/*.previous.*" "pasta renomeada antes de deploy manual" \
	"find /opt/retiradas/apps/adm/backend -maxdepth 1 -iname '*.previous.*' -mtime +${RETENTION_DAYS} -print0"

# 4) ADM frontend — dist.previous.<timestamp>
purge_matches "adm:frontend/dist.previous.*" "build anterior do frontend" \
	"find /opt/retiradas/apps/adm/frontend -maxdepth 1 -iname 'dist.previous.*' -mtime +${RETENTION_DAYS} -print0"

# 5) Finan frontend — dist.bak.<timestamp> (mesmo padrao, nome diferente)
purge_matches "finan:frontend/dist.bak.*" "build anterior do frontend" \
	"find /opt/retiradas/apps/finan/frontend -maxdepth 1 -iname 'dist.bak.*' -mtime +${RETENTION_DAYS} -print0"

# 6) Operacao (rot) frontend/backend — ainda nao acumulou esse padrao,
#    mas cobre caso passe a usar o mesmo estilo de deploy manual.
purge_matches "rot:backend/*.previous.*" "pasta renomeada antes de deploy manual" \
	"find /opt/retiradas/apps/rot/backend -maxdepth 1 \\( -iname '*.previous.*' -o -iname '*.bak.*' \\) -mtime +${RETENTION_DAYS} -print0"
purge_matches "rot:frontend/dist.previous.*" "build anterior do frontend" \
	"find /opt/retiradas/apps/rot/frontend -maxdepth 1 \\( -iname 'dist.previous.*' -o -iname 'dist.bak.*' \\) -mtime +${RETENTION_DAYS} -print0"

# 7) ADM/Finan/Rot — backups genericos de sessao criados por deploy
#    manual assistido (ex.: /root/sec-002-backup-20260916,
#    /root/adm-deploy-backup-20260915). Retencao maior (default 14d)
#    porque servem de rede de seguranca pra investigar regressao
#    encontrada alguns dias depois, nao so no dia do deploy.
purge_matches "root:*-backup-*" "backup de sessao de deploy manual" \
	"find /root -maxdepth 1 -iname '*-backup-*' -mtime +${ROOT_BACKUP_DAYS} -print0"

echo
if [[ "$COUNT" -eq 0 ]]; then
	log "nada encontrado para limpar."
else
	log "total: $COUNT item(ns), $(numfmt --to=iec "$TOTAL_BYTES" 2>/dev/null || echo "${TOTAL_BYTES}B") $([[ "$APPLY" == true ]] && echo "liberados" || echo "seriam liberados")."
fi

df -h / | tail -1 | awk '{print "[cleanup-deploy-backups] disco / agora: " $3 " usados de " $2 " (" $5 ")"}'
