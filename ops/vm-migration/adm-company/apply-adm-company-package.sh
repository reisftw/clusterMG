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
TARGET_ORIGIN="${ADM_PUBLIC_ORIGIN:-https://administrativo.sempre.net.br}"
TARGET_HOST="${ADM_PUBLIC_HOST:-administrativo.sempre.net.br}"
NGINX_NAME="administrativo.sempre.net.br"
NGINX_AVAILABLE="/etc/nginx/sites-available/$NGINX_NAME"
NGINX_ENABLED="/etc/nginx/sites-enabled/$NGINX_NAME"
PAYLOAD_ENCRYPTED="$PACKAGE_DIR/payload.tar.gz.enc"
EXPECTED_SHA_FILE="$PACKAGE_DIR/payload.tar.gz.enc.sha256"
PACKAGE_KEY="${ADM_PACKAGE_KEY:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/administrativo-company-install.XXXXXX)"
APP_BACKUP=""
DB_BACKUP=""
ENV_BACKUP=""
SERVICE_BACKUP=""
NGINX_BACKUP=""
SERVICE_WAS_ACTIVE="false"
ROLLBACK_REQUIRED="false"
DB_EXISTED="false"
DB_CREATED="false"

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
    if [[ -n "$SERVICE_BACKUP" && -s "$SERVICE_BACKUP" ]]; then
      cp -a "$SERVICE_BACKUP" "/etc/systemd/system/$SERVICE_NAME"
    else
      rm -f "/etc/systemd/system/$SERVICE_NAME"
    fi
    if [[ "$DB_CREATED" == "true" ]]; then
      sudo -u postgres psql -d postgres -c \
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB_NAME' and pid <> pg_backend_pid()" \
        >/dev/null 2>&1 || true
      sudo -u postgres dropdb --if-exists "$DB_NAME" >/dev/null 2>&1 || true
    fi

    rm -f "$NGINX_ENABLED" "$NGINX_AVAILABLE"
    if [[ -n "$NGINX_BACKUP" && -s "$NGINX_BACKUP" ]]; then
      tar -xzf "$NGINX_BACKUP" -C / >/dev/null 2>&1 || true
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
[[ "$TARGET_ORIGIN" == "https://$TARGET_HOST" ]] || \
  fail "ADM_PUBLIC_ORIGIN e ADM_PUBLIC_HOST precisam representar o mesmo dominio HTTPS."
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
[[ -s "$PAYLOAD/adm-data.dump" ]] || fail "Dump inicial do ADM ausente."
[[ -s "$PAYLOAD/env.source" ]] || fail "Configuracao inicial do ADM ausente."
[[ -s "$PAYLOAD/backend-node-modules.tar.gz" ]] || fail "Dependencias do backend ausentes."
[[ -s "$PAYLOAD/app/backend/src/index.js" ]] || fail "Backend do ADM ausente."
[[ -s "$PAYLOAD/app/frontend/dist/index.html" ]] || fail "Frontend do ADM ausente."

mkdir -p "$BACKUP_ROOT" "$ENV_DIR"
chmod 700 "$ENV_DIR"
SERVICE_WAS_ACTIVE="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
[[ "$SERVICE_WAS_ACTIVE" == "active" ]] && SERVICE_WAS_ACTIVE="true" || SERVICE_WAS_ACTIVE="false"

if [[ -s "$ENV_FILE" ]]; then
  ENV_BACKUP="$BACKUP_ROOT/api.env.before-domain-$STAMP"
  cp -a "$ENV_FILE" "$ENV_BACKUP"
fi
if [[ -s "/etc/systemd/system/$SERVICE_NAME" ]]; then
  SERVICE_BACKUP="$BACKUP_ROOT/$SERVICE_NAME.before-domain-$STAMP"
  cp -a "/etc/systemd/system/$SERVICE_NAME" "$SERVICE_BACKUP"
