# ============================================
# Discord DJ Bot - Arranque Completo
# ============================================

$Host.UI.RawUI.WindowTitle = "Discord DJ Bot"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    Discord DJ Bot - Iniciando...      " -ForegroundColor Cyan
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
Write-Host "[1/5] Verificando Node.js... " -NoNewline
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "NO ENCONTRADO" -ForegroundColor Red
    $hasErrors = $true
}

# MPV
Write-Host "[2/5] Verificando MPV... " -NoNewline
if (Get-Command mpv -ErrorAction SilentlyContinue) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "NO ENCONTRADO" -ForegroundColor Red
    $hasErrors = $true
}

# yt-dlp
Write-Host "[3/5] Verificando yt-dlp... " -NoNewline
if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "NO ENCONTRADO" -ForegroundColor Red
    $hasErrors = $true
}

# Cloudflared
Write-Host "[4/5] Verificando Cloudflared... " -NoNewline
$cloudflaredPath = $null
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    $cloudflaredPath = (Get-Command cloudflared).Source
    Write-Host "OK" -ForegroundColor Green
} elseif (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
    $cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
    Write-Host "OK" -ForegroundColor Green
} elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
    $cloudflaredPath = "C:\Program Files\cloudflared\cloudflared.exe"
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "NO ENCONTRADO" -ForegroundColor Red
    $hasErrors = $true
}

# node_modules
Write-Host "[5/5] Verificando dependencias npm... " -NoNewline
if (Test-Path "$projectDir\node_modules") {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "NO ENCONTRADO" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Instalando dependencias npm..." -ForegroundColor Yellow
    npm install
    if (Test-Path "$projectDir\node_modules") {
        Write-Host "Dependencias instaladas" -ForegroundColor Green
    } else {
        Write-Host "Error instalando dependencias" -ForegroundColor Red
        $hasErrors = $true
    }
}

# Si hay errores, sugerir ejecutar INSTALL.bat
if ($hasErrors) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  FALTAN DEPENDENCIAS                  " -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Ejecuta INSTALL.bat primero para instalar" -ForegroundColor Yellow
    Write-Host "todo lo necesario automaticamente." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "Todas las dependencias OK" -ForegroundColor Green
Write-Host ""

# ============================================
# INICIAR SERVIDOR
# ============================================

Write-Host "[Servidor] Iniciando Node.js..." -ForegroundColor Yellow
$serverJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    node server.js 2>&1
} -ArgumentList $projectDir

# Esperar a que el servidor inicie
Write-Host "[Servidor] Esperando inicio..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Verificar que el servidor esta corriendo
$serverOK = $false
for ($i = 0; $i -lt 5; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/api/status" -UseBasicParsing -TimeoutSec 2
        $serverOK = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}

if ($serverOK) {
    Write-Host "[Servidor] Iniciado en http://localhost:3000" -ForegroundColor Green
} else {
    Write-Host "[Servidor] Puede tardar unos segundos mas..." -ForegroundColor Yellow
}

# ============================================
# INICIAR TUNEL
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  INICIANDO TUNEL DE CLOUDFLARE        " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Busca la linea que dice:" -ForegroundColor White
Write-Host ""
Write-Host '  "Your quick Tunnel has been created!"' -ForegroundColor Yellow
Write-Host ""
Write-Host "Y copia la URL (termina en .trycloudflare.com)" -ForegroundColor White
Write-Host ""
Write-Host "Luego:" -ForegroundColor Gray
Write-Host "  1. Abre tu web (ej: dj.mingod.es)" -ForegroundColor Gray
Write-Host "  2. Click en el boton de configuracion" -ForegroundColor Gray
Write-Host "  3. Pega la URL del tunel" -ForegroundColor Gray
Write-Host "  4. Guarda" -ForegroundColor Gray
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray

try {
    & $cloudflaredPath tunnel --url http://localhost:3000
} finally {
    Write-Host ""
    Write-Host "Deteniendo servidor..." -ForegroundColor Yellow
    Stop-Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob -ErrorAction SilentlyContinue
    Write-Host "Servidor detenido" -ForegroundColor Green
}
