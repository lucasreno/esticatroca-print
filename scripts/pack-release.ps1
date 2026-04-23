<#
.SYNOPSIS
  Empacota o esticatroca-print como zip portatil para Windows x64.

.DESCRIPTION
  Baixa Node.js portable e NSSM, instala as dependencias de producao
  (compilando o binding nativo uma vez na maquina de build), copia dist/
  e o boilerplate de release/, e gera um zip auto-contido que a loja
  instala com 1 duplo-clique em install.bat.

  Saida: dist-release\esticatroca-print-<versao>-win-x64.zip

.EXAMPLE
  # No diretorio esticatroca-print\
  pwsh -File scripts\pack-release.ps1

.NOTES
  Requisitos na maquina de build:
    - Windows x64
    - Node 20 LTS + npm no PATH (usado apenas durante o pack)
    - Visual Studio Build Tools (C++) para compilar @grandchef/node-printer
    - PowerShell 5.1+ (Compress-Archive, Expand-Archive)
    - Acesso a internet (download de nodejs.org e nssm.cc)
#>

[CmdletBinding()]
param(
  [string]$NodeVersion = '20.18.0',
  [string]$NssmVersion = '2.24',
  [switch]$SkipDownloadCache
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- Paths --------------------------------------------------------------
$repoRoot   = Resolve-Path (Join-Path $PSScriptRoot '..')
$releaseSrc = Join-Path $repoRoot 'release'
$outDir     = Join-Path $repoRoot 'dist-release'
$cacheDir   = Join-Path $outDir '.cache'
$stageDir   = Join-Path $outDir 'stage'

New-Item -ItemType Directory -Force -Path $outDir, $cacheDir | Out-Null

# --- Versao do app ------------------------------------------------------
$pkg = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$appVersion = $pkg.version
$zipName = "esticatroca-print-v$appVersion-win-x64.zip"
$zipPath = Join-Path $outDir $zipName

Write-Host "==> Empacotando esticatroca-print v$appVersion" -ForegroundColor Cyan

# --- Stage limpo --------------------------------------------------------
if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

# --- 1. Baixa Node portable --------------------------------------------
$nodeZipName = "node-v$NodeVersion-win-x64.zip"
$nodeUrl     = "https://nodejs.org/dist/v$NodeVersion/$nodeZipName"
$nodeZipPath = Join-Path $cacheDir $nodeZipName

if (-not (Test-Path $nodeZipPath) -or -not $SkipDownloadCache) {
  if (-not (Test-Path $nodeZipPath)) {
    Write-Host "==> Baixando Node $NodeVersion..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZipPath -UseBasicParsing
  } else {
    Write-Host "==> Usando Node em cache: $nodeZipPath" -ForegroundColor DarkGray
  }
}

Write-Host "==> Extraindo Node portable..." -ForegroundColor Cyan
$nodeExtractTmp = Join-Path $cacheDir 'node-extract'
if (Test-Path $nodeExtractTmp) { Remove-Item -Recurse -Force $nodeExtractTmp }
Expand-Archive -Path $nodeZipPath -DestinationPath $nodeExtractTmp -Force
$nodeSrc = Get-ChildItem -Directory $nodeExtractTmp | Select-Object -First 1
$nodeDst = Join-Path $stageDir 'node'
Copy-Item -Recurse -Force $nodeSrc.FullName $nodeDst

# --- 2. Baixa NSSM -----------------------------------------------------
$nssmZipName = "nssm-$NssmVersion.zip"
$nssmUrl     = "https://nssm.cc/release/$nssmZipName"
$nssmZipPath = Join-Path $cacheDir $nssmZipName

if (-not (Test-Path $nssmZipPath)) {
  Write-Host "==> Baixando NSSM $NssmVersion..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZipPath -UseBasicParsing
} else {
  Write-Host "==> Usando NSSM em cache" -ForegroundColor DarkGray
}

$nssmExtractTmp = Join-Path $cacheDir 'nssm-extract'
if (Test-Path $nssmExtractTmp) { Remove-Item -Recurse -Force $nssmExtractTmp }
Expand-Archive -Path $nssmZipPath -DestinationPath $nssmExtractTmp -Force
$nssmExe = Get-ChildItem -Recurse -Path $nssmExtractTmp -Filter 'nssm.exe' |
  Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
if (-not $nssmExe) { throw 'nssm.exe win64 nao encontrado no zip baixado.' }
Copy-Item -Force $nssmExe.FullName (Join-Path $stageDir 'nssm.exe')

# --- 3. Build TypeScript -----------------------------------------------
Write-Host "==> Compilando TypeScript (npm run build)..." -ForegroundColor Cyan
Push-Location $repoRoot
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build falhou (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}

# --- 4. Instala dependencias de producao no stage ----------------------
Write-Host "==> Instalando dependencias de producao no stage..." -ForegroundColor Cyan
Copy-Item (Join-Path $repoRoot 'package.json')      (Join-Path $stageDir 'package.json')
Copy-Item (Join-Path $repoRoot 'package-lock.json') (Join-Path $stageDir 'package-lock.json') -ErrorAction SilentlyContinue

Push-Location $stageDir
try {
  npm ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci no stage falhou (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}

# --- 5. Copia dist/, web/, release boilerplate -------------------------
Write-Host "==> Copiando artefatos..." -ForegroundColor Cyan
Copy-Item -Recurse -Force (Join-Path $repoRoot 'dist') (Join-Path $stageDir 'dist')
Copy-Item -Recurse -Force (Join-Path $repoRoot 'web')  (Join-Path $stageDir 'web')

# data/: apenas o exemplo (nunca distribuir data.json de dev)
$dataDst = Join-Path $stageDir 'data'
New-Item -ItemType Directory -Force -Path $dataDst | Out-Null
$dataExample = Join-Path $repoRoot 'data\data.example.json'
if (Test-Path $dataExample) {
  Copy-Item $dataExample (Join-Path $dataDst 'data.example.json')
}

# logos/ e img/: pastas vazias (o usuario coloca os arquivos dele)
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir 'logos') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir 'img')   | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir 'logs')  | Out-Null

# .bat e README.txt
Copy-Item -Force (Join-Path $releaseSrc 'install.bat')   (Join-Path $stageDir 'install.bat')
Copy-Item -Force (Join-Path $releaseSrc 'uninstall.bat') (Join-Path $stageDir 'uninstall.bat')
Copy-Item -Force (Join-Path $releaseSrc 'update.bat')    (Join-Path $stageDir 'update.bat')
Copy-Item -Force (Join-Path $releaseSrc 'README.txt')    (Join-Path $stageDir 'README.txt')

# build-info.json para rastreabilidade
$buildInfo = [ordered]@{
  app_version  = $appVersion
  node_version = $NodeVersion
  nssm_version = $NssmVersion
  built_at     = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
  built_host   = $env:COMPUTERNAME
}
$buildInfo | ConvertTo-Json -Depth 4 |
  Set-Content -Path (Join-Path $stageDir 'build-info.json') -Encoding utf8

# --- 6. Gera zip -------------------------------------------------------
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Write-Host "==> Gerando zip $zipName..." -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host ""
Write-Host "==> Pacote gerado: $zipPath  ($sizeMb MB)" -ForegroundColor Green
Write-Host "    Extraia em  C:\esticatroca-print\  e rode install.bat como administrador." -ForegroundColor Green
