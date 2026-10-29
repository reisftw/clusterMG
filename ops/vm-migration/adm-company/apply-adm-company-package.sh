#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="${ADM_INSTALL_ROOT:-/opt/adm}"
ENV_DIR="${ADM_ENV_DIR:-/etc/adm}"
ENV_FILE="$ENV_DIR/api.env"
BACKUP_ROOT="$INSTALL_ROOT/backups"
DB_NAME="${ADM_DB_NAME:-adm}"
DB_USER="${ADM_DB_USER:-adm_user}"
SERVICE_NAME="adm-api.service"
TARGET_ORIGIN="${ADM_PUBLIC_ORIGIN:-https://retiradas.sempre.net.br}"
TARGET_BASE_PATH="/adm"
PAYLOAD_ENCRYPTED="$PACKAGE_DIR/payload.tar.gz.enc"
EXPECTED_SHA_FILE="$PACKAGE_DIR/payload.tar.gz.enc.sha256"
PACKAGE_KEY="${ADM_PACKAGE_KEY:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/adm-company-install.XXXXXX)"
APP_BACKUP=""
DB_BACKUP=""
NGINX_BACKUP=""
ENV_BACKUP=""
SERVICE_BACKUP=""
SERVICE_WAS_ACTIVE="false"
ROLLBACK_REQUIRED="false"
DB_PASSWORD=""

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

fail() {
  echo "ERRO: $*" >&2
  return 1
}

rollback() {
  local exit_code="${1:-1}"
  trap - ERR
  set +e
  if [[ "$ROLLBACK_REQUIRED" == "true" ]]; then
    echo "Falha detectada. Restaurando o ADM anterior..." >&2
    systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    if [[ -n "$APP_BACKUP" && -s "$APP_BACKUP" ]]; then
      rm -rf "$INSTALL_ROOT/backend" "$INSTALL_ROOT/frontend"
      mkdir -p "$INSTALL_ROOT"
      tar -xzf "$APP_BACKUP" -C "$INSTALL_ROOT"
    else
      rm -rf "$INSTALL_ROOT/backend" "$INSTALL_ROOT/frontend"
    fi
    if [[ -n "$ENV_BACKUP" && -s "$ENV_BACKUP" ]]; then
      cp -a "$ENV_BACKUP" "$ENV_FILE"
    else
      rm -f "$ENV_FILE"
    fi
    if [[ -n "$DB_BACKUP" && -s "$DB_BACKUP" && -n "$DB_PASSWORD" ]]; then
      sudo -u postgres psql -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB_NAME' and pid <> pg_backend_pid()" >/dev/null 2>&1 || true
      sudo -u postgres dropdb --if-exists "$DB_NAME" >/dev/null 2>&1 || true
      sudo -u postgres createdb --owner="$DB_USER" "$DB_NAME" >/dev/null 2>&1 || true
      sudo -u postgres psql -d "$DB_NAME" -c "create extension if not exists pgcrypto" >/dev/null 2>&1 || true
      pg_restore -l "$DB_BACKUP" | grep -v -E ' EXTENSION - pgcrypto | COMMENT - EXTENSION pgcrypto ' > "$WORK_DIR/adm-rollback.list"
      PGPASSWORD="$DB_PASSWORD" pg_restore --host=127.0.0.1 --username="$DB_USER" --dbname="$DB_NAME" --no-owner --no-privileges --use-list="$WORK_DIR/adm-rollback.list" "$DB_BACKUP" >/dev/null 2>&1 || true
    fi
    if [[ -n "$SERVICE_BACKUP" && -s "$SERVICE_BACKUP" ]]; then
      cp -a "$SERVICE_BACKUP" "/etc/systemd/system/$SERVICE_NAME"
    else
      rm -f "/etc/systemd/system/$SERVICE_NAME"
    fi
    if [[ -n "$NGINX_BACKUP" && -s "$NGINX_BACKUP" ]]; then
      cp -a "$NGINX_BACKUP" "${NGINX_BACKUP%.before-adm-*}"
    fi
    systemctl daemon-reload >/dev/null 2>&1 || true
    nginx -t >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1 || true
    if [[ "$SERVICE_WAS_ACTIVE" == "true" ]]; then
      systemctl restart "$SERVICE_NAME" >/dev/null 2>&1 || true
    fi
  fi
  exit "$exit_code"
}

