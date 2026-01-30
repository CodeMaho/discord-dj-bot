@echo off
title Discord DJ Bot
color 0B

echo.
echo ========================================
echo     Discord DJ Bot - Iniciando...
echo ========================================
echo.

cd /d "%~dp0"

REM Ejecutar el script de PowerShell
powershell -ExecutionPolicy Bypass -File "%~dp0start-dj.ps1"

pause
