# ============================================
# Discord DJ Bot - Todo en uno (Install + Start)
# Compilar con BUILD-EXE.ps1 para generar DiscordDJ.exe
# ============================================

$Host.UI.RawUI.WindowTitle = "Discord DJ Bot"

# Directorio del exe/script (funciona tanto en .ps1 como en .exe compilado)
$projectDir = if ($PSScriptRoot -and (Test-Path $PSScriptRoot)) {
    $PSScriptRoot
} else {
    Split-Path -Parent ([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName)
}
Set-Location $projectDir

# ============================================
# HELPERS
# ============================================

function Write-Header {
    param($msg, $color = "Cyan")
    Write-Host ""
    Write-Host "========================================" -ForegroundColor $color
    Write-Host "  $msg" -ForegroundColor $color
    Write-Host "========================================" -ForegroundColor $color
    Write-Host ""
}
function Write-OK   { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "       $msg" -ForegroundColor White }

function Refresh-EnvPath {
    $m = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $u = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$m;$u"
}

function Add-ToUserPath {
    param([string]$Dir)
    $Dir = $Dir.TrimEnd('\')
    $current = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $entries = $current -split ';' | Where-Object { $_ -ne '' }
    if ($entries -notcontains $Dir) {
        [System.Environment]::SetEnvironmentVariable("Path", ($entries + $Dir) -join ';', "User")
        Refresh-EnvPath
        Write-OK "Añadido al PATH: $Dir"
    }
}

function Find-Exe {
    param([string[]]$Patterns)
    foreach ($p in $Patterns) {
        $found = Get-Item $p -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $found }
    }
    return $null
}

# ============================================
# PANTALLA DE BIENVENIDA
# ============================================

Clear-Host
Write-Host ""
Write-Host "  ██████╗      ██╗    ██████╗  ██████╗ ████████╗" -ForegroundColor Magenta
Write-Host "  ██╔══██╗     ██║    ██╔══██╗██╔═══██╗╚══██╔══╝" -ForegroundColor Magenta
Write-Host "  ██║  ██║     ██║    ██████╔╝██║   ██║   ██║   " -ForegroundColor Magenta
Write-Host "  ██║  ██║██   ██║    ██╔══██╗██║   ██║   ██║   " -ForegroundColor Magenta
Write-Host "  ██████╔╝╚█████╔╝    ██████╔╝╚██████╔╝   ██║   " -ForegroundColor Magenta
Write-Host "  ╚═════╝  ╚════╝     ╚═════╝  ╚═════╝    ╚═╝   " -ForegroundColor Magenta
Write-Host ""

# ============================================
# COMPROBAR DEPENDENCIAS
# ============================================

Refresh-EnvPath

$missing  = [System.Collections.Generic.List[string]]::new()
$mpvExe   = $null
$cfExe    = $null

Write-Host "  Verificando dependencias..." -ForegroundColor Cyan
Write-Host ""

# Node.js
Write-Host "  Node.js      " -NoNewline
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "OK  $(node --version)" -ForegroundColor Green
} else {
    Write-Host "FALTA" -ForegroundColor Red
    $missing.Add("Node.js")
}

# MPV (PATH, local portable, rutas comunes)
Write-Host "  MPV          " -NoNewline
if (Get-Command mpv -ErrorAction SilentlyContinue) {
    $mpvExe = (Get-Command mpv).Source
    Write-Host "OK  $mpvExe" -ForegroundColor Green
} else {
    $found = Find-Exe @(
        "$projectDir\mpv-x86_64-*\mpv.exe",
        "$projectDir\mpv\mpv.exe",
        "C:\Program Files\mpv\mpv.exe",
        "C:\mpv\mpv.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*mpv*\mpv.exe"
    )
    if ($found) {
        $mpvExe = $found.FullName
        Add-ToUserPath -Dir $found.DirectoryName
        Write-Host "OK  $mpvExe" -ForegroundColor Green
    } else {
        Write-Host "FALTA" -ForegroundColor Red
        $missing.Add("MPV")
    }
}

# yt-dlp
Write-Host "  yt-dlp       " -NoNewline
if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
    Write-Host "OK  $(yt-dlp --version)" -ForegroundColor Green
} else {
    Write-Host "FALTA" -ForegroundColor Red
    $missing.Add("yt-dlp")
}

# Cloudflared
Write-Host "  Cloudflared  " -NoNewline
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    $cfExe = (Get-Command cloudflared).Source
    Write-Host "OK  $cfExe" -ForegroundColor Green
} else {
    $found = Find-Exe @(
        "C:\Program Files (x86)\cloudflared\cloudflared.exe",
        "C:\Program Files\cloudflared\cloudflared.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*cloudflared*\cloudflared.exe"
    )
    if ($found) {
        $cfExe = $found.FullName
        Add-ToUserPath -Dir $found.DirectoryName
        Write-Host "OK  $cfExe" -ForegroundColor Green
    } else {
        Write-Host "FALTA" -ForegroundColor Red
        $missing.Add("Cloudflared")
    }
}

# npm packages
Write-Host "  npm packages " -NoNewline
if (Test-Path "$projectDir\node_modules") {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "FALTA" -ForegroundColor Red
    $missing.Add("npm packages")
}