fi
if [[ -d "$INSTALL_ROOT/backend" || -d "$INSTALL_ROOT/frontend" ]]; then
  APP_BACKUP="$BACKUP_ROOT/app-before-domain-$STAMP.tar.gz"
  tar -czf "$APP_BACKUP" -C "$INSTALL_ROOT" \
    --exclude='./backups' backend frontend 2>/dev/null || true
fi

NGINX_BACKUP="$BACKUP_ROOT/nginx-before-domain-$STAMP.tar.gz"
tar -czf "$NGINX_BACKUP" -C / \
  etc/nginx/sites-available etc/nginx/sites-enabled etc/nginx/snippets

CURRENT_ENV_SOURCE="$PAYLOAD/env.source"
if [[ -s "$ENV_FILE" ]]; then
  CURRENT_ENV_SOURCE="$ENV_FILE"
  DB_NAME="$(sed -n 's/^PGDATABASE=//p' "$ENV_FILE" | tail -1)"
  DB_USER="$(sed -n 's/^PGUSER=//p' "$ENV_FILE" | tail -1)"
fi
DB_NAME="${DB_NAME:-adm}"
DB_USER="${DB_USER:-adm_user}"
DB_PASSWORD="$(sed -n 's/^PGPASSWORD=//p' "$CURRENT_ENV_SOURCE" | tail -1)"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 32)}"

if sudo -u postgres psql -Atqc "select 1 from pg_database where datname = '$DB_NAME'" postgres | grep -qx 1; then
  DB_EXISTED="true"
  DB_BACKUP="$BACKUP_ROOT/database-before-domain-$STAMP.dump"
  sudo -u postgres pg_dump --format=custom --no-owner --no-privileges \
    "$DB_NAME" > "$DB_BACKUP"
fi

ROLLBACK_REQUIRED="true"

if [[ "$DB_EXISTED" != "true" ]]; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN;
  END IF;
END
\$\$;
ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
SQL
  sudo -u postgres createdb --owner="$DB_USER" "$DB_NAME"
  DB_CREATED="true"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
    -c "create extension if not exists pgcrypto"
  pg_restore -l "$PAYLOAD/adm-data.dump" \
    | grep -v -E ' EXTENSION - pgcrypto | COMMENT - EXTENSION pgcrypto ' \
    > "$WORK_DIR/adm-restore.list"
  PGPASSWORD="$DB_PASSWORD" pg_restore \
    --host=127.0.0.1 --username="$DB_USER" --dbname="$DB_NAME" \
    --no-owner --no-privileges --exit-on-error \
    --use-list="$WORK_DIR/adm-restore.list" "$PAYLOAD/adm-data.dump"
else
  PGPASSWORD="$DB_PASSWORD" psql \
    --host=127.0.0.1 --username="$DB_USER" --dbname="$DB_NAME" \
    -v ON_ERROR_STOP=1 -Atqc "select 1" | grep -qx 1
fi

systemctl stop "$SERVICE_NAME" 2>/dev/null || true
rm -rf "$INSTALL_ROOT/backend.new" "$INSTALL_ROOT/frontend.new"
mkdir -p "$INSTALL_ROOT/backend.new" "$INSTALL_ROOT/frontend.new"
cp -a "$PAYLOAD/app/backend/." "$INSTALL_ROOT/backend.new/"
cp -a "$PAYLOAD/app/frontend/." "$INSTALL_ROOT/frontend.new/"
tar -xzf "$PAYLOAD/backend-node-modules.tar.gz" -C "$INSTALL_ROOT/backend.new"

if [[ -d "$INSTALL_ROOT/backend/uploads" ]]; then
  mkdir -p "$INSTALL_ROOT/backend.new/uploads"
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

python3 - "$CURRENT_ENV_SOURCE" "$ENV_FILE" "$DB_NAME" "$DB_USER" "$DB_PASSWORD" "$TARGET_ORIGIN" <<'PY'
import sys
from pathlib import Path

