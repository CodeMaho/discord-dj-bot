# ============================================
# BUILD-EXE.ps1
# Compila DiscordDJ.ps1 -> DiscordDJ.exe
# Ejecutar UNA vez para generar el ejecutable.
# ============================================

$Host.UI.RawUI.WindowTitle = "Discord DJ Bot - Build"
$scriptDir = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   Discord DJ Bot - Generando .exe     " -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# ============================================
# 1. INSTALAR PS2EXE SI NO ESTA
# ============================================

Write-Host "[1/3] Verificando ps2exe..." -ForegroundColor Cyan

if (-not (Get-Module -ListAvailable -Name ps2exe)) {
    Write-Host "       Instalando modulo ps2exe desde PSGallery..." -ForegroundColor Yellow
    Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
    if (-not (Get-Module -ListAvailable -Name ps2exe)) {
        Write-Host "  [X] No se pudo instalar ps2exe." -ForegroundColor Red
        Write-Host "       Ejecuta manualmente: Install-Module ps2exe -Scope CurrentUser" -ForegroundColor White
        Read-Host "`nPresiona Enter para salir"
        exit 1
    }
}

Import-Module ps2exe -Force
Write-Host "  [OK] ps2exe disponible" -ForegroundColor Green

# ============================================
# 2. VERIFICAR QUE EXISTE EL FUENTE
# ============================================

Write-Host "[2/3] Verificando fuente..." -ForegroundColor Cyan

$inputFile  = "$scriptDir\DiscordDJ.ps1"
$outputFile = "$scriptDir\DiscordDJ.exe"

if (-not (Test-Path $inputFile)) {
    Write-Host "  [X] No se encontro DiscordDJ.ps1 en $scriptDir" -ForegroundColor Red
    Read-Host "`nPresiona Enter para salir"
    exit 1
}

Write-Host "  [OK] Fuente: $inputFile" -ForegroundColor Green

# ============================================
# 3. COMPILAR
# ============================================

Write-Host "[3/3] Compilando..." -ForegroundColor Cyan
Write-Host ""

Invoke-PS2EXE `
    -InputFile  $inputFile `
    -OutputFile $outputFile `
    -Title      "Discord DJ Bot" `
    -Description "Discord DJ Bot - Install + Start" `
    -Company    "DJ Bot" `
    -Version    "1.0.0" `
    -RequireAdmin `
    -NoConsole:$false

# ============================================
# RESULTADO
# ============================================

Write-Host ""
if (Test-Path $outputFile) {
    $size = [math]::Round((Get-Item $outputFile).Length / 1KB, 1)
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD COMPLETADO                     " -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Ejecutable: $outputFile" -ForegroundColor White
    Write-Host "  Tamaño:     $size KB"    -ForegroundColor White
    Write-Host ""
    Write-Host "  Haz doble clic en DiscordDJ.exe para usar el bot." -ForegroundColor Cyan
    Write-Host "  (Pedira permisos de administrador la primera vez)" -ForegroundColor Gray
} else {
    Write-Host "  [X] El build fallo. Revisa los errores de arriba." -ForegroundColor Red
}

Write-Host ""
Read-Host "Presiona Enter para salir"