trap 'rollback $?' ERR

[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Execute como root."
[[ -n "$PACKAGE_KEY" ]] || fail "Informe ADM_PACKAGE_KEY no mesmo comando."
for command in openssl sha256sum tar pg_dump pg_restore psql createdb dropdb systemctl nginx python3 curl; do
  command -v "$command" >/dev/null 2>&1 || fail "Comando obrigatorio ausente: $command"
done

cd "$PACKAGE_DIR"
sha256sum -c "$EXPECTED_SHA_FILE"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$PAYLOAD_ENCRYPTED" \
  -out "$WORK_DIR/payload.tar.gz" \
  -pass env:ADM_PACKAGE_KEY
tar -xzf "$WORK_DIR/payload.tar.gz" -C "$WORK_DIR"
PAYLOAD="$WORK_DIR/payload"
[[ -s "$PAYLOAD/adm-data.dump" ]] || fail "Dump do ADM ausente."
[[ -s "$PAYLOAD/env.source" ]] || fail "Configuracao do ADM ausente."
[[ -s "$PAYLOAD/backend-node-modules.tar.gz" ]] || fail "Dependencias do backend ausentes."
[[ -s "$PAYLOAD/app/backend/src/index.js" ]] || fail "Backend do ADM ausente."
[[ -s "$PAYLOAD/app/frontend/dist/index.html" ]] || fail "Frontend do ADM ausente."

mkdir -p "$BACKUP_ROOT" "$ENV_DIR"
chmod 700 "$ENV_DIR"
SERVICE_WAS_ACTIVE="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
[[ "$SERVICE_WAS_ACTIVE" == "active" ]] && SERVICE_WAS_ACTIVE="true" || SERVICE_WAS_ACTIVE="false"

if [[ -s "$ENV_FILE" ]]; then
  ENV_BACKUP="$BACKUP_ROOT/api.env.before-$STAMP"
  cp -a "$ENV_FILE" "$ENV_BACKUP"
fi
if [[ -s "/etc/systemd/system/$SERVICE_NAME" ]]; then
  SERVICE_BACKUP="$BACKUP_ROOT/$SERVICE_NAME.before-$STAMP"
  cp -a "/etc/systemd/system/$SERVICE_NAME" "$SERVICE_BACKUP"
fi

if [[ -d "$INSTALL_ROOT/backend" || -d "$INSTALL_ROOT/frontend" ]]; then
  APP_BACKUP="$BACKUP_ROOT/app-before-$STAMP.tar.gz"
  tar -czf "$APP_BACKUP" -C "$INSTALL_ROOT" \
    --exclude='./backups' backend frontend 2>/dev/null || true
fi

if sudo -u postgres psql -Atqc "select 1 from pg_database where datname = '$DB_NAME'" postgres | grep -qx 1; then
  DB_BACKUP="$BACKUP_ROOT/database-before-$STAMP.dump"
  sudo -u postgres pg_dump --format=custom --no-owner --no-privileges \
    "$DB_NAME" > "$DB_BACKUP"
fi

DB_PASSWORD=""
if [[ -s "$ENV_FILE" ]]; then
  DB_PASSWORD="$(sed -n 's/^PGPASSWORD=//p' "$ENV_FILE" | tail -1)"
fi
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 32)}"
ROLLBACK_REQUIRED="true"
sudo -u postgres psql -v ON_ERROR_STOP=1 postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN;
  END IF;
