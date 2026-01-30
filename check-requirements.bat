@echo off
chcp 65001 >nul
title Discord DJ - Verificación de Requisitos
color 0B

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║     🎵 Discord DJ Web Controller - Verificación 🎵         ║
echo ╠════════════════════════════════════════════════════════════╣
echo ║  Este script verificará que todos los requisitos          ║
echo ║  estén correctamente instalados.                           ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

set "ALL_OK=true"

echo 🔍 Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Node.js está instalado
    node --version
) else (
    echo ❌ Node.js NO está instalado
    echo    Descarga desde: https://nodejs.org/
    set "ALL_OK=false"
)
echo.

echo 🔍 Verificando NPM...
npm --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ NPM está instalado
    npm --version
) else (
    echo ❌ NPM NO está instalado
    echo    Debería venir con Node.js
    set "ALL_OK=false"
)
echo.

echo 🔍 Verificando MPV...
mpv --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ MPV está instalado
    mpv --version | findstr "mpv"
) else (
    echo ❌ MPV NO está instalado
    echo    Descarga desde: https://mpv.io/installation/
    echo    Recuerda agregarlo al PATH del sistema
    set "ALL_OK=false"
)
echo.

echo 🔍 Verificando yt-dlp...
yt-dlp --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ yt-dlp está instalado
    yt-dlp --version
) else (
    echo ❌ yt-dlp NO está instalado
    echo    Descarga desde: https://github.com/yt-dlp/yt-dlp/releases
    echo    Colócalo en C:\Windows\System32\ o agrégalo al PATH
    set "ALL_OK=false"
)
echo.

echo 🔍 Verificando VB-Audio Virtual Cable...
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s | findstr /i "VB-CABLE" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ VB-Audio Virtual Cable parece estar instalado
    echo    (Verificación basada en registro de Windows)
) else (
    echo ⚠️  No se pudo detectar VB-Audio Virtual Cable
    echo    Si lo instalaste, esto puede ser un falso negativo
    echo    Verifica manualmente en: Panel de Control ^> Sonido
    echo    Descarga desde: https://vb-audio.com/Cable/
)
echo.

echo 🔍 Verificando dependencias de Node.js...
if exist "node_modules\" (
    echo ✅ Carpeta node_modules existe
) else (
    echo ⚠️  Carpeta node_modules NO existe
    echo    Ejecuta: npm install
    set "ALL_OK=false"
)
echo.

echo 🔍 Verificando estructura del proyecto...
if exist "package.json" (
    echo ✅ package.json encontrado
) else (
    echo ❌ package.json NO encontrado
    echo    ¿Estás en el directorio correcto del proyecto?
    set "ALL_OK=false"
)

if exist "server.js" (
    echo ✅ server.js encontrado
) else (
    echo ❌ server.js NO encontrado
    set "ALL_OK=false"
)

if exist "public\index.html" (
    echo ✅ public\index.html encontrado
) else (
    echo ❌ public\index.html NO encontrado
    set "ALL_OK=false"
)
echo.

echo ═══════════════════════════════════════════════════════════
echo.

if "%ALL_OK%"=="true" (
    color 0A
    echo ✅✅✅ ¡TODO ESTÁ LISTO! ✅✅✅
    echo.
    echo Puedes iniciar el servidor con: npm start
    echo O con auto-reload: npm run dev
    echo.
    echo Luego abre tu navegador en: http://localhost:3000
) else (
    color 0C
    echo ❌❌❌ FALTAN REQUISITOS ❌❌❌
    echo.
    echo Por favor, instala los componentes faltantes.
    echo Lee INSTALL_WINDOWS.md para instrucciones detalladas.
)

echo.
echo ═══════════════════════════════════════════════════════════
echo.
pause