source_path, target_path, db_name, db_user, db_password, origin = sys.argv[1:]
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
    "PGDATABASE": db_name,
    "PGUSER": db_user,
    "PGPASSWORD": db_password,
    "ADM_PUBLIC_URL": origin,
    "PUBLIC_APP_URL": origin,
    "ADM_CORS_ORIGINS": origin,
    "CORS_ORIGIN": origin,
    "GOOGLE_OAUTH_REDIRECT_URI": f"{origin}/api/documentos/google/callback",
    "OKTA_REDIRECT_URI": f"{origin}/login",
    "GOOGLE_APPLICATION_CREDENTIALS": "/etc/adm/credentials/google-drive-service-account.json",
    "DB_BACKUP_AGE_IDENTITY_FILE": "/etc/adm/credentials/backup-age-key.txt",
    "DB_BACKUP_DIR": "/opt/adm/backups/postgres",
})
values.setdefault("MFA_EMAIL_ENABLED", "false")
Path(target_path).write_text(
    "\n".join(f"{key}={value}" for key, value in sorted(values.items())) + "\n",
    encoding="utf-8",
)
PY
chmod 600 "$ENV_FILE"

mkdir -p "$INSTALL_ROOT/backend/uploads" "$INSTALL_ROOT/backups/postgres"
chown -R root:root "$INSTALL_ROOT/backend" "$INSTALL_ROOT/frontend"
chown -R svc-adm:svc-adm "$INSTALL_ROOT/backend/uploads" "$INSTALL_ROOT/backups/postgres"
install -m 644 "$PAYLOAD/adm-api.service" "/etc/systemd/system/$SERVICE_NAME"

TLS_CERT="${ADM_TLS_CERTIFICATE:-}"
TLS_KEY="${ADM_TLS_CERTIFICATE_KEY:-}"
if [[ -z "$TLS_CERT" || -z "$TLS_KEY" ]]; then
  if [[ -s "/etc/letsencrypt/live/$TARGET_HOST/fullchain.pem" && -s "/etc/letsencrypt/live/$TARGET_HOST/privkey.pem" ]]; then
    TLS_CERT="/etc/letsencrypt/live/$TARGET_HOST/fullchain.pem"
    TLS_KEY="/etc/letsencrypt/live/$TARGET_HOST/privkey.pem"
  else
    while IFS='|' read -r candidate_cert candidate_key; do
      [[ -s "$candidate_cert" && -s "$candidate_key" ]] || continue
      if openssl x509 -in "$candidate_cert" -noout -checkhost "$TARGET_HOST" >/dev/null 2>&1; then
        TLS_CERT="$candidate_cert"
        TLS_KEY="$candidate_key"
        break
      fi
    done < <(python3 - <<'PY'
import re
from pathlib import Path

seen = set()
for enabled in sorted(Path("/etc/nginx/sites-enabled").glob("*")):
    try:
        path = enabled.resolve()
        if path in seen:
            continue
        seen.add(path)
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        continue
    certificates = re.findall(r"^\s*ssl_certificate\s+([^;]+);", text, re.M)
    keys = re.findall(r"^\s*ssl_certificate_key\s+([^;]+);", text, re.M)
    for certificate, key in zip(certificates, keys):
        print(f"{certificate.strip()}|{key.strip()}")
PY
)
  fi
fi
if [[ -n "$TLS_CERT" || -n "$TLS_KEY" ]]; then
  [[ -s "$TLS_CERT" && -s "$TLS_KEY" ]] || \
    fail "Certificado TLS e chave precisam existir juntos."
  openssl x509 -in "$TLS_CERT" -noout -checkhost "$TARGET_HOST" >/dev/null 2>&1 || \
    fail "O certificado TLS informado nao cobre $TARGET_HOST."
fi

python3 - "$NGINX_AVAILABLE" "$TARGET_HOST" "$TLS_CERT" "$TLS_KEY" <<'PY'
import sys
from pathlib import Path

target, hostname, certificate, key = sys.argv[1:]

