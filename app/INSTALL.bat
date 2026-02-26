@echo off
title Discord DJ Bot - Instalador
color 0D

echo.
echo ========================================
echo   DISCORD DJ BOT - INSTALADOR
echo ========================================
echo.
echo Este instalador requiere permisos de administrador
echo para instalar software en tu sistema.
echo.

REM Verificar si ya es administrador
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :run_installer
)

REM No es administrador: relanzar con privilegios elevados
echo Solicitando permisos de administrador...
echo.
powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
exit /b

:run_installer
REM Cambiar al directorio del script (importante si se ejecuta desde otro lugar)
cd /d "%~dp0"

echo Iniciando instalacion...
echo.

REM Ejecutar el script de PowerShell con politica de ejecucion desbloqueada
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALL.ps1"

REM Verificar si PowerShell termino con error
if %errorLevel% neq 0 (
    echo.
    echo [ERROR] El instalador termino con errores (codigo: %errorLevel%)
    echo         Revisa los mensajes anteriores.
    echo.
)

pause
