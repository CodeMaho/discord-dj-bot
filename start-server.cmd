@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  Discord DJ Bot - Iniciar Servidor
REM ============================================================

REM Agregar MPV local al PATH si existe
if exist "%~dp0mpv-x86_64-20260128-git-d79172a\mpv.exe" (
    set "PATH=%~dp0mpv-x86_64-20260128-git-d79172a;%PATH%"
)

cls
echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  🎵 Discord DJ Web Controller - Iniciando...        ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM Verificar Node.js
echo [1/3] Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ✗ Node.js no está instalado
    echo   Descarga desde: https://nodejs.org/
    pause
    exit /b 1
)
echo ✓ Node.js encontrado
echo.

REM Verificar npm
echo [2/3] Verificando npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ✗ npm no está instalado
    pause
    exit /b 1
)
echo ✓ npm encontrado
echo.

REM Instalar dependencias si no existen
echo [3/3] Verificando dependencias...
if not exist node_modules (
    echo Instalando paquetes npm...
    call npm install
    if %errorlevel% neq 0 (
        echo ✗ Error instalando dependencias
        pause
        exit /b 1
    )
)
echo ✓ Dependencias listas
echo.

REM Mostrar información de conexión
echo ╔══════════════════════════════════════════════════════╗
echo ║     🎵 Discord DJ Web Controller - Servidor OK      ║
echo ╠══════════════════════════════════════════════════════╣
echo ║                                                      ║
echo ║  Servidor HTTP:     http://localhost:3000           ║
echo ║  WebSocket:         ws://localhost:3001             ║
echo ║                                                      ║
echo ║  Panel de Control:  http://localhost:3000           ║
echo ║                                                      ║
echo ║  Presiona CTRL+C para detener el servidor           ║
echo ║                                                      ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM Iniciar el servidor
node server.js

pause