locations = r'''
	client_max_body_size 200M;
	root /opt/adm/frontend/dist;
	index index.html;

	add_header X-Content-Type-Options "nosniff" always;
	add_header X-Frame-Options "SAMEORIGIN" always;
	add_header Referrer-Policy "strict-origin-when-cross-origin" always;
	add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
	add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self'; style-src-elem 'self' 'unsafe-inline' https://accounts.google.com; style-src-attr 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https: wss:; object-src 'none'; frame-ancestors 'self'; frame-src https://accounts.google.com; base-uri 'self'; form-action 'self';" always;

	location /api/ {
		proxy_pass http://127.0.0.1:3301/api/;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection "upgrade";
		proxy_connect_timeout 10s;
		proxy_send_timeout 600s;
		proxy_read_timeout 600s;
	}

	location /assets/ {
		try_files $uri =404;
		access_log off;
		expires 1y;
		add_header Cache-Control "public, max-age=31536000, immutable" always;
	}

	location = /sw.js {
		try_files $uri =404;
		expires -1;
		add_header Cache-Control "no-cache, no-store, must-revalidate" always;
	}

	location ~* ^/(?:manifest|terceiros)\.webmanifest$ {
		try_files $uri =404;
		expires -1;
		add_header Cache-Control "no-cache, no-store, must-revalidate" always;
	}

	location / {
		expires -1;
		try_files $uri $uri/ /index.html;
		add_header Cache-Control "no-cache, no-store, must-revalidate" always;
	}
'''

if certificate and key:
    content = f'''server {{
	listen 80;
	server_name {hostname};
	return 301 https://{hostname}$request_uri;
}}

server {{
	listen 443 ssl http2;
	server_name {hostname};
	ssl_certificate {certificate};
	ssl_certificate_key {key};
	add_header Strict-Transport-Security "max-age=31536000" always;
{locations}}}
'''
else:
    content = f'''server {{
	listen 80;
	server_name {hostname};
{locations}}}
'''

Path(target).write_text(content, encoding="utf-8")
PY

ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"

# Remove the legacy /adm include from the Retiradas vhost. The ADM files,
# service and database remain under their own /opt/adm and PostgreSQL boundary.
python3 - <<'PY'
from pathlib import Path

seen = set()
for directory in (Path("/etc/nginx/sites-available"), Path("/etc/nginx/sites-enabled")):
    for candidate in directory.glob("*"):
        try:
            path = candidate.resolve()
            if path in seen or not path.is_file():
                continue
            seen.add(path)
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        updated = "\n".join(
            line
            for line in source.splitlines()
            if "include /etc/nginx/snippets/adm-retiradas.conf;" not in line
        )
        if updated != source.rstrip("\n"):
            path.write_text(updated + "\n", encoding="utf-8")
Path("/etc/nginx/snippets/adm-retiradas.conf").unlink(missing_ok=True)
PY

nginx -t
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

if [[ -n "$TLS_CERT" && -n "$TLS_KEY" ]]; then
  curl -fsS --cacert "$TLS_CERT" --resolve "$TARGET_HOST:443:127.0.0.1" \
    "$TARGET_ORIGIN/api/health" >/dev/null
  curl -fsS --cacert "$TLS_CERT" --resolve "$TARGET_HOST:443:127.0.0.1" \
    "$TARGET_ORIGIN/" | grep -qi '<!doctype html'
  TLS_MODE="TLS direto no Nginx ($TLS_CERT)"
else
  curl -fsS -H "Host: $TARGET_HOST" \
    http://127.0.0.1/api/health >/dev/null
  curl -fsS -H "Host: $TARGET_HOST" \
    http://127.0.0.1/ | grep -qi '<!doctype html'
  TLS_MODE="HTTP no origin; HTTPS deve terminar no WAF/proxy corporativo"
fi

echo
echo "ADM publicado de forma independente em $TARGET_ORIGIN/"
echo "Banco preservado: $DB_NAME"
echo "Servico: $SERVICE_NAME"
echo "Vhost: $NGINX_AVAILABLE"
echo "TLS: $TLS_MODE"
echo "Rota antiga /adm removida do vhost Retiradas."
echo "Backup da aplicacao: ${APP_BACKUP:-nao havia}"
echo "Backup do banco: ${DB_BACKUP:-primeira instalacao}"
echo "Backup do Nginx: $NGINX_BACKUP"
ROLLBACK_REQUIRED="false"
