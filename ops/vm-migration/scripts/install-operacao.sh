#!/usr/bin/env bash
set -euo pipefail

OPERACAO_PACKAGE="${1:-/tmp/operacao-app.tar.gz}"
APP_PATH="${OPERACAO_APP_PATH:-/opt/retiradas/apps/rot}"
ENV_FILE="${OPERACAO_ENV_FILE:-/opt/retiradas/apps/rot/.env}"
SERVICE="${OPERACAO_SERVICE:-rot-api.service}"

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo -n"; fi

test -f "$OPERACAO_PACKAGE" || { echo "Pacote Operacao nao encontrado: $OPERACAO_PACKAGE" >&2; exit 1; }
test -f "$ENV_FILE" || { echo "Env nao encontrado: $ENV_FILE" >&2; exit 1; }

$SUDO mkdir -p "$(dirname "$APP_PATH")"
tmp_extract="/tmp/operacao-extract-$$"
rm -rf "$tmp_extract"
mkdir -p "$tmp_extract"
tar -xzf "$OPERACAO_PACKAGE" -C "$tmp_extract"

if [ ! -d "$tmp_extract/operacao" ]; then
	echo "Pacote da Operacao nao contem diretorio operacao." >&2
	exit 1
fi

$SUDO rm -rf "$APP_PATH.tmp"
$SUDO mv "$tmp_extract/operacao" "$APP_PATH.tmp"
$SUDO mkdir -p "$APP_PATH"
$SUDO cp -a "$APP_PATH.tmp/." "$APP_PATH/"
$SUDO rm -rf "$APP_PATH.tmp" "$tmp_extract"

cd "$APP_PATH/backend"
package_hash="$(sha256sum package.json | awk '{print $1}')"
if [ -d node_modules ] && [ -f .package-json.sha256 ] && [ "$package_hash" = "$(cat .package-json.sha256)" ]; then
	echo "Operacao backend dependencies unchanged; skipping npm install"
else
	echo "Installing Operacao backend dependencies"
	$SUDO npm install --omit=dev --no-audit --no-fund
	echo "$package_hash" > /tmp/operacao-package-json.sha256
	$SUDO mv /tmp/operacao-package-json.sha256 .package-json.sha256
fi

$SUDO mkdir -p "$APP_PATH/backend/uploads" "$APP_PATH/backend/logs"
$SUDO chown -R operacao:operacao "$APP_PATH/backend/uploads" "$APP_PATH/backend/logs" || true

set -a
. "$ENV_FILE"
set +a

npm run migrate

$SUDO systemctl restart "$SERVICE"
$SUDO nginx -t
$SUDO systemctl reload nginx

health_url="http://127.0.0.1:${ROT_API_PORT:-3201}/api/health"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
	if curl -fsS "$health_url" >/dev/null 2>&1; then
		echo "Operacao OK: $health_url"
		exit 0
	fi
	sleep 3
done

echo "Health check falhou: $health_url" >&2
exit 1

