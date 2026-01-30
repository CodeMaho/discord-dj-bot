# ============================================
# Discord DJ Bot - Instalador Completo
# ============================================
# Este script instala todas las dependencias necesarias

$Host.UI.RawUI.WindowTitle = "Discord DJ Bot - Instalador"

# Colores
function Write-Step { param($msg) Write-Host "`n[$script:step] $msg" -ForegroundColor Cyan; $script:step++ }
function Write-OK { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "    [X] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "    $msg" -ForegroundColor White }

$script:step = 1
$projectDir = $PSScriptRoot

Clear-Host
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   DISCORD DJ BOT - INSTALADOR        " -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "Este script instalara todo lo necesario:" -ForegroundColor White
Write-Host "  - Node.js (servidor)" -ForegroundColor Gray
Write-Host "  - MPV (reproductor de audio)" -ForegroundColor Gray
Write-Host "  - yt-dlp (extractor de YouTube)" -ForegroundColor Gray
Write-Host "  - Cloudflared (tunel para acceso remoto)" -ForegroundColor Gray
Write-Host "  - VB-Audio Virtual Cable (audio virtual)" -ForegroundColor Gray
Write-Host "  - Dependencias npm" -ForegroundColor Gray
Write-Host ""
Write-Host "Presiona ENTER para continuar o CTRL+C para cancelar..." -ForegroundColor Yellow
Read-Host

# ============================================
# 1. VERIFICAR WINGET
# ============================================
Write-Step "Verificando winget (gestor de paquetes de Windows)..."

if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-OK "winget disponible"
} else {
    Write-Err "winget no encontrado"
    Write-Info "winget viene preinstalado en Windows 10/11"
    Write-Info "Si no lo tienes, instalalo desde Microsoft Store: 'App Installer'"
    Read-Host "Presiona Enter para salir"
    exit 1
}

# ============================================
# 2. NODE.JS
# ============================================
Write-Step "Verificando Node.js..."

if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-OK "Node.js instalado: $nodeVersion"
} else {
    Write-Warn "Node.js no encontrado. Instalando..."
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements

    # Actualizar PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-OK "Node.js instalado correctamente"
    } else {
        Write-Err "Error instalando Node.js. Intenta reiniciar el script."
    }
}

# ============================================
# 3. MPV
# ============================================
Write-Step "Verificando MPV (reproductor multimedia)..."

$mpvPaths = @(
    "mpv",
    "$projectDir\mpv.exe",
    "$projectDir\mpv-x86_64-*\mpv.exe",
    "C:\Program Files\mpv\mpv.exe",
    "C:\mpv\mpv.exe"
)

$mpvFound = $false
foreach ($path in $mpvPaths) {
    $resolved = Resolve-Path $path -ErrorAction SilentlyContinue
    if ($resolved) {
        $mpvFound = $true
        Write-OK "MPV encontrado: $resolved"
        break
    }
}

if (-not $mpvFound) {
    if (Get-Command mpv -ErrorAction SilentlyContinue) {
        $mpvFound = $true
        Write-OK "MPV encontrado en PATH"
    }
}

if (-not $mpvFound) {
    Write-Warn "MPV no encontrado. Instalando..."
    winget install mpv.net --accept-source-agreements --accept-package-agreements

    # Actualizar PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    if (Get-Command mpv -ErrorAction SilentlyContinue) {
        Write-OK "MPV instalado correctamente"
    } else {
        Write-Warn "MPV instalado pero puede requerir reiniciar la terminal"
    }
}

# ============================================
# 4. YT-DLP
# ============================================
Write-Step "Verificando yt-dlp (extractor de YouTube)..."

if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
    $ytdlpVersion = yt-dlp --version
    Write-OK "yt-dlp instalado: $ytdlpVersion"
} else {
    Write-Warn "yt-dlp no encontrado. Instalando..."
    winget install yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements

    # Actualizar PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
        Write-OK "yt-dlp instalado correctamente"
    } else {
        Write-Warn "yt-dlp instalado pero puede requerir reiniciar la terminal"
    }
}

# ============================================
# 5. CLOUDFLARED
# ============================================
Write-Step "Verificando Cloudflared (tunel de acceso remoto)..."

$cloudflaredPaths = @(
    "cloudflared",
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe"
)

$cloudflaredFound = $false
$cloudflaredPath = ""

foreach ($path in $cloudflaredPaths) {
    if ($path -eq "cloudflared") {
        if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
            $cloudflaredFound = $true
            $cloudflaredPath = (Get-Command cloudflared).Source
            break
        }
    } elseif (Test-Path $path) {
        $cloudflaredFound = $true
        $cloudflaredPath = $path
        break
    }
}

if ($cloudflaredFound) {
    Write-OK "Cloudflared encontrado: $cloudflaredPath"
} else {
    Write-Warn "Cloudflared no encontrado. Instalando..."
    winget install Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements

    # Actualizar PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Write-OK "Cloudflared instalado"
}

