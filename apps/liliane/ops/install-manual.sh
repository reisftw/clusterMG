#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute como root." >&2
  exit 1
fi

source_root="${1:?Informe a pasta extraida da release.}"
release_id="${2:?Informe o identificador da release.}"
root=/opt/liliane
release="$root/releases/$release_id"
previous=""
[ -L "$root/current" ] && previous="$(readlink -f "$root/current")"

rollback() {
  if [ -n "$previous" ] && [ -d "$previous" ]; then
    ln -sfn "$previous" "$root/current.next"
    mv -Tf "$root/current.next" "$root/current"
    systemctl restart liliane-api.service || true
  fi
}
trap 'rollback' ERR

install -d -m 0750 "$root/releases" "$root/shared" "$root/backups"
id liliane >/dev/null 2>&1 || useradd --system --home "$root" --shell /usr/sbin/nologin liliane
chown root:liliane "$root" "$root/releases"
chmod 0755 "$root" "$root/releases"
rm -rf "$release"
install -d -m 0750 "$release"
cp -a "$source_root/backend" "$source_root/frontend" "$source_root/ops" "$release/"
npm ci --omit=dev --no-audit --no-fund --prefix "$release/backend"

env_file="$root/shared/.env"
evolution_env="$root/shared/evolution.env"
if [ ! -s "$env_file" ]; then
  db_password="$(openssl rand -hex 24)"
  encryption_key="$(openssl rand -base64 32 | tr -d '\n')"
  integrity_key="$(openssl rand -hex 32)"
  webhook_secret="$(openssl rand -hex 32)"
  evolution_key="$(openssl rand -hex 32)"
  evolution_db_password="$(openssl rand -hex 24)"
  bootstrap_password="Lili-$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9')-Aa1"
  cat > "$env_file" <<ENV
NODE_ENV=production
PORT=3401
DATABASE_URL=postgres://liliane_app:${db_password}@127.0.0.1:5432/aprovacoes_lili
PUBLIC_BASE_URL=https://retiradas.tech/liliane
APP_ENCRYPTION_KEY=${encryption_key}
INTEGRITY_KEY=${integrity_key}
EVOLUTION_WEBHOOK_SECRET=${webhook_secret}
EVOLUTION_URL=http://127.0.0.1:8082
EVOLUTION_API_KEY=${evolution_key}
EVOLUTION_INSTANCE=aprovacoes-lili
WHATSAPP_DECISIONS_ENABLED=true
BOOTSTRAP_ADMIN_PASSWORD=${bootstrap_password}
SESSION_TTL_HOURS=12
DB_POOL_MAX=10
ENV
  printf 'Usuario: admin\nSenha provisoria: %s\n' "$bootstrap_password" > "$root/shared/bootstrap-admin.txt"
  chmod 0600 "$root/shared/bootstrap-admin.txt"
else
  db_password="$(sed -n 's#^DATABASE_URL=postgres://liliane_app:\([^@]*\)@.*#\1#p' "$env_file")"
  evolution_key="$(sed -n 's/^EVOLUTION_API_KEY=//p' "$env_file")"
  evolution_db_password="$(sed -n 's/^LILI_EVOLUTION_DB_PASSWORD=//p' "$evolution_env" 2>/dev/null || true)"
  [ -n "$evolution_db_password" ] || evolution_db_password="$(openssl rand -hex 24)"
fi
chmod 0600 "$env_file"

if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='liliane_app'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create role liliane_app login password '$db_password'"
else
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "alter role liliane_app password '$db_password'"
fi
if ! sudo -u postgres psql -tAc "select 1 from pg_database where datname='aprovacoes_lili'" | grep -q 1; then
  sudo -u postgres createdb -O liliane_app aprovacoes_lili
else
  sudo -u postgres pg_dump -Fc aprovacoes_lili > "$root/backups/aprovacoes_lili-before-${release_id}.dump"
fi

cat > "$evolution_env" <<ENV
LILI_EVOLUTION_PUBLIC_URL=http://127.0.0.1:8082
LILI_EVOLUTION_API_KEY=${evolution_key}
LILI_EVOLUTION_DB_USER=liliane_evolution
LILI_EVOLUTION_DB_PASSWORD=${evolution_db_password}
LILI_EVOLUTION_DB_NAME=liliane_evolution
ENV
chmod 0600 "$evolution_env"
docker compose --env-file "$evolution_env" -f "$release/ops/docker-compose.evolution.yml" up -d

chown -R liliane:liliane "$release"
chmod 0755 "$release" "$release/frontend"
set -a
. "$env_file"
set +a
node "$release/backend/dist/migrate.js"
node "$release/backend/dist/bootstrap.js"
sed -i '/^BOOTSTRAP_ADMIN_PASSWORD=/d' "$env_file"

ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
install -m 0644 "$release/ops/liliane-api.service" /etc/systemd/system/liliane-api.service
install -m 0644 "$release/ops/nginx-liliane.conf" /etc/nginx/snippets/liliane.conf
site="$(readlink -f /etc/nginx/sites-enabled/retiradas)"
if ! grep -q 'snippets/liliane.conf' "$site"; then
  sed -i '/^[[:space:]]*location \/ {/i\	include /etc/nginx/snippets/liliane.conf;\n' "$site"
fi
systemctl daemon-reload
systemctl enable --now liliane-api.service
nginx -t
systemctl reload nginx
curl -fsS --retry 20 --retry-delay 2 --retry-connrefused http://127.0.0.1:3401/health >/dev/null

trap - ERR
find "$root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +4 | cut -d' ' -f2- | xargs -r rm -rf
echo "Aprovacoes Lili publicado em https://retiradas.tech/liliane/"
