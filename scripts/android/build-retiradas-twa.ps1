param(
	[string]$KeystorePath = "$env:USERPROFILE\.codex\secrets\retiradas-android\retiradas-release-v2.jks",
	[string]$PasswordFile = "$env:USERPROFILE\.codex\secrets\retiradas-android\keystore-password-v2.txt",
	[string]$OutputDirectory = "artifacts\android\retiradas"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$projectDirectory = Join-Path $repositoryRoot "apps\retiradas\android-twa"
$manifestPath = Join-Path $projectDirectory "twa-manifest.json"
$outputPath = Join-Path $repositoryRoot $OutputDirectory

if (-not (Test-Path -LiteralPath $KeystorePath -PathType Leaf)) {
	throw "Keystore nao encontrado: $KeystorePath"
}
if (-not (Test-Path -LiteralPath $PasswordFile -PathType Leaf)) {
	throw "Arquivo de senha nao encontrado: $PasswordFile"
}

$password = [IO.File]::ReadAllText($PasswordFile).Trim()
if ($password.Length -lt 6) {
	throw "A senha do keystore e invalida."
}

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$versionName = [string]$manifest.appVersionName
$env:RETIRADAS_ANDROID_KEYSTORE_PATH = (Resolve-Path -LiteralPath $KeystorePath).Path
$env:RETIRADAS_ANDROID_KEYSTORE_PASSWORD = $password
$env:RETIRADAS_ANDROID_KEY_ALIAS = "retiradas-release"
$env:RETIRADAS_ANDROID_KEY_PASSWORD = $password
$env:ANDROID_HOME = "$env:USERPROFILE\.bubblewrap\android_sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

Push-Location $projectDirectory
try {
	& .\gradlew.bat clean assembleRelease bundleRelease
	if ($LASTEXITCODE -ne 0) {
		throw "Gradle build falhou com codigo $LASTEXITCODE."
	}

	Copy-Item -LiteralPath "app\build\outputs\apk\release\app-release.apk" -Destination (Join-Path $outputPath "retiradas-v$versionName-release.apk") -Force
	Copy-Item -LiteralPath "app\build\outputs\bundle\release\app-release.aab" -Destination (Join-Path $outputPath "retiradas-v$versionName-release.aab") -Force
} finally {
	Pop-Location
	Remove-Item Env:RETIRADAS_ANDROID_KEYSTORE_PATH -ErrorAction SilentlyContinue
	Remove-Item Env:RETIRADAS_ANDROID_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
	Remove-Item Env:RETIRADAS_ANDROID_KEY_ALIAS -ErrorAction SilentlyContinue
	Remove-Item Env:RETIRADAS_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
	Remove-Item Env:ANDROID_HOME -ErrorAction SilentlyContinue
	Remove-Item Env:ANDROID_SDK_ROOT -ErrorAction SilentlyContinue
}

Get-FileHash -Algorithm SHA256 (Join-Path $outputPath "retiradas-v$versionName-release.apk"), (Join-Path $outputPath "retiradas-v$versionName-release.aab") |
	Format-Table Path, Hash -AutoSize
