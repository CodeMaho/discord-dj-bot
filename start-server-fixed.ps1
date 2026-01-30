# ============================================================
# Discord DJ Bot - Iniciar Servidor (con MPV local)
# ============================================================

Clear-Host
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🎵 Discord DJ Web Controller - Iniciando...        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Agregar MPV local al PATH
$mpvPath = Join-Path $PSScriptRoot "mpv-x86_64-20260128-git-d79172a"
if (Test-Path (Join-Path $mpvPath "mpv.exe")) {
    $env:Path = "$mpvPath;$env:Path"
    Write-Host "[✓] MPV agregado al PATH" -ForegroundColor Green
} else {
    Write-Host "[!] Advertencia: MPV local no encontrado" -ForegroundColor Yellow
}

# Verificar Node.js
Write-Host ""
Write-Host "[1/4] Verificando Node.js..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version 2>&1
    Write-Host "[✓] Node.js encontrado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[✗] Node.js no está instalado" -ForegroundColor Red
    Write-Host "    Descarga desde: https://nodejs.org/" -ForegroundColor Yellow
    pause
    exit 1
}

# Verificar npm
Write-Host ""
Write-Host "[2/4] Verificando npm..." -ForegroundColor Cyan
try {
    $npmVersion = npm --version 2>&1
    Write-Host "[✓] npm encontrado: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "[✗] npm no está instalado" -ForegroundColor Red
    pause
    exit 1
}

# Verificar MPV
Write-Host ""
Write-Host "[3/4] Verificando MPV..." -ForegroundColor Cyan
try {
    $mpvVersion = mpv --version 2>&1 | Select-Object -First 1
    Write-Host "[✓] MPV encontrado: $mpvVersion" -ForegroundColor Green
} catch {
    Write-Host "[✗] MPV no está disponible" -ForegroundColor Red
    Write-Host "    El servidor puede no funcionar correctamente" -ForegroundColor Yellow
}

# Instalar dependencias si no existen
Write-Host ""
Write-Host "[4/4] Verificando dependencias..." -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando paquetes npm..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[✗] Error instalando dependencias" -ForegroundColor Red
        pause
        exit 1
    }
}
Write-Host "[✓] Dependencias listas" -ForegroundColor Green

# Mostrar información de conexión
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║     🎵 Discord DJ Web Controller - Servidor OK      ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║                                                      ║" -ForegroundColor Green
Write-Host "║  Servidor HTTP:     http://localhost:3000           ║" -ForegroundColor White
Write-Host "║  WebSocket:         ws://localhost:3001             ║" -ForegroundColor White
Write-Host "║                                                      ║" -ForegroundColor Green
Write-Host "║  Panel de Control:  http://localhost:3000           ║" -ForegroundColor Yellow
Write-Host "║                                                      ║" -ForegroundColor Green
Write-Host "║  Presiona CTRL+C para detener el servidor           ║" -ForegroundColor Cyan
Write-Host "║                                                      ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Iniciar el servidor
node server.js
