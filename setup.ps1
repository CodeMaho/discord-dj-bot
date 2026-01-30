# ============================================================
# Discord DJ Bot - Script de Configuración
# ============================================================

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🎵 Discord DJ Bot - Verificación de Dependencias   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolsDir = "C:\Temp\discord-dj-tools"

# ============================================================
# 1. Verificar Node.js
# ============================================================
Write-Host "1️⃣  Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "   ✓ Node.js instalado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Node.js NO está instalado" -ForegroundColor Red
    Write-Host "   Descarga desde: https://nodejs.org/" -ForegroundColor Cyan
}

# ============================================================
# 2. Verificar npm
# ============================================================
Write-Host "`n2️⃣  Verificando npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "   ✓ npm instalado: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "   ✗ npm NO está instalado" -ForegroundColor Red
}

# ============================================================
# 3. Instalar dependencias Node.js si no existen
# ============================================================
Write-Host "`n3️⃣  Verificando dependencias de Node.js..." -ForegroundColor Yellow
if (!(Test-Path "$scriptDir\node_modules")) {
    Write-Host "   Instalando paquetes npm..." -ForegroundColor Cyan
    Push-Location $scriptDir
    npm install
    Pop-Location
    Write-Host "   ✓ Dependencias instaladas" -ForegroundColor Green
} else {
    Write-Host "   ✓ node_modules ya existen" -ForegroundColor Green
}

# ============================================================
# 4. Verificar yt-dlp
# ============================================================
Write-Host "`n4️⃣  Verificando yt-dlp..." -ForegroundColor Yellow
try {
    $ytdlpVersion = yt-dlp --version 2>$null
    Write-Host "   ✓ yt-dlp instalado: $ytdlpVersion" -ForegroundColor Green
} catch {
    Write-Host "   ✗ yt-dlp NO encontrado en PATH" -ForegroundColor Red
    
    # Intentar desde la carpeta temporal
    $ytdlpPath = "$toolsDir\yt-dlp.exe"
    if (Test-Path $ytdlpPath) {
        Write-Host "   ℹ️  yt-dlp encontrado en: $ytdlpPath" -ForegroundColor Yellow
        Write-Host "   Agregando al PATH..." -ForegroundColor Cyan
        
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($userPath -notlike "*$toolsDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$userPath;$toolsDir", "User")
            Write-Host "   ✓ PATH actualizado (requiere reiniciar terminal)" -ForegroundColor Green
        }
    } else {
        Write-Host "   Descargando yt-dlp..." -ForegroundColor Cyan
        
        if (!(Test-Path $toolsDir)) {
            New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
        }
        
        $ytdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        try {
            Invoke-WebRequest -Uri $ytdlpUrl -OutFile $ytdlpPath -ErrorAction Stop
            Write-Host "   ✓ yt-dlp descargado en: $ytdlpPath" -ForegroundColor Green
            
            # Agregar al PATH
            $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
            if ($userPath -notlike "*$toolsDir*") {
                [Environment]::SetEnvironmentVariable("Path", "$userPath;$toolsDir", "User")
                Write-Host "   ✓ Agregado al PATH" -ForegroundColor Green
            }
        } catch {
            Write-Host "   ✗ Error descargando yt-dlp: $_" -ForegroundColor Red
        }
    }
}

# ============================================================
# 5. Verificar MPV
# ============================================================
Write-Host "`n5️⃣  Verificando MPV..." -ForegroundColor Yellow
try {
    $mpvVersion = mpv --version 2>$null | Select-Object -First 1
    Write-Host "   ✓ MPV instalado" -ForegroundColor Green
} catch {
    Write-Host "   ✗ MPV NO está instalado en el PATH" -ForegroundColor Red
    Write-Host "   " -ForegroundColor Yellow
    Write-Host "   Elige una opción:" -ForegroundColor Yellow
    Write-Host "   A) Descarga el instalador desde: https://mpv.io/" -ForegroundColor Cyan
    Write-Host "   B) O desde: https://github.com/zhongfly/mpv-winbuild/releases" -ForegroundColor Cyan
    Write-Host "   " -ForegroundColor Yellow
    Write-Host "   ⚠️  IMPORTANTE: Agrega MPV al PATH del sistema durante la instalación" -ForegroundColor Yellow
}

# ============================================================
# 6. Verificar Virtual Audio Cable
# ============================================================
Write-Host "`n6️⃣  Verificando Virtual Audio Cable..." -ForegroundColor Yellow

# Buscar dispositivos de audio CABLE
$cableFound = $false
try {
    # Intentar ejecutar mpv para listar dispositivos
    $devices = & mpv --audio-device=help 2>&1 | Select-String "cable" -ErrorAction SilentlyContinue
    if ($devices) {
        Write-Host "   ✓ Virtual Audio Cable detectado" -ForegroundColor Green
        $cableFound = $true
    }
} catch {
    # Si no encuentra mpv, no podemos verificar
    $cableFound = $null
}

if ($cableFound -eq $false) {
    Write-Host "   ✗ Virtual Audio Cable NO detectado" -ForegroundColor Red
    Write-Host "   Descarga desde: https://vb-audio.com/Cable/" -ForegroundColor Cyan
    Write-Host "   Luego reinicia tu PC" -ForegroundColor Yellow
} elseif ($cableFound -eq $null) {
    Write-Host "   ℹ️  No se pudo verificar (MPV no disponible)" -ForegroundColor Yellow
}

# ============================================================
# 7. Resumen
# ============================================================
Write-Host "`n" -ForegroundColor Cyan
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           📋 RESUMEN DE CONFIGURACIÓN               ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Si falta alguna dependencia, instálala siguiendo las instrucciones arriba" -ForegroundColor White
Write-Host "2. Abre una NUEVA terminal (para que cargue el PATH actualizado)" -ForegroundColor White
Write-Host "3. Navega a la carpeta del proyecto:" -ForegroundColor White
Write-Host "   cd $scriptDir" -ForegroundColor Cyan
Write-Host "4. Inicia el servidor:" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor Cyan
Write-Host "5. Abre en tu navegador: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "¿Necesitas ayuda? Revisa README.md o TROUBLESHOOTING.md" -ForegroundColor Yellow