END
\$\$;
ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
SQL
if sudo -u postgres psql -Atqc "select 1 from pg_database where datname = '$DB_NAME'" postgres | grep -qx 1; then
  sudo -u postgres dropdb "$DB_NAME"
fi
sudo -u postgres createdb --owner="$DB_USER" "$DB_NAME"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "create extension if not exists pgcrypto"
pg_restore -l "$PAYLOAD/adm-data.dump" \
  | grep -v -E ' EXTENSION - pgcrypto | COMMENT - EXTENSION pgcrypto ' \
  > "$WORK_DIR/adm-restore.list"
PGPASSWORD="$DB_PASSWORD" pg_restore \
  --host=127.0.0.1 --username="$DB_USER" --dbname="$DB_NAME" \
  --no-owner --no-privileges --exit-on-error \
  --use-list="$WORK_DIR/adm-restore.list" "$PAYLOAD/adm-data.dump"

systemctl stop "$SERVICE_NAME" 2>/dev/null || true
rm -rf "$INSTALL_ROOT/backend.new" "$INSTALL_ROOT/frontend.new"
mkdir -p "$INSTALL_ROOT/backend.new" "$INSTALL_ROOT/frontend.new"
cp -a "$PAYLOAD/app/backend/." "$INSTALL_ROOT/backend.new/"
cp -a "$PAYLOAD/app/frontend/." "$INSTALL_ROOT/frontend.new/"
tar -xzf "$PAYLOAD/backend-node-modules.tar.gz" -C "$INSTALL_ROOT/backend.new"

if [[ -d "$INSTALL_ROOT/backend/uploads" ]]; then
  cp -a "$INSTALL_ROOT/backend/uploads/." "$INSTALL_ROOT/backend.new/uploads/" 2>/dev/null || true
fi
rm -rf "$INSTALL_ROOT/backend" "$INSTALL_ROOT/frontend"
mv "$INSTALL_ROOT/backend.new" "$INSTALL_ROOT/backend"
mv "$INSTALL_ROOT/frontend.new" "$INSTALL_ROOT/frontend"

if ! id svc-adm >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin svc-adm
fi
install -d -m 750 -o root -g svc-adm "$ENV_DIR" "$ENV_DIR/credentials"
[[ -f "$PAYLOAD/credentials/google-drive-service-account.json" ]] && \
  install -m 640 -o root -g svc-adm "$PAYLOAD/credentials/google-drive-service-account.json" "$ENV_DIR/credentials/google-drive-service-account.json"
[[ -f "$PAYLOAD/credentials/backup-age-key.txt" ]] && \
  install -m 640 -o root -g svc-adm "$PAYLOAD/credentials/backup-age-key.txt" "$ENV_DIR/credentials/backup-age-key.txt"

python3 - "$PAYLOAD/env.source" "$ENV_FILE" "$DB_PASSWORD" "$TARGET_ORIGIN" <<'PY'
import sys
from pathlib import Path

source_path, target_path, db_password, origin = sys.argv[1:]
values = {}
for raw in Path(source_path).read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    values[key.strip()] = value

values.pop("DATABASE_URL", None)
values.update({
    "NODE_ENV": "production",
    "ADM_API_PORT": "3301",
    "PORT": "3301",
    "PGHOST": "127.0.0.1",
    "PGPORT": "5432",
    "PGDATABASE": "adm",
    "PGUSER": "adm_user",
    "PGPASSWORD": db_password,
    "ADM_PUBLIC_URL": f"{origin}/adm",
    "PUBLIC_APP_URL": f"{origin}/adm",
    "ADM_CORS_ORIGINS": origin,
    "CORS_ORIGIN": origin,
    "GOOGLE_OAUTH_REDIRECT_URI": f"{origin}/adm/api/documentos/google/callback",
    "OKTA_REDIRECT_URI": f"{origin}/adm/login",
    "MFA_EMAIL_ENABLED": "false",
    "GOOGLE_APPLICATION_CREDENTIALS": "/etc/adm/credentials/google-drive-service-account.json",
    "DB_BACKUP_AGE_IDENTITY_FILE": "/etc/adm/credentials/backup-age-key.txt",
    "DB_BACKUP_DIR": "/opt/adm/backups/postgres",
})
Path(target_path).write_text("\n".join(f"{key}={value}" for key, value in sorted(values.items())) + "\n", encoding="utf-8")
PY
chmod 600 "$ENV_FILE"

