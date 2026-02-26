# ============================================
# Discord DJ Bot - Instalador Completo
# ============================================
# Este script instala todas las dependencias necesarias

$Host.UI.RawUI.WindowTitle = "Discord DJ Bot - Instalador"

# Colores
function Write-Step { param($msg) Write-Host "`n[$script:step] $msg" -ForegroundColor Cyan; $script:step++ }
function Write-OK   { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "    [X]  $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "    $msg" -ForegroundColor White }

$script:step = 1
$projectDir = $PSScriptRoot

# ============================================
# HELPERS DE PATH
# ============================================

# Recarga $env:Path desde el registro (Machine + User) en la sesion actual
function Refresh-EnvPath {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

# Añade un directorio al PATH del usuario de forma permanente y recarga la sesion
function Add-ToUserPath {
    param([string]$Dir)
    if ([string]::IsNullOrWhiteSpace($Dir)) { return }
    $Dir = $Dir.TrimEnd('\')
    $current = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $entries = $current -split ';' | Where-Object { $_ -ne '' }
    if ($entries -notcontains $Dir) {
        $newPath = ($entries + $Dir) -join ';'
        [System.Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Refresh-EnvPath
        Write-OK "Añadido al PATH de usuario permanentemente: $Dir"
        return $true
    }
    return $false  # ya estaba
}

# Busca un ejecutable en rutas con wildcards y devuelve el primero encontrado
function Find-Exe {
    param([string[]]$Patterns)
    foreach ($pattern in $Patterns) {
        $found = Get-Item $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $found }
    }
    return $null
}

# ============================================
# INICIO
# ============================================

Clear-Host
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   DISCORD DJ BOT - INSTALADOR        "  -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "Este script instalara todo lo necesario:" -ForegroundColor White
Write-Host "  - Node.js (servidor)"                  -ForegroundColor Gray
Write-Host "  - MPV (reproductor de audio)"          -ForegroundColor Gray
Write-Host "  - yt-dlp (extractor de YouTube)"       -ForegroundColor Gray
Write-Host "  - Cloudflared (tunel para acceso remoto)" -ForegroundColor Gray
Write-Host "  - VB-Audio Virtual Cable (audio virtual)" -ForegroundColor Gray
Write-Host "  - Dependencias npm"                    -ForegroundColor Gray
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

Refresh-EnvPath
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-OK "Node.js instalado: $nodeVersion"
} else {
    Write-Warn "Node.js no encontrado. Instalando via winget..."
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Refresh-EnvPath

    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-OK "Node.js instalado: $(node --version)"
    } else {
        # Buscar en rutas tipicas de winget
        $nodeExe = Find-Exe @(
            "$env:ProgramFiles\nodejs\node.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*NodeJS*\node.exe"
        )
        if ($nodeExe) {
            Add-ToUserPath -Dir $nodeExe.DirectoryName
            Write-OK "Node.js encontrado y añadido al PATH: $($nodeExe.FullName)"
        } else {
            Write-Err "Node.js no pudo instalarse automaticamente."
            Write-Info "Descargalo de: https://nodejs.org/"
        }
    }
}

# ============================================
# 3. MPV
# ============================================
Write-Step "Verificando MPV (reproductor multimedia)..."

Refresh-EnvPath
$mpvExe = $null

# Paso 1: comprobar si ya esta en PATH
if (Get-Command mpv -ErrorAction SilentlyContinue) {
    $mpvExe = (Get-Command mpv).Source
    Write-OK "MPV ya disponible en PATH: $mpvExe"
}

# Paso 2: buscar build portable en la carpeta del proyecto (mpv-x86_64-*)
if (-not $mpvExe) {
    $localMpv = Find-Exe @("$projectDir\tools\mpv\mpv.exe", "$projectDir\tools\mpv\mpv.com")
    if ($localMpv) {
        $mpvExe = $localMpv.FullName
        Write-OK "MPV portable encontrado localmente: $mpvExe"
        Add-ToUserPath -Dir $localMpv.DirectoryName
    }
}

# Paso 3: buscar en rutas de instalacion comunes
if (-not $mpvExe) {
    $commonMpv = Find-Exe @(
        "C:\Program Files\mpv\mpv.exe",
        "C:\mpv\mpv.exe",
        "$env:LOCALAPPDATA\Programs\mpv\mpv.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*mpv*\mpv.exe"
    )
    if ($commonMpv) {
        $mpvExe = $commonMpv.FullName
        Write-OK "MPV encontrado en: $mpvExe"
        Add-ToUserPath -Dir $commonMpv.DirectoryName
    }
}

# Paso 4: instalar via winget como ultimo recurso
if (-not $mpvExe) {
    Write-Warn "MPV no encontrado localmente. Instalando via winget..."

    winget install mpv --accept-source-agreements --accept-package-agreements
    Refresh-EnvPath

    # Verificar tras instalacion
    if (Get-Command mpv -ErrorAction SilentlyContinue) {
        $mpvExe = (Get-Command mpv).Source
        Write-OK "MPV instalado y disponible: $mpvExe"
    } else {
        # Buscar el exe en paquetes winget
        $wingetMpv = Find-Exe @(
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*mpv*\mpv.exe",
            "$env:ProgramFiles\mpv\mpv.exe",
            "$env:ProgramFiles (x86)\mpv\mpv.exe"
        )
        if ($wingetMpv) {
            $mpvExe = $wingetMpv.FullName
            Add-ToUserPath -Dir $wingetMpv.DirectoryName
            Write-OK "MPV encontrado tras instalacion: $mpvExe"
        } else {
            Write-Err "No se pudo instalar MPV automaticamente."
            Write-Info "Descarga manual: https://mpv.io/installation/"
            Write-Info "Extrae el ZIP en '$projectDir\mpv\' y vuelve a ejecutar el instalador."
        }
    }
}

# ============================================
# 4. YT-DLP
# ============================================
Write-Step "Verificando yt-dlp (extractor de YouTube)..."

Refresh-EnvPath
if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
    Write-OK "yt-dlp instalado: $(yt-dlp --version)"
} else {
    Write-Warn "yt-dlp no encontrado. Instalando via winget..."
    winget install yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements
    Refresh-EnvPath

    if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
        Write-OK "yt-dlp instalado: $(yt-dlp --version)"
    } else {
        $ytdlpExe = Find-Exe @(
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*yt-dlp*\yt-dlp.exe",
            "$env:ProgramFiles\yt-dlp\yt-dlp.exe"
        )
        if ($ytdlpExe) {
            Add-ToUserPath -Dir $ytdlpExe.DirectoryName
            Write-OK "yt-dlp encontrado y añadido al PATH: $($ytdlpExe.FullName)"
        } else {
            Write-Warn "yt-dlp instalado pero requiere reiniciar la terminal para activarse."
        }
    }
}

