# ============================================
# Discord DJ Bot - Arranque Completo
# ============================================
# Este script inicia el servidor y el tunel de Cloudflare

$Host.UI.RawUI.WindowTitle = "Discord DJ Bot"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    Discord DJ Bot - Iniciando...      " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Directorio del proyecto
$projectDir = $PSScriptRoot
Set-Location $projectDir

# Verificar que Node.js esta instalado
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js no esta instalado" -ForegroundColor Red
    Write-Host "Instala Node.js desde https://nodejs.org" -ForegroundColor Yellow
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Verificar que cloudflared esta instalado
$cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
    # Intentar en otra ubicacion comun
    $cloudflaredPath = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
    if (-not $cloudflaredPath) {
        Write-Host "[ERROR] Cloudflared no esta instalado" -ForegroundColor Red
        Write-Host "Ejecuta: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
        Read-Host "Presiona Enter para salir"
        exit 1
    }
}

Write-Host "[OK] Node.js encontrado" -ForegroundColor Green
Write-Host "[OK] Cloudflared encontrado: $cloudflaredPath" -ForegroundColor Green
Write-Host ""

# Iniciar servidor Node.js en segundo plano
Write-Host "[1/2] Iniciando servidor Node.js..." -ForegroundColor Yellow
$serverJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    node server.js 2>&1
} -ArgumentList $projectDir

# Esperar a que el servidor inicie
Start-Sleep -Seconds 3

# Verificar que el servidor esta corriendo
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/status" -UseBasicParsing -TimeoutSec 5
    Write-Host "[OK] Servidor iniciado en http://localhost:3000" -ForegroundColor Green
} catch {
    Write-Host "[WARN] El servidor puede tardar en iniciar..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[2/2] Iniciando tunel de Cloudflare..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  COPIA LA URL QUE APARECE ABAJO       " -ForegroundColor White
Write-Host "  (la que termina en .trycloudflare.com)" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ejecutar cloudflared en primer plano para ver la URL
# Cuando el usuario cierre, se detiene todo
try {
    & $cloudflaredPath tunnel --url http://localhost:3000
} finally {
    # Limpiar al cerrar
    Write-Host ""
    Write-Host "Deteniendo servicios..." -ForegroundColor Yellow
    Stop-Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob -ErrorAction SilentlyContinue
    Write-Host "[OK] Servidor detenido" -ForegroundColor Green
}
