# ============================================
# Discord DJ Bot - Arranque
# ============================================

$Host.UI.RawUI.WindowTitle = "Discord DJ Bot"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    Discord DJ Bot - Verificando...    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Directorio del proyecto
$projectDir = $PSScriptRoot
Set-Location $projectDir

$hasErrors = $false

# ============================================
# VERIFICACIONES
# ============================================

# Node.js
Write-Host "[1/4] Node.js... " -NoNewline
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "NO ENCONTRADO" -ForegroundColor Red
    $hasErrors = $true
}

# MPV
Write-Host "[2/4] MPV... " -NoNewline
if (Get-Command mpv -ErrorAction SilentlyContinue) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "NO ENCONTRADO" -ForegroundColor Red
    $hasErrors = $true
}

# yt-dlp
Write-Host "[3/4] yt-dlp... " -NoNewline
if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "NO ENCONTRADO" -ForegroundColor Red
    $hasErrors = $true
}

# Cloudflared
Write-Host "[4/4] Cloudflared... " -NoNewline
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    Write-Host "OK" -ForegroundColor Green
} elseif (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
    Write-Host "OK" -ForegroundColor Green
} elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "NO ENCONTRADO" -ForegroundColor Red
    $hasErrors = $true
}

# node_modules
if (-not (Test-Path "$projectDir\node_modules")) {
    Write-Host ""
    Write-Host "Instalando dependencias npm..." -ForegroundColor Yellow
    npm install
}

# Si hay errores, sugerir ejecutar INSTALL.bat
if ($hasErrors) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  FALTAN DEPENDENCIAS                  " -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Ejecuta INSTALL.bat para instalar todo" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  TODO OK - Iniciando servidor...      " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# ============================================
# INICIAR SERVIDOR (incluye cloudflared)
# ============================================

# El servidor ahora maneja:
# - Seleccion de dispositivo de audio
# - Inicio de cloudflared
# - Todo automaticamente

node server.js