# ============================================
# 5. FFMPEG
# ============================================
Write-Step "Verificando ffmpeg (analisis de audio / waveform)..."

Refresh-EnvPath
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Write-OK "ffmpeg disponible: $((Get-Command ffmpeg).Source)"
} else {
    Write-Warn "ffmpeg no encontrado. Instalando via winget..."
    winget install Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
    Refresh-EnvPath

    if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
        Write-OK "ffmpeg instalado: $((Get-Command ffmpeg).Source)"
    } else {
        $ffmpegExe = Find-Exe @(
            "$env:ProgramFiles\ffmpeg\bin\ffmpeg.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*ffmpeg*\ffmpeg.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*Gyan*\bin\ffmpeg.exe"
        )
        if ($ffmpegExe) {
            Add-ToUserPath -Dir $ffmpegExe.DirectoryName
            Write-OK "ffmpeg encontrado y añadido al PATH: $($ffmpegExe.FullName)"
        } else {
            Write-Warn "ffmpeg instalado pero requiere reiniciar la terminal para activarse."
            Write-Info "Sin ffmpeg el visualizador de ondas (waveform) no funcionara."
        }
    }
}

# ============================================
# 6. CLOUDFLARED
# ============================================
Write-Step "Verificando Cloudflared (tunel de acceso remoto)..."

Refresh-EnvPath
$cloudflaredExe = $null

if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    $cloudflaredExe = (Get-Command cloudflared).Source
    Write-OK "Cloudflared disponible en PATH: $cloudflaredExe"
} else {
    $cloudflaredExe = Find-Exe @(
        "C:\Program Files (x86)\cloudflared\cloudflared.exe",
        "C:\Program Files\cloudflared\cloudflared.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*cloudflared*\cloudflared.exe"
    )
    if ($cloudflaredExe) {
        Write-OK "Cloudflared encontrado: $($cloudflaredExe.FullName)"
        Add-ToUserPath -Dir $cloudflaredExe.DirectoryName
    }
}

if (-not $cloudflaredExe) {
    Write-Warn "Cloudflared no encontrado. Instalando via winget..."
    winget install Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
    Refresh-EnvPath

    if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
        $cloudflaredExe = (Get-Command cloudflared).Source
        Write-OK "Cloudflared instalado: $cloudflaredExe"
    } else {
        $cfExe = Find-Exe @(
            "C:\Program Files (x86)\cloudflared\cloudflared.exe",
            "C:\Program Files\cloudflared\cloudflared.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*cloudflared*\cloudflared.exe"
        )
        if ($cfExe) {
            Add-ToUserPath -Dir $cfExe.DirectoryName
            $cloudflaredExe = $cfExe.FullName
            Write-OK "Cloudflared encontrado y añadido al PATH: $cloudflaredExe"
        } else {
            Write-Warn "Cloudflared instalado pero requiere reiniciar la terminal para activarse."
        }
    }
}

