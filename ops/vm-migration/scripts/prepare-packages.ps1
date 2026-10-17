param(
	[ValidateSet("all", "retiradas", "operacao")]
	[string]$App = "all",
	[string]$OutDir = "dist-vm-migration",
	[string]$RetiradasApiBaseUrl = "https://retiradas.tech/api"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $root

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Invoke-Step($Name, [scriptblock]$Block) {
	Write-Host "==> $Name" -ForegroundColor Cyan
	& $Block
}

if ($App -eq "all" -or $App -eq "retiradas") {
	Invoke-Step "Instalando dependencias frontend Retiradas" { npm ci }
	Invoke-Step "Instalando dependencias backend Retiradas" { npm ci --prefix apps/retiradas/backend }
	Invoke-Step "Build Retiradas" {
		$env:VITE_APP_ENV_LABEL = "Producao"
		$env:VITE_API_BASE_URL = $RetiradasApiBaseUrl.TrimEnd("/")
		$env:VITE_APP_VERSION = (git rev-parse --short HEAD)
		npm run build:retiradas
	}
	Invoke-Step "Empacotando Retiradas frontend" {
		tar -czf (Join-Path $OutDir "retiradas-dist.tar.gz") -C dist .
	}
	Invoke-Step "Empacotando Retiradas backend" {
		tar --exclude=node_modules --exclude=uploads --exclude=.env --exclude=*.log -czf (Join-Path $OutDir "retiradas-backend.tar.gz") -C apps/retiradas/backend .
	}
}

if ($App -eq "all" -or $App -eq "operacao") {
	Invoke-Step "Instalando dependencias frontend Operacao" { npm ci --prefix apps/operacao/frontend }
	Invoke-Step "Instalando dependencias backend Operacao" { npm ci --prefix apps/operacao/backend }
	Invoke-Step "Build Operacao" {
		$env:VITE_APP_ENV_LABEL = "Producao"
		$env:VITE_APP_VERSION = (git rev-parse --short HEAD)
		npm run build:operacao
	}
	Invoke-Step "Empacotando Operacao app" {
		tar --exclude=node_modules --exclude=.env --exclude=*.log --exclude=backend/uploads --exclude=backend/logs -czf (Join-Path $OutDir "operacao-app.tar.gz") -C apps operacao
	}
}

Write-Host ""
Write-Host "Pacotes prontos em $OutDir" -ForegroundColor Green

