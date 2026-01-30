# Discord DJ Bot - Iniciar Servidor

Clear-Host
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Discord DJ Web Controller - Iniciando..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Agregar MPV local al PATH
$mpvPath = Join-Path $PSScriptRoot "mpv-x86_64-20260128-git-d79172a"
if (Test-Path (Join-Path $mpvPath "mpv.exe")) {
    $env:Path = "$mpvPath;$env:Path"
    Write-Host "[OK] MPV agregado al PATH" -ForegroundColor Green
} else {
    Write-Host "[!] Advertencia: MPV local no encontrado" -ForegroundColor Yellow
}

# Verificar Node.js
Write-Host ""
Write-Host "[1/3] Verificando Node.js..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version 2>&1
    Write-Host "[OK] Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js no instalado" -ForegroundColor Red
    pause
    exit 1
}

# Verificar MPV
Write-Host ""
Write-Host "[2/3] Verificando MPV..." -ForegroundColor Cyan
try {
    $mpvVersion = mpv --version 2>&1 | Select-Object -First 1
    Write-Host "[OK] MPV: $mpvVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] MPV no disponible" -ForegroundColor Red
}

# Instalar dependencias si no existen
Write-Host ""
Write-Host "[3/3] Verificando dependencias..." -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando paquetes npm..." -ForegroundColor Yellow
    npm install
}
Write-Host "[OK] Dependencias listas" -ForegroundColor Green

# Iniciar servidor
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Servidor iniciando en:" -ForegroundColor Green
Write-Host "  http://localhost:3000" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

node server.js