# ============================================
# INSTALACION AUTOMATICA SI FALTAN COSAS
# ============================================

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Warn "Faltan: $($missing -join ', ')"
    Write-Host ""
    $resp = Read-Host "  Instalar automaticamente ahora? (S/N)"
    if ($resp -notin @("S", "s")) {
        Write-Host ""
        Write-Err "Instalacion cancelada. Ejecuta INSTALL.bat manualmente."
        Read-Host "`n  Presiona Enter para salir"
        exit 1
    }

    # Verificar winget
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Err "winget no disponible. Instala 'App Installer' desde Microsoft Store."
        Read-Host "`n  Presiona Enter para salir"
        exit 1
    }

    Write-Header "INSTALANDO DEPENDENCIAS" "Yellow"

    # Node.js
    if ($missing -contains "Node.js") {
        Write-Host "  Instalando Node.js..." -ForegroundColor Cyan
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        Refresh-EnvPath
        if (Get-Command node -ErrorAction SilentlyContinue) {
            Write-OK "Node.js instalado: $(node --version)"
        } else {
            $n = Find-Exe @("$env:ProgramFiles\nodejs\node.exe")
            if ($n) { Add-ToUserPath -Dir $n.DirectoryName }
        }
    }

    # MPV
    if ($missing -contains "MPV") {
        Write-Host "  Instalando MPV..." -ForegroundColor Cyan
        winget install mpv --accept-source-agreements --accept-package-agreements
        Refresh-EnvPath
        if (Get-Command mpv -ErrorAction SilentlyContinue) {
            $mpvExe = (Get-Command mpv).Source
            Write-OK "MPV instalado: $mpvExe"
        } else {
            $found = Find-Exe @(
                "$projectDir\mpv-x86_64-*\mpv.exe",
                "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*mpv*\mpv.exe",
                "C:\Program Files\mpv\mpv.exe"
            )
            if ($found) {
                $mpvExe = $found.FullName
                Add-ToUserPath -Dir $found.DirectoryName
                Write-OK "MPV encontrado: $mpvExe"
            } else {
                Write-Warn "MPV instalado pero requiere reiniciar. Cierra y vuelve a abrir."
            }
        }
    }

    # yt-dlp
    if ($missing -contains "yt-dlp") {
        Write-Host "  Instalando yt-dlp..." -ForegroundColor Cyan
        winget install yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements
        Refresh-EnvPath
        if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
            Write-OK "yt-dlp instalado: $(yt-dlp --version)"
        } else {
            $found = Find-Exe @("$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*yt-dlp*\yt-dlp.exe")
            if ($found) { Add-ToUserPath -Dir $found.DirectoryName }
        }
    }

    # Cloudflared
    if ($missing -contains "Cloudflared") {
        Write-Host "  Instalando Cloudflared..." -ForegroundColor Cyan
        winget install Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
        Refresh-EnvPath
        if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
            $cfExe = (Get-Command cloudflared).Source
            Write-OK "Cloudflared instalado: $cfExe"
        } else {
            $found = Find-Exe @(
                "C:\Program Files (x86)\cloudflared\cloudflared.exe",
                "C:\Program Files\cloudflared\cloudflared.exe",
                "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*cloudflared*\cloudflared.exe"
            )
            if ($found) { Add-ToUserPath -Dir $found.DirectoryName; $cfExe = $found.FullName }
        }
    }

    # npm packages
    if ($missing -contains "npm packages") {
        Write-Host "  Instalando dependencias npm..." -ForegroundColor Cyan
        if (Get-Command npm -ErrorAction SilentlyContinue) {
            npm install
            if ($LASTEXITCODE -eq 0) { Write-OK "npm packages instalados" }
            else { Write-Err "Error en npm install" }
        } else {
            Write-Err "npm no disponible. Reinicia el bot tras instalar Node.js."
            Read-Host "`n  Presiona Enter para salir"
            exit 1
        }
    }
}

# ============================================
# VERIFICACION FINAL ANTES DE ARRANCAR
# ============================================

Refresh-EnvPath
$canStart = $true

if (-not (Get-Command node -ErrorAction SilentlyContinue))       { Write-Err "Node.js no disponible"; $canStart = $false }
if (-not (Get-Command mpv  -ErrorAction SilentlyContinue) -and -not $mpvExe) { Write-Err "MPV no disponible"; $canStart = $false }
if (-not (Test-Path "$projectDir\node_modules"))                  { Write-Err "npm packages no instalados"; $canStart = $false }

if (-not $canStart) {
    Write-Host ""
    Write-Warn "Algunos componentes no pudieron instalarse."
    Write-Warn "Cierra esta ventana, reinicia el PC e intenta de nuevo."
    Read-Host "`n  Presiona Enter para salir"
    exit 1
}

# ============================================
# ARRANCAR EL BOT
# ============================================

Write-Header "TODO OK - INICIANDO BOT" "Green"
Write-Info "Servidor en: http://localhost:3000"
Write-Info "El tunel Cloudflare se iniciara automaticamente."
Write-Host ""

node "$projectDir\server.js"
