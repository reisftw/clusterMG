#!/bin/bash
# ============================================================
# Pacote de validacao operacional do Finan - RODAR NA VPS COMO ROOT
# 100% leitura. Nao reinicia nada, nao aplica migration, nao altera nginx,
# nao faz UPDATE/DELETE/INSERT em nada.
#
# Uso: bash validacao-operacional-producao.sh > /tmp/finan-validacao.txt
# Depois cole o CONTEUDO desse arquivo de volta na conversa com o Claude.
# (o arquivo fica local na VPS, nao sai de la sozinho)
# ============================================================
set -uo pipefail

echo "##### [1] COMO O FINAN CONECTA NO POSTGRES #####"
echo "--- variaveis usadas pelo codigo (so nomes, sem valor) ---"
grep -oE "process\.env\.[A-Z_]+" /opt/retiradas/apps/finan/backend/src/db.js | sort -u

echo
echo "--- quais dessas existem no .env (so nomes, sem valor) ---"
grep -oE "^[A-Z_]+" /opt/retiradas/apps/finan/.env | sort -u

echo
echo "--- variaveis de ambiente do PROCESSO REAL em execucao (so nomes) ---"
FINAN_PID=$(systemctl show -p MainPID --value finan-api.service)
echo "PID: $FINAN_PID"
if [ -n "$FINAN_PID" ] && [ "$FINAN_PID" != "0" ]; then
  sudo cat /proc/$FINAN_PID/environ | tr '\0' '\n' | grep -oE "^[A-Z_]+" | sort -u
else
  echo "Servico nao parece estar rodando (MainPID vazio ou 0)."
fi

echo
echo "##### [2] CONFIRMAR BANCO REAL (sem expor a URL) #####"
set -a
source /opt/retiradas/apps/finan/.env
set +a
if [ -z "${FINAN_DATABASE_URL:-}" ]; then
  echo "FINAN_DATABASE_URL continua vazia apos source."
  echo "Verifique no item [1] acima com qual NOME de variavel o .env realmente"
  echo "define a conexao (pode ser um nome diferente do que o codigo espera,"
  echo "ou pode estar comentada/mal formatada no arquivo)."
else
  psql "$FINAN_DATABASE_URL" -t -c "select current_database() as banco, current_user as usuario, coalesce(host(inet_server_addr()),'local (socket unix)') as host, inet_server_port() as porta;"
fi

echo
echo "##### [3] PREFLIGHT E 100% READ-ONLY? #####"
grep -inE "^\s*(insert|update|delete|alter|drop|truncate|create|grant|revoke|call)\b" /opt/retiradas/apps/finan/backend/sql-tools/preflight_010_finan_integrity.sql
echo "(linha vazia acima = confirmado read-only; se apareceu algo, PARE e nao rode o item 4)"

echo
echo "##### [4] EXECUTAR O PREFLIGHT #####"
if [ -n "${FINAN_DATABASE_URL:-}" ]; then
  psql "$FINAN_DATABASE_URL" -f /opt/retiradas/apps/finan/backend/sql-tools/preflight_010_finan_integrity.sql
else
  echo "Pulado: sem FINAN_DATABASE_URL resolvida no item [2]."
fi

echo
echo "##### [6] NGINX REAL #####"
sudo nginx -T 2>&1 | awk '/server_name finan\.retiradas\.tech/{f=1} f{print} /^}/{if(f){print "---"; f=0}}'

echo
echo "##### [7] BACKUP: SERVICO E TIMER #####"
systemctl cat retiradas-db-backup.service 2>&1
echo "---timer---"
systemctl list-timers retiradas-db-backup.timer --all 2>&1
echo "---status/ultima execucao---"
systemctl status retiradas-db-backup.service --no-pager -l 2>&1 | head -20
echo "---arquivos de backup (metadados, sem conteudo)---"
BACKUP_DIR=$(grep -oE "(/[a-zA-Z0-9_./-]+backup[a-zA-Z0-9_./-]*)" /etc/systemd/system/retiradas-db-backup.service 2>/dev/null | head -1)
echo "diretorio detectado: $BACKUP_DIR"
ls -lah "$BACKUP_DIR" 2>&1 | tail -15
echo "---o script/servico faz backup de quais bancos?---"
sudo systemctl cat retiradas-db-backup.service | grep -iE "ExecStart|pg_dump|pg_dumpall"
find /opt/retiradas -iname "*backup*.sh" -o -iname "*backup*.js" 2>/dev/null | xargs -I{} sh -c 'echo "--- {} ---"; grep -iE "pg_dump|database|--dbname|finan" {}' 2>/dev/null

echo
echo "##### [10] HEALTHCHECK LOCAL #####"
curl -s http://127.0.0.1:3101/api/finan/health
echo

echo "##### [11] STATUS DOS SERVICOS #####"
systemctl status finan-api.service --no-pager -l 2>&1 | head -15
echo "---"
systemctl status nginx --no-pager -l 2>&1 | head -10
echo "---postgres local (se houver)---"
systemctl status postgresql --no-pager -l 2>&1 | head -10

echo
echo "##### FIM DO PACOTE #####"
