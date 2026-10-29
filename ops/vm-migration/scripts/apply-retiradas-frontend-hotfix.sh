#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${RETIRADAS_FRONTEND_PATH:-/var/www/retiradas/dist}"
BACKUP_ROOT="${RETIRADAS_UPDATE_BACKUP_PATH:-/opt/retiradas/update-backups}"
ARCHIVE="$PACKAGE_DIR/frontend-dist.tar.gz"
CHECKSUM="$PACKAGE_DIR/frontend-dist.tar.gz.sha256"
RELEASE_ID="${RETIRADAS_HOTFIX_RELEASE:-frontend-hotfix}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$BACKUP_ROOT/$RELEASE_ID-$STAMP.tar.gz"
STAGING=""
SWAPPED="false"

cleanup() {
	[[ -z "$STAGING" || ! -d "$STAGING" ]] || rm -rf "$STAGING"
}

rollback() {
	local exit_code="${1:-1}"
	trap - ERR
	set +e
	if [[ "$SWAPPED" == "true" && -s "$BACKUP" ]]; then
		echo "Falha detectada. Restaurando frontend anterior..." >&2
		rm -rf "$TARGET"
		mkdir -p "$TARGET"
		tar -xzf "$BACKUP" -C "$TARGET"
	fi
	cleanup
	exit "$exit_code"
}

trap 'rollback $?' ERR
trap cleanup EXIT

[[ "${EUID:-$(id -u)}" -eq 0 ]] || {
	echo "Execute como root." >&2
	exit 1
}
for command in sha256sum tar curl nginx; do
	command -v "$command" >/dev/null 2>&1 || {
		echo "Comando obrigatorio ausente: $command" >&2
		exit 1
	}
done
[[ -s "$ARCHIVE" && -s "$CHECKSUM" ]] || {
	echo "Payload do frontend ausente." >&2
	exit 1
}

cd "$PACKAGE_DIR"
sha256sum -c "$(basename "$CHECKSUM")"

# Nao troca arquivos enquanto a API principal estiver indisponivel.
curl -fsS --max-time 10 http://127.0.0.1:3001/api/health >/dev/null

mkdir -p "$(dirname "$TARGET")" "$BACKUP_ROOT"
STAGING="$(mktemp -d "$(dirname "$TARGET")/.dist.new.XXXXXX")"
tar -xzf "$ARCHIVE" -C "$STAGING"
[[ -s "$STAGING/index.html" && -s "$STAGING/sw.js" ]] || {
	echo "Frontend extraido e invalido." >&2
	exit 1
}
find "$STAGING/assets" -maxdepth 1 -type f -name 'index-*.js' -print -quit | grep -q . || {
	echo "Bundle principal nao encontrado." >&2
	exit 1
}

if [[ -d "$TARGET" ]]; then
	tar -czf "$BACKUP" -C "$TARGET" .
fi
rm -rf "$TARGET"
mv "$STAGING" "$TARGET"
STAGING=""
SWAPPED="true"
chown -R root:root "$TARGET"
find "$TARGET" -type d -exec chmod 755 {} +
find "$TARGET" -type f -exec chmod 644 {} +

nginx -t
nginx -s reload
curl -fsS --max-time 10 http://127.0.0.1:3001/api/health >/dev/null

SWAPPED="false"
echo "Hotfix do frontend corporativo aplicado com sucesso."
echo "Versao: $RELEASE_ID"
echo "Backup: ${BACKUP:-nao havia frontend anterior}"