# ============================================
# 6. VB-AUDIO VIRTUAL CABLE
# ============================================
Write-Step "Verificando VB-Audio Virtual Cable..."

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

# Alternativa: buscar driver instalado en el proyecto
if (-not $cableInstalled) {
    $vbDriver = Find-Exe @("$projectDir\tools\vbcable\VBCABLE_Setup_x64.exe")
    if ($vbDriver) {
        Write-Warn "VB-Cable NO detectado pero se encontro el instalador en el proyecto."
        Write-Info "Instalando VB-Cable automaticamente (requiere reinicio del PC)..."
        Start-Process -FilePath $vbDriver.FullName -ArgumentList "/S" -Verb RunAs -Wait -ErrorAction SilentlyContinue
        Write-OK "Instalador de VB-Cable ejecutado. Reinicia el PC para aplicar los cambios."
        $cableInstalled = $true  # asumimos que se instalo
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
Write-Step "Instalando dependencias npm..."

Set-Location $projectDir
Refresh-EnvPath

if (Get-Command npm -ErrorAction SilentlyContinue) {
    if (Test-Path "node_modules") {
        Write-OK "node_modules ya existe"
        Write-Info "Ejecutando 'npm install' para verificar que todo esta actualizado..."
    } else {
        Write-Warn "node_modules no encontrado. Instalando dependencias..."
    }
    npm install
    if ($LASTEXITCODE -eq 0 -and (Test-Path "node_modules")) {
        Write-OK "Dependencias npm instaladas correctamente"
    } else {
        Write-Err "Error instalando dependencias npm. Revisa el log anterior."
    }
} else {
    Write-Err "npm no disponible. Node.js no se instalo correctamente."
    Write-Info "Reinicia el script o instala Node.js manualmente desde https://nodejs.org/"
}

# ============================================
# RESUMEN FINAL
# ============================================
Refresh-EnvPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "        INSTALACION COMPLETADA         "  -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

$allOK = $true
$summary = @()

# Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
    $summary += @{Name="Node.js    "; Status="OK  $(node --version)"; Color="Green"}
} else {
    $summary += @{Name="Node.js    "; Status="FALTA - instalar manualmente"; Color="Red"}
    $allOK = $false
}

# MPV
if (Get-Command mpv -ErrorAction SilentlyContinue) {
    $summary += @{Name="MPV        "; Status="OK  $((Get-Command mpv).Source)"; Color="Green"}
} elseif ($mpvExe) {
    $summary += @{Name="MPV        "; Status="OK  $mpvExe (reinicia la terminal)"; Color="Yellow"}
} else {
    $summary += @{Name="MPV        "; Status="FALTA - instalar manualmente"; Color="Red"}
    $allOK = $false
}

# yt-dlp
if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
    $summary += @{Name="yt-dlp     "; Status="OK  $(yt-dlp --version)"; Color="Green"}
} else {
    $summary += @{Name="yt-dlp     "; Status="Instalado - reinicia la terminal"; Color="Yellow"}
}

# ffmpeg
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    $summary += @{Name="ffmpeg     "; Status="OK  $((Get-Command ffmpeg).Source)"; Color="Green"}
} else {
    $summary += @{Name="ffmpeg     "; Status="Instalado - reinicia la terminal (waveform necesita ffmpeg)"; Color="Yellow"}
}

# Cloudflared
if ((Get-Command cloudflared -ErrorAction SilentlyContinue) -or $cloudflaredExe) {
    $summary += @{Name="Cloudflared"; Status="OK"; Color="Green"}
} else {
    $summary += @{Name="Cloudflared"; Status="Instalado - reinicia la terminal"; Color="Yellow"}
}

# VB-Cable
if ($cableInstalled) {
    $summary += @{Name="VB-Cable   "; Status="OK"; Color="Green"}
} else {
    $summary += @{Name="VB-Cable   "; Status="INSTALAR MANUAL (ver instrucciones arriba)"; Color="Red"}
    $allOK = $false
}

# node_modules
if (Test-Path "node_modules") {
    $summary += @{Name="npm modules"; Status="OK"; Color="Green"}
} else {
    $summary += @{Name="npm modules"; Status="FALTA - ejecuta 'npm install' manualmente"; Color="Red"}
    $allOK = $false
}

foreach ($item in $summary) {
    Write-Host "  $($item.Name): " -NoNewline -ForegroundColor White
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
Write-Host "NOTA: Si algunos programas dicen 'reinicia la terminal'," -ForegroundColor Cyan
Write-Host "      cierra esta ventana, abre una nueva y prueba de nuevo." -ForegroundColor Cyan
Write-Host ""
Read-Host "Presiona Enter para salir"
