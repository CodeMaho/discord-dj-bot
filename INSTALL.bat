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

REM Verificar si es administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permisos de administrador...
    echo.
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

REM Ejecutar el script de PowerShell como administrador
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0INSTALL.ps1"

pause
