#!/usr/bin/env python3
"""Prepare the production ADM sources to run below /adm on a shared origin."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(sys.argv[1]).resolve()
FRONTEND = ROOT / "frontend"
BACKEND = ROOT / "backend"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def write(path: Path, value: str) -> None:
    path.write_text(value, encoding="utf-8", newline="\n")


def replace(path: Path, old: str, new: str, *, count: int = 1) -> None:
    source = read(path)
    if source.count(old) < count:
        raise RuntimeError(f"Expected fragment not found in {path}: {old[:80]!r}")
    write(path, source.replace(old, new, count))


api_client = FRONTEND / "src/services/vpsApiClient.js"
replace(
    api_client,
    'if (isFinanHost() || isAdmHost()) return `${window.location.origin}/api`;',
    'if (isFinanHost()) return `${window.location.origin}/api`;\n'
    '\tif (isAdmHost()) {\n'
    '\t\tconst basePath = import.meta.env.BASE_URL.replace(/\\/$/, "");\n'
    '\t\treturn `${window.location.origin}${basePath}/api`;\n'
    '\t}',
)
replace(
    api_client,
    'return /^adm\\./i.test(window.location.hostname);',
    'return (\n'
    '\t\t/^adm\\./i.test(window.location.hostname) ||\n'
    '\t\twindow.location.pathname === "/adm" ||\n'
    '\t\twindow.location.pathname.startsWith("/adm/")\n'
    '\t);',
)

router = FRONTEND / "src/router/AppRouter.jsx"
replace(
    router,
    "<BrowserRouter>",
    '<BrowserRouter basename={import.meta.env.BASE_URL.replace(/\\/$/, "")}>',
)

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

main = FRONTEND / "src/main.jsx"
source = read(main)
anchor = "initErrorTracking();\n"
if anchor not in source:
    raise RuntimeError("main.jsx init anchor not found")
source = source.replace(
    anchor,
    anchor + '\nconst APP_BASE_PATH = import.meta.env.BASE_URL.replace(/\\/$/, "");\n',
    1,
)
source = source.replace(
    "const currentPath = window.location.pathname;",
    "const pathname = window.location.pathname;\n"
    "\tconst currentPath = pathname.startsWith(APP_BASE_PATH)\n"
    "\t\t? pathname.slice(APP_BASE_PATH.length) || \"/\"\n"
    "\t\t: pathname;",
    1,
)
source = source.replace(
    'window.location.replace("/painel");',
    'window.location.replace(`${APP_BASE_PATH}/painel`);',
    1,
)
write(main, source)

service_worker_client = FRONTEND / "src/services/appServiceWorker.js"
source = read(service_worker_client)
source = source.replace(
    'return `/sw.js?${params.toString()}`;',
    'return `${import.meta.env.BASE_URL}sw.js?${params.toString()}`;',
    1,
)
source = source.replace(
    ".register(buildServiceWorkerUrl())",
    ".register(buildServiceWorkerUrl(), { scope: import.meta.env.BASE_URL })",
    1,
)
write(service_worker_client, source)

service_worker = FRONTEND / "public/sw.js"
source = read(service_worker)
source = re.sub(
    r'(["\'])/(?!/|adm/)([^"\'\r\n]*)\1',
    lambda match: f'{match.group(1)}/adm/{match.group(2)}{match.group(1)}',
    source,
)
source = source.replace("adm-pwa-", "adm-company-pwa-", 1)
write(service_worker, source)

# Direct browser navigations do not receive BrowserRouter's basename.
direct_replacements = {
    "src/modules/auth/components/AccessDenied.jsx": [
        ("window.location.assign(ROUTES.DASHBOARD);", 'window.location.assign(`/adm${ROUTES.DASHBOARD}`);'),
    ],
    "src/components/ui/ErrorPage.jsx": [
        ("window.location.assign(ROUTES.DASHBOARD);", 'window.location.assign(`/adm${ROUTES.DASHBOARD}`);'),
    ],
    "src/pages/PainelPublico/components/HeaderPainel.jsx": [
        ("window.location.assign(ROUTES.PAINEL_PUBLICO)", "window.location.assign(`/adm${ROUTES.PAINEL_PUBLICO}`)"),
        ("window.location.assign(ROUTES.PAINEL_AGENTES)", "window.location.assign(`/adm${ROUTES.PAINEL_AGENTES}`)"),
        ("window.location.assign(ROUTES.PAINEL_MAPA)", "window.location.assign(`/adm${ROUTES.PAINEL_MAPA}`)"),
        ("window.location.assign(ROUTES.PAINEL_MATCH)", "window.location.assign(`/adm${ROUTES.PAINEL_MATCH}`)"),
    ],
    "src/pages/PainelPublico/MatchPublicoPage.jsx": [
        ("window.location.assign(homeRoute)", "window.location.assign(`/adm${homeRoute}`)"),
        ("window.location.assign(`${ROUTES.PAINEL_MAPA}${suffix}`)", "window.location.assign(`/adm${ROUTES.PAINEL_MAPA}${suffix}`)"),
        ("window.location.assign(`${ROUTES.PAINEL_RELATORIOS}${suffix}`)", "window.location.assign(`/adm${ROUTES.PAINEL_RELATORIOS}${suffix}`)"),
    ],
    "src/modules/facilities/components/FacilitiesPage.jsx": [
        ("window.location.href = `${ROUTES.FACILITIES_IMOVEIS}/${encodeURIComponent(id)}`;", "window.location.href = `/adm${ROUTES.FACILITIES_IMOVEIS}/${encodeURIComponent(id)}`;"),
        ('href="/facilities/patrimonio-inventario"', 'href="/adm/facilities/patrimonio-inventario"'),
    ],
    "src/modules/auth/components/LoginForm.jsx": [
        ('`${window.location.origin}/login`', '`${window.location.origin}/adm/login`'),
    ],
}

for relative, replacements in direct_replacements.items():
    path = FRONTEND / relative
    source = read(path)
    for old, new in replacements:
        if old in source:
            source = source.replace(old, new)
    write(path, source)

# Namespace the most common origin-wide local/session storage keys so ADM data
# cannot collide with the Retiradas application on the same host.
for path in (FRONTEND / "src").rglob("*"):
    if path.suffix not in {".js", ".jsx"}:
        continue
    source = read(path)
    source = re.sub(
        r'((?:const|let)\s+[A-Z0-9_]*(?:STORAGE|CACHE|TOKEN)[A-Z0-9_]*KEY\s*=\s*["\'])(?!adm:)([^"\']+)',
        lambda match: f"{match.group(1)}adm:{match.group(2)}",
        source,
    )
    source = source.replace('getItem("theme")', 'getItem("adm:theme")')
    source = source.replace('setItem("theme",', 'setItem("adm:theme",')
    source = source.replace('"retiradas_okta_nonce"', '"adm:okta_nonce"')
    write(path, source)

for manifest in FRONTEND.joinpath("public").glob("*.webmanifest"):
    data = json.loads(read(manifest))
    for key in ("start_url", "scope"):
        value = str(data.get(key) or "/")
        if not value.startswith("/adm"):
            data[key] = "/adm" + (value if value.startswith("/") else f"/{value}")
    write(manifest, json.dumps(data, ensure_ascii=False, indent=2) + "\n")

# Cookies must be isolated from the Retiradas cookies on the shared domain.
for path in BACKEND.joinpath("src").rglob("*.js"):
    source = read(path)
    source = source.replace("retiradas_session", "adm_session")
    source = source.replace("retiradas_refresh", "adm_refresh")
    source = source.replace("retiradas_csrf", "adm_csrf")
    write(path, source)

backend_app = BACKEND / "src/app.js"
source = read(backend_app)
source = source.replace('"Path=/",', '"Path=/adm",', 1)
if '"https://retiradas.sempre.net.br",' not in source:
    source = source.replace(
        '"https://adm.retiradas.tech",',
        '"https://adm.retiradas.tech",\n\t\t\t"https://retiradas.sempre.net.br",',
        1,
    )
write(backend_app, source)

print("ADM sources prepared for /adm")
