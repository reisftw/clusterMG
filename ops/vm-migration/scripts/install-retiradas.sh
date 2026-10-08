#!/usr/bin/env bash
set -euo pipefail

FRONTEND_PACKAGE="${1:-/tmp/retiradas-dist.tar.gz}"
BACKEND_PACKAGE="${2:-/tmp/retiradas-backend.tar.gz}"
DEPLOY_PATH="${RETIRADAS_DEPLOY_PATH:-/var/www/retiradas/dist}"
API_PATH="${RETIRADAS_API_PATH:-/opt/retiradas/vps}"
ENV_FILE="${RETIRADAS_ENV_FILE:-/etc/retiradas/api.env}"
SERVICE="${RETIRADAS_SERVICE:-retiradas-api.service}"

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo -n"; fi

test -f "$FRONTEND_PACKAGE" || { echo "Frontend package nao encontrado: $FRONTEND_PACKAGE" >&2; exit 1; }
test -f "$BACKEND_PACKAGE" || { echo "Backend package nao encontrado: $BACKEND_PACKAGE" >&2; exit 1; }
test -f "$ENV_FILE" || { echo "Env nao encontrado: $ENV_FILE" >&2; exit 1; }

$SUDO mkdir -p "$DEPLOY_PATH" "$API_PATH"
$SUDO tar -xzf "$FRONTEND_PACKAGE" -C "$DEPLOY_PATH"
$SUDO tar -xzf "$BACKEND_PACKAGE" -C "$API_PATH"

cd "$API_PATH"
if [ -d node_modules ] && [ -f package-lock.json ] && [ -f .package-lock.sha256 ] && [ "$(sha256sum package-lock.json | awk '{print $1}')" = "$(cat .package-lock.sha256)" ]; then
	echo "Retiradas backend dependencies unchanged; skipping npm install"
else
	echo "Installing Retiradas backend dependencies"
	$SUDO npm install --omit=dev --no-audit --no-fund
	if [ -f package-lock.json ]; then
		sha256sum package-lock.json | awk '{print $1}' > /tmp/retiradas-package-lock.sha256
		$SUDO mv /tmp/retiradas-package-lock.sha256 .package-lock.sha256
	fi
fi

$SUDO mkdir -p "$API_PATH/uploads/avatars" /var/www/.cache /var/www/.npm
$SUDO chown -R www-data:www-data "$API_PATH/uploads" /var/www/.cache /var/www/.npm
$SUDO chmod -R u+rwX,g+rwX "$API_PATH/uploads"

set -a
. "$ENV_FILE"
set +a

npm run migrate:preflight
npm run migrate:sql
npm run migrate:normalized:apply

$SUDO systemctl restart "$SERVICE"
$SUDO nginx -t
$SUDO systemctl reload nginx

health_url="http://127.0.0.1:${PORT:-3001}/api/health"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
	if curl -fsS "$health_url" >/dev/null 2>&1; then
		echo "Retiradas OK: $health_url"
		exit 0
	fi
	sleep 3
done

echo "Health check falhou: $health_url" >&2
exit 1

