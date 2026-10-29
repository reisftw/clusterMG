#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_ROOT="${ADM_SOURCE_ROOT:-/opt/retiradas/apps/adm}"
OUTPUT_DIR="${ADM_PACKAGE_OUTPUT_DIR:-/tmp}"
TARGET_ORIGIN="${ADM_PUBLIC_ORIGIN:-https://retiradas.sempre.net.br}"
PACKAGE_KEY="${ADM_PACKAGE_KEY:-}"
VERSION="${ADM_PACKAGE_VERSION:-$(date +%Y.%m.%d-%H%M%S)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAFE_VERSION="$(printf '%s' "$VERSION" | tr -cs 'A-Za-z0-9._-' '-')"
PACKAGE_NAME="adm-company-vm-${SAFE_VERSION}"
WORK_DIR="$(mktemp -d /tmp/adm-company-package.XXXXXX)"
SOURCE_COPY="$WORK_DIR/source"
PAYLOAD="$WORK_DIR/payload"
OUTER="$WORK_DIR/$PACKAGE_NAME"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Execute como root na VPS de origem."
[[ -n "$PACKAGE_KEY" ]] || fail "Defina ADM_PACKAGE_KEY."
[[ -d "$SOURCE_ROOT/backend/src" ]] || fail "Backend ADM nao encontrado em $SOURCE_ROOT."
[[ -d "$SOURCE_ROOT/frontend/src" ]] || fail "Frontend ADM nao encontrado em $SOURCE_ROOT."
for command in python3 tar pg_dump openssl sha256sum npm; do
  command -v "$command" >/dev/null 2>&1 || fail "Comando ausente: $command"
done

mkdir -p "$SOURCE_COPY/backend" "$SOURCE_COPY/frontend" "$PAYLOAD/app" "$OUTER" "$OUTPUT_DIR"

tar -C "$SOURCE_ROOT/backend" \
  --exclude='./node_modules' --exclude='./uploads' --exclude='./logs' \
  -cf - . | tar -C "$SOURCE_COPY/backend" -xf -
tar -C "$SOURCE_ROOT/frontend" \
  --exclude='./node_modules' --exclude='./dist' --exclude='./dist.*' --exclude='./dist-*' \
  -cf - . | tar -C "$SOURCE_COPY/frontend" -xf -

python3 "$SCRIPT_DIR/patch-adm-subpath.py" "$SOURCE_COPY"
ln -s "$SOURCE_ROOT/frontend/node_modules" "$SOURCE_COPY/frontend/node_modules"
(
  cd "$SOURCE_COPY/frontend"
  VITE_DATA_BACKEND=vps \
  VITE_API_BASE_URL="$TARGET_ORIGIN/adm/api" \
  npx vite build --base=/adm/
)
rm "$SOURCE_COPY/frontend/node_modules"

mkdir -p "$PAYLOAD/app/backend" "$PAYLOAD/app/frontend" "$PAYLOAD/credentials"
tar -C "$SOURCE_COPY/backend" -cf - . | tar -C "$PAYLOAD/app/backend" -xf -
cp -a "$SOURCE_COPY/frontend/dist" "$PAYLOAD/app/frontend/dist"
tar -C "$SOURCE_ROOT/backend" -czf "$PAYLOAD/backend-node-modules.tar.gz" node_modules
cp "$SOURCE_ROOT/.env" "$PAYLOAD/env.source"

set -a
. "$SOURCE_ROOT/.env"
set +a
if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" && -f "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
  cp "$GOOGLE_APPLICATION_CREDENTIALS" "$PAYLOAD/credentials/google-drive-service-account.json"
fi
if [[ -n "${DB_BACKUP_AGE_IDENTITY_FILE:-}" && -f "$DB_BACKUP_AGE_IDENTITY_FILE" ]]; then
  cp "$DB_BACKUP_AGE_IDENTITY_FILE" "$PAYLOAD/credentials/backup-age-key.txt"
fi

DB_NAME="${PGDATABASE:-adm}"
sudo -u postgres pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  "$DB_NAME" > "$PAYLOAD/adm-data.dump"

cat > "$PAYLOAD/adm-api.service" <<'UNIT'
[Unit]
Description=Administrativo API (/adm)
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/adm/backend
EnvironmentFile=/etc/adm/api.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
User=svc-adm
Group=svc-adm
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictSUIDSGID=true
PrivateDevices=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=
ReadWritePaths=/opt/adm/backend/uploads /opt/adm/backups /tmp

[Install]
WantedBy=multi-user.target
UNIT

cat > "$PAYLOAD/nginx-adm-location.conf" <<'NGINX'
location = /adm {
	return 308 /adm/;
}

location ^~ /adm/api/ {
	proxy_pass http://127.0.0.1:3301/api/;
	proxy_http_version 1.1;
	proxy_set_header Host $host;
	proxy_set_header X-Real-IP $remote_addr;
	proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header X-Forwarded-Proto $scheme;
	proxy_set_header X-Forwarded-Prefix /adm;
	proxy_connect_timeout 10s;
	proxy_send_timeout 600s;
	proxy_read_timeout 600s;
	client_max_body_size 200M;
}

location ^~ /adm/assets/ {
	alias /opt/adm/frontend/dist/assets/;
	access_log off;
	expires 1y;
	add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location ^~ /adm/ {
	alias /opt/adm/frontend/dist/;
	index index.html;
	try_files $uri $uri/ /adm/index.html;
	add_header Cache-Control "no-cache, no-store, must-revalidate" always;
}
NGINX

cp "$SCRIPT_DIR/apply-adm-company-package.sh" "$OUTER/apply-update.sh"
chmod 700 "$OUTER/apply-update.sh"
printf '%s\n' "$VERSION" > "$OUTER/VERSION.txt"
tar -C "$WORK_DIR" -czf "$WORK_DIR/payload.tar.gz" payload
ADM_PACKAGE_KEY="$PACKAGE_KEY" openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "$WORK_DIR/payload.tar.gz" \
  -out "$OUTER/payload.tar.gz.enc" \
  -pass env:ADM_PACKAGE_KEY
(
  cd "$OUTER"
  sha256sum payload.tar.gz.enc > payload.tar.gz.enc.sha256
)
tar -C "$WORK_DIR" -cf "$OUTPUT_DIR/$PACKAGE_NAME.tar" "$PACKAGE_NAME"
(
  cd "$OUTPUT_DIR"
  sha256sum "$PACKAGE_NAME.tar" > "$PACKAGE_NAME.tar.sha256"
)

echo "PACKAGE=$OUTPUT_DIR/$PACKAGE_NAME.tar"
echo "CHECKSUM=$OUTPUT_DIR/$PACKAGE_NAME.tar.sha256"
echo "VERSION=$VERSION"