mkdir -p "$INSTALL_ROOT/backend/uploads" "$INSTALL_ROOT/backups/postgres"
chown -R root:root "$INSTALL_ROOT/backend" "$INSTALL_ROOT/frontend"
chown -R svc-adm:svc-adm "$INSTALL_ROOT/backend/uploads" "$INSTALL_ROOT/backups/postgres"

install -m 644 "$PAYLOAD/adm-api.service" "/etc/systemd/system/$SERVICE_NAME"
install -d -m 755 /etc/nginx/snippets
install -m 644 "$PAYLOAD/nginx-adm-location.conf" /etc/nginx/snippets/adm-retiradas.conf

NGINX_TARGET="$(python3 - <<'PY'
from pathlib import Path
for enabled in sorted(Path('/etc/nginx/sites-enabled').glob('*')):
    try:
        text = enabled.read_text(encoding='utf-8')
    except (OSError, UnicodeDecodeError):
        continue
    if 'server_name' in text and 'retiradas.sempre.net.br' in text:
        print(enabled.resolve())
        break
PY
)"
[[ -n "$NGINX_TARGET" && -f "$NGINX_TARGET" ]] || fail "Nao encontrei o vhost de retiradas.sempre.net.br."
NGINX_BACKUP="$NGINX_TARGET.before-adm-$STAMP"
cp -a "$NGINX_TARGET" "$NGINX_BACKUP"
python3 - "$NGINX_TARGET" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
source = path.read_text(encoding="utf-8")
include = "include /etc/nginx/snippets/adm-retiradas.conf;"
if include in source:
    raise SystemExit(0)

starts = [match.start() for match in re.finditer(r"\bserver\s*\{", source)]
insertions = []
for start in starts:
    opening = source.find("{", start)
    depth = 0
    closing = None
    for index in range(opening, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                closing = index
                break
    if closing is None:
        continue
    block = source[start:closing]
    if re.search(r"server_name\s+[^;]*\bretiradas\.sempre\.net\.br\b", block):
        insertions.append(closing)

if not insertions:
    raise SystemExit("Vhost encontrado, mas nenhum bloco server correspondente foi localizado")
for index in reversed(insertions):
    source = source[:index] + f"\n\t{include}\n" + source[index:]
path.write_text(source, encoding="utf-8")
PY

if ! nginx -t; then
  cp -a "$NGINX_BACKUP" "$NGINX_TARGET"
  fail "Configuracao Nginx invalida; arquivo anterior restaurado."
fi

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"
nginx -s reload

for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:3301/api/health >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    journalctl -u "$SERVICE_NAME" -n 80 --no-pager >&2 || true
    fail "ADM nao respondeu ao health check local."
  fi
  sleep 2
done

curl -fsS "$TARGET_ORIGIN/adm/api/health" >/dev/null
curl -fsS "$TARGET_ORIGIN/adm/" | grep -qi '<!doctype html'

echo
echo "ADM instalado com sucesso em $TARGET_ORIGIN/adm/"
echo "Banco restaurado: $DB_NAME (separado do Retiradas)"
echo "Servico: $SERVICE_NAME"
echo "Backup anterior da aplicacao: ${APP_BACKUP:-nao havia}"
echo "Backup anterior do banco: ${DB_BACKUP:-nao havia}"
echo "Nginx anterior: $NGINX_BACKUP"
ROLLBACK_REQUIRED="false"
