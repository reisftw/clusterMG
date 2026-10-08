#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VENDOR_DIR="$ROOT_DIR/ops/vm-migration/vendor"
XLSX_TARBALL="$VENDOR_DIR/xlsx-0.20.3.tgz"
XLSX_SHA256="8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8"

if [[ ! -f "$XLSX_TARBALL" ]]; then
	echo "Arquivo offline ausente: $XLSX_TARBALL" >&2
	exit 1
fi

actual_sha256="$(sha256sum "$XLSX_TARBALL" | awk '{print $1}')"
if [[ "$actual_sha256" != "$XLSX_SHA256" ]]; then
	echo "SHA256 inesperado para $XLSX_TARBALL" >&2
	echo "Esperado: $XLSX_SHA256" >&2
	echo "Atual:    $actual_sha256" >&2
	exit 1
fi

echo "Preparando cache npm com dependencias offline..."
npm cache add "$XLSX_TARBALL"

echo "OK: xlsx offline validado e adicionado ao cache npm."
echo "Observacao: navegadores do Playwright ainda dependem da liberacao dos CDNs do Playwright se nao estiverem instalados na VM."
