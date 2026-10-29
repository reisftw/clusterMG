#!/usr/bin/env python3
"""Prepare ADM sources for a dedicated production origin at the web root."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(sys.argv[1]).resolve()
ORIGIN = str(sys.argv[2]).rstrip("/")
HOSTNAME = urlparse(ORIGIN).hostname or "administrativo.sempre.net.br"
FRONTEND = ROOT / "frontend"
BACKEND = ROOT / "backend"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def write(path: Path, value: str) -> None:
    path.write_text(value, encoding="utf-8", newline="\n")


def patch_tree(root: Path) -> None:
    for path in root.rglob("*"):
        if path.is_dir() or "node_modules" in path.parts:
            continue
        if path.suffix not in {".js", ".jsx", ".json", ".html", ".webmanifest"}:
            continue
        source = read(path)
        updated = source.replace("https://adm.retiradas.tech", ORIGIN)
        if updated != source:
            write(path, updated)


patch_tree(FRONTEND)
patch_tree(BACKEND)

api_client = FRONTEND / "src/services/vpsApiClient.js"
source = read(api_client)
source = source.replace(
    'return /^adm\\./i.test(window.location.hostname);',
    'return /^(?:adm|administrativo)\\./i.test(window.location.hostname);',
)
write(api_client, source)

# Keep ADM browser/session keys isolated even if another application is later
# exposed from the same parent domain.
auth_session = FRONTEND / "src/services/vpsAuthSession.js"
source = read(auth_session)
source = source.replace('"retiradas_csrf"', '"adm_csrf"')
source = re.sub(
    r'("retiradas[^"\n]*(?:session|auth)[^"\n]*")',
    lambda match: match.group(1).replace("retiradas", "adm", 1),
    source,
    flags=re.IGNORECASE,
)
write(auth_session, source)

for path in BACKEND.joinpath("src").rglob("*.js"):
    source = read(path)
    source = source.replace("retiradas_session", "adm_session")
    source = source.replace("retiradas_refresh", "adm_refresh")
    source = source.replace("retiradas_csrf", "adm_csrf")
    write(path, source)

backend_app = BACKEND / "src/app.js"
source = read(backend_app)
origin_literal = f'"{ORIGIN}",'
if origin_literal not in source:
    source = source.replace(
        '"http://127.0.0.1:5176",',
        f'{origin_literal}\n\t\t\t"http://127.0.0.1:5176",',
        1,
    )
write(backend_app, source)

print(f"ADM sources prepared for {ORIGIN} ({HOSTNAME})")