# ============================================
# 6. VB-AUDIO VIRTUAL CABLE
# ============================================
Write-Step "Verificando VB-Audio Virtual Cable..."

# Buscar si CABLE Input existe como dispositivo de audio
$cableInstalled = $false
try {
    $audioDevices = Get-WmiObject Win32_SoundDevice | Select-Object -ExpandProperty Name
    if ($audioDevices -match "CABLE|VB-Audio") {
        $cableInstalled = $true
    }
} catch {}

# Alternativa: buscar en registro
if (-not $cableInstalled) {
    $regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture"
    if (Test-Path $regPath) {
        $devices = Get-ChildItem $regPath -ErrorAction SilentlyContinue
        foreach ($device in $devices) {
            $props = Get-ItemProperty "$($device.PSPath)\Properties" -ErrorAction SilentlyContinue
            if ($props -and $props.PSObject.Properties.Value -match "CABLE") {
                $cableInstalled = $true
                break
            }
        }
    }
}

if ($cableInstalled) {
    Write-OK "VB-Audio Virtual Cable instalado"
} else {
    Write-Warn "VB-Audio Virtual Cable NO detectado"
    Write-Info ""
    Write-Info "VB-Cable es necesario para enviar audio a Discord."
    Write-Info "Debe instalarse manualmente:"
    Write-Info ""
    Write-Host "    1. Descarga desde: " -NoNewline -ForegroundColor White
    Write-Host "https://vb-audio.com/Cable/" -ForegroundColor Cyan
    Write-Info "    2. Extrae el ZIP"
    Write-Info "    3. Ejecuta VBCABLE_Setup_x64.exe como Administrador"
    Write-Info "    4. Reinicia el PC"
    Write-Info ""

    $openBrowser = Read-Host "Quieres abrir la pagina de descarga ahora? (S/N)"
    if ($openBrowser -eq "S" -or $openBrowser -eq "s") {
        Start-Process "https://vb-audio.com/Cable/"
    }
}

# ============================================
# 7. DEPENDENCIAS NPM
# ============================================
Write-Step "Verificando dependencias npm..."

Set-Location $projectDir

if (Test-Path "node_modules") {
    Write-OK "node_modules existe"
} else {
    Write-Warn "node_modules no encontrado. Instalando dependencias..."

    if (Get-Command npm -ErrorAction SilentlyContinue) {
        npm install
        if (Test-Path "node_modules") {
            Write-OK "Dependencias instaladas correctamente"
        } else {
            Write-Err "Error instalando dependencias"
        }
    } else {
        Write-Err "npm no disponible. Reinicia la terminal e intenta de nuevo."
    }
}

# ============================================
# RESUMEN FINAL
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "        INSTALACION COMPLETADA         " -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# Verificacion final
$allOK = $true
$summary = @()

# Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
    $summary += @{Name="Node.js"; Status="OK"; Color="Green"}
} else {
    $summary += @{Name="Node.js"; Status="FALTA"; Color="Red"}
    $allOK = $false
}

# MPV
if (Get-Command mpv -ErrorAction SilentlyContinue) {
    $summary += @{Name="MPV"; Status="OK"; Color="Green"}
} else {
    $summary += @{Name="MPV"; Status="Reiniciar terminal"; Color="Yellow"}
}

# yt-dlp
if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
    $summary += @{Name="yt-dlp"; Status="OK"; Color="Green"}
} else {
    $summary += @{Name="yt-dlp"; Status="Reiniciar terminal"; Color="Yellow"}
}

# Cloudflared
if ((Get-Command cloudflared -ErrorAction SilentlyContinue) -or (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe")) {
    $summary += @{Name="Cloudflared"; Status="OK"; Color="Green"}
} else {
    $summary += @{Name="Cloudflared"; Status="Reiniciar terminal"; Color="Yellow"}
}

# VB-Cable
if ($cableInstalled) {
    $summary += @{Name="VB-Cable"; Status="OK"; Color="Green"}
} else {
    $summary += @{Name="VB-Cable"; Status="INSTALAR MANUAL"; Color="Red"}
    $allOK = $false
}

# node_modules
if (Test-Path "node_modules") {
    $summary += @{Name="npm modules"; Status="OK"; Color="Green"}
} else {
    $summary += @{Name="npm modules"; Status="FALTA"; Color="Red"}
    $allOK = $false
}

foreach ($item in $summary) {
    Write-Host "  $($item.Name): " -NoNewline
    Write-Host $item.Status -ForegroundColor $item.Color
}

Write-Host ""

if ($allOK) {
    Write-Host "Todo listo! Ejecuta START-DJ.bat para iniciar." -ForegroundColor Green
} else {
    Write-Host "Algunos componentes requieren atencion." -ForegroundColor Yellow
    Write-Host "Revisa los mensajes de arriba." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Presiona Enter para salir"
