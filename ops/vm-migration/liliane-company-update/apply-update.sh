#!/usr/bin/env bash
set -Eeuo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Execute como root." >&2; exit 1; }

package_dir="$(cd "$(dirname "$0")" && pwd)"
version="$(sed -n 's/^VERSION=//p' "$package_dir/VERSAO.txt")"
release_id="company-${version}"
root=/opt/liliane
release="$root/releases/$release_id"
previous=""
backup="$root/backups/${release_id}-before.dump"
work="$(mktemp -d /tmp/liliane-company-update.XXXXXX)"

cleanup() { rm -rf "$work"; }
rollback() {
  code=$?
  trap - ERR
  echo "Falha detectada. Restaurando a aplicação anterior..." >&2
  if [ -n "$previous" ] && [ -d "$previous" ]; then
    ln -sfn "$previous" "$root/current.next"
    mv -Tf "$root/current.next" "$root/current"
  fi
  systemctl restart liliane-api.service 2>/dev/null || true
  cleanup
  exit "$code"
}
trap rollback ERR
trap cleanup EXIT

for command in tar sha256sum sudo pg_dump systemctl curl; do
  command -v "$command" >/dev/null || { echo "Dependência ausente: $command" >&2; exit 1; }
done
[ -s "$root/shared/.env" ] || { echo "Instalação atual do Lili não encontrada." >&2; exit 1; }
[ -L "$root/current" ] || { echo "Release atual do Lili não encontrada." >&2; exit 1; }

cd "$package_dir"
sha256sum -c SHA256SUMS.txt
previous="$(readlink -f "$root/current")"

install -d -m 0750 "$root/releases" "$root/backups"
sudo -u postgres pg_dump -Fc --no-owner --no-privileges aprovacoes_lili > "$backup"
test -s "$backup"

tar -xzf liliane-app.tar.gz -C "$work"
rm -rf "$release"
install -d -m 0750 "$release"
cp -a "$work/payload/." "$release/"
if [ -f "$release/frontend/dist/index.html" ]; then
  cp -a "$release/frontend/dist/." "$release/frontend/"
  rm -rf "$release/frontend/dist"
fi
chown -R liliane:liliane "$release"
chmod 0755 "$release" "$release/frontend"

systemctl stop liliane-api.service
set -a
. "$root/shared/.env"
set +a
node "$release/backend/dist/migrate.js"

ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
systemctl restart liliane-api.service
curl -fsS --retry 20 --retry-delay 2 --retry-connrefused http://127.0.0.1:3401/health >/dev/null

trap - ERR
find "$root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +5 | cut -d' ' -f2- | xargs -r rm -rf

echo
echo "Aprovações Lili atualizado com sucesso."
echo "Versão: $version"
echo "Banco atual preservado e migrado."
echo "Backup: $backup"
