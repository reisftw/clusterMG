#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_ID="__RELEASE_ID__"
PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_PACKAGE="$PACKAGE_DIR/retiradas-dist.tar.gz"
BACKEND_PACKAGE="$PACKAGE_DIR/retiradas-backend.tar.gz"
NODE_MODULES_PACKAGE="$PACKAGE_DIR/retiradas-node-modules.tar.gz"
CHECKSUM_FILE="$PACKAGE_DIR/SHA256SUMS.txt"

FRONTEND_PATH="${RETIRADAS_FRONTEND_PATH:-/var/www/retiradas/dist}"
API_PATH="${RETIRADAS_API_PATH:-/opt/retiradas/vps}"
ENV_FILE="${RETIRADAS_ENV_FILE:-/etc/retiradas/api.env}"
SERVICE="${RETIRADAS_SERVICE:-retiradas-api.service}"
BACKUP_ROOT="${RETIRADAS_BACKUP_ROOT:-/opt/retiradas/update-backups}"
BACKUP_DIR="$BACKUP_ROOT/$RELEASE_ID"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute como root." >&2
  exit 1
fi

case "$FRONTEND_PATH" in
  /var/www/retiradas/dist) ;;
  *) echo "Caminho frontend inesperado: $FRONTEND_PATH" >&2; exit 1 ;;
esac
case "$API_PATH" in
  /opt/retiradas/vps) ;;
  *) echo "Caminho backend inesperado: $API_PATH" >&2; exit 1 ;;
esac

test -s "$FRONTEND_PACKAGE"
test -s "$BACKEND_PACKAGE"
test -s "$CHECKSUM_FILE"
test -s "$ENV_FILE"

cd "$PACKAGE_DIR"
sha256sum -c "$CHECKSUM_FILE"

STAGING="$(mktemp -d /tmp/retiradas-update.XXXXXX)"
mkdir -p "$STAGING/frontend" "$STAGING/backend"
tar -xzf "$FRONTEND_PACKAGE" -C "$STAGING/frontend"
tar -xzf "$BACKEND_PACKAGE" -C "$STAGING/backend"

test -s "$STAGING/frontend/index.html"
test -s "$STAGING/backend/api/src/index.js"
test -s "$STAGING/backend/scripts/run-sql-migrations.js"

mkdir -p "$BACKUP_DIR"
chown root:root "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

FRONTEND_REAL="$(readlink -f "$FRONTEND_PATH" 2>/dev/null || true)"
if [ -z "$FRONTEND_REAL" ]; then
  mkdir -p "$FRONTEND_PATH"
  FRONTEND_REAL="$(readlink -f "$FRONTEND_PATH")"
fi
case "$FRONTEND_REAL" in
  /var/www/retiradas/*) ;;
  *) echo "Destino frontend fora da area permitida: $FRONTEND_REAL" >&2; exit 1 ;;
esac

echo "Criando backup da aplicacao atual..."
tar -czf "$BACKUP_DIR/backend-before.tar.gz" \
  --exclude='./node_modules' \
  --exclude='./uploads' \
  --exclude='./output' \
  --exclude='./private' \
  --exclude='./.env' \
  -C "$API_PATH" .
tar -czf "$BACKUP_DIR/frontend-before.tar.gz" -C "$FRONTEND_REAL" .

CURRENT_LOCK_HASH="$(sha256sum "$API_PATH/package-lock.json" 2>/dev/null | awk '{print $1}')"
NEXT_LOCK_HASH="$(sha256sum "$STAGING/backend/package-lock.json" 2>/dev/null | awk '{print $1}')"
APPLIED=0
DEPENDENCIES_BACKED_UP=0

rollback() {
  local status=$?
  if [ "$APPLIED" -eq 1 ]; then
    echo "Falha detectada. Restaurando versao anterior..." >&2
    find "$FRONTEND_REAL" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    tar -xzf "$BACKUP_DIR/frontend-before.tar.gz" -C "$FRONTEND_REAL"
    tar -xzf "$BACKUP_DIR/backend-before.tar.gz" -C "$API_PATH"
    if [ "$DEPENDENCIES_BACKED_UP" -eq 1 ]; then
      rm -rf "$API_PATH/node_modules"
      mv "$BACKUP_DIR/node_modules-before" "$API_PATH/node_modules"
    fi
    systemctl restart "$SERVICE" || true
  fi
  rm -rf "$STAGING"
  exit "$status"
}
trap rollback ERR

systemctl stop "$SERVICE"
APPLIED=1

find "$FRONTEND_REAL" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar -cf - -C "$STAGING/frontend" . | tar -xf - -C "$FRONTEND_REAL"
tar -cf - -C "$STAGING/backend" . | tar -xf - -C "$API_PATH"

chown -R www-data:www-data "$FRONTEND_REAL"
mkdir -p "$API_PATH/uploads/avatars" /var/www/.cache /var/www/.npm
chown -R www-data:www-data "$API_PATH/uploads" /var/www/.cache /var/www/.npm
chmod -R u+rwX,g+rwX "$API_PATH/uploads"

if [ -z "$CURRENT_LOCK_HASH" ] || [ "$CURRENT_LOCK_HASH" != "$NEXT_LOCK_HASH" ]; then
  if [ -s "$NODE_MODULES_PACKAGE" ]; then
    echo "Dependencias alteradas; aplicando pacote offline..."
    if [ -d "$API_PATH/node_modules" ]; then
      mv "$API_PATH/node_modules" "$BACKUP_DIR/node_modules-before"
      DEPENDENCIES_BACKED_UP=1
    fi
    mkdir -p "$API_PATH/node_modules"
    tar -xzf "$NODE_MODULES_PACKAGE" -C "$API_PATH/node_modules"
  else
    echo "Dependencias alteradas; instalando backend..."
    npm install --prefix "$API_PATH" --omit=dev --no-audit --no-fund
  fi
else
  echo "Dependencias inalteradas; mantendo node_modules existente."
fi

set -a
. "$ENV_FILE"
set +a

cd "$API_PATH"
npm run migrate:preflight
npm run migrate:sql
npm run migrate:normalized:apply

systemctl restart "$SERVICE"
nginx -t
systemctl reload nginx

HEALTH_URL="http://127.0.0.1:${PORT:-3001}/api/health"
for attempt in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    APPLIED=0
    trap - ERR
    rm -rf "$STAGING"
    printf '%s\n' "$RELEASE_ID" > "$API_PATH/.release-version"
    echo "Atualizacao concluida: $RELEASE_ID"
    echo "Health OK: $HEALTH_URL"
    echo "Backup: $BACKUP_DIR"
    exit 0
  fi
  sleep 3
done

echo "Health check falhou: $HEALTH_URL" >&2
false
