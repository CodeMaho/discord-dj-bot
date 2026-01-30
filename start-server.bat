@echo off
chcp 65001 >nul
title Discord DJ Web Controller - Servidor
color 0B

:: Verificar que estamos en el directorio correcto
if not exist "server.js" (
    echo ❌ Error: No se encontró server.js
    echo Asegúrate de estar en el directorio correcto del proyecto.
    pause
    exit /b 1
)

:: Verificar que node_modules existe
if not exist "node_modules\" (
    echo ⚠️  No se encontró node_modules
    echo Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo ❌ Error al instalar dependencias
        pause
        exit /b 1
    )
)

:: Limpiar pantalla y mostrar banner
cls
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║     🎵 Discord DJ Web Controller - Iniciando... 🎵         ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo ⏳ Iniciando servidor...
echo.

:: Iniciar el servidor
node server.js

:: Si el servidor se cierra por error
if errorlevel 1 (
    echo.
    echo ❌ El servidor se cerró con error
    echo.
    pause
)
