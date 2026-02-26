@echo off
setlocal EnableDelayedExpansion
title Discord DJ Bot - Actualizador
color 0B

echo.
echo  ========================================
echo    Discord DJ Bot - Actualizador
echo  ========================================
echo.

:: Trabajar siempre desde la carpeta del .bat
cd /d "%~dp0"

:: ============================================
:: 1. COMPROBAR GIT
:: ============================================

where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [!]  Git no esta instalado.
    echo  [*]  Intentando instalar Git via winget...
    echo.
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    echo.

    :: Refrescar PATH para encontrar git recien instalado
    for /f "usebackq tokens=2*" %%A in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul`) do set "SYS_PATH=%%B"
    for /f "usebackq tokens=2*" %%A in (`reg query "HKCU\Environment" /v Path 2^>nul`) do set "USR_PATH=%%B"
    set "PATH=!SYS_PATH!;!USR_PATH!"

    where git >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo  [X]  Git no se pudo instalar o requiere reiniciar el equipo.
        echo       Descargalo manualmente desde: https://git-scm.com/download/win
        echo       Tras instalarlo, vuelve a ejecutar este archivo.
        goto :error
    )
    echo  [OK] Git instalado correctamente.
    echo.
) else (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do echo  [OK] %%v encontrado.
)

echo.

:: ============================================
:: 2. PREPARAR REPOSITORIO
:: ============================================

if not exist ".git" (
    echo  [*]  Esta carpeta no tiene repositorio git.
    echo       Inicializando y vinculando con GitHub...
    echo.
    git init -q
    git remote add origin https://github.com/CodeMaho/discord-dj-bot.git
    if !ERRORLEVEL! NEQ 0 (
        echo  [X]  No se pudo configurar el repositorio remoto.
        goto :error
    )
    echo  [OK] Repositorio configurado.
    echo.
) else (
    :: Asegurarse de que el remote apunta al repo correcto
    git remote set-url origin https://github.com/CodeMaho/discord-dj-bot.git >nul 2>&1
)

:: ============================================
:: 3. DESCARGAR Y APLICAR ACTUALIZACION
:: ============================================

echo  [*]  Descargando ultimos cambios desde GitHub...
echo       (No se necesita cuenta ni contrasena, el repositorio es publico)
echo.

git fetch origin master 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [X]  Error al descargar. Comprueba tu conexion a internet.
    goto :error
)

:: Mostrar que hay de nuevo antes de aplicar
echo.
for /f "tokens=*" %%c in ('git rev-parse HEAD 2^>nul') do set "LOCAL_COMMIT=%%c"
for /f "tokens=*" %%c in ('git rev-parse origin/master 2^>nul') do set "REMOTE_COMMIT=%%c"

if "!LOCAL_COMMIT!" == "!REMOTE_COMMIT!" (
    echo  [OK] Ya tienes la version mas reciente. No hay nada que actualizar.
    echo.
    goto :npm_check
)

echo  [*]  Aplicando actualizacion...
echo       (Los archivos locales se reemplazaran por la version de GitHub)
echo.

git reset --hard origin/master
if %ERRORLEVEL% NEQ 0 (
    echo  [X]  Error al aplicar la actualizacion.
    goto :error
)

echo.
echo  [OK] Codigo actualizado a la ultima version.

:: Mostrar resumen de cambios
echo.
echo  Cambios incluidos:
git log --oneline !LOCAL_COMMIT!..origin/master 2>nul | findstr "." && (
    echo.
) || echo       (primera instalacion o sin historial previo)

:npm_check
:: ============================================
:: 4. ACTUALIZAR PAQUETES NPM
:: ============================================

if exist "app\package.json" (
    echo  [*]  Actualizando paquetes npm...
    echo.

    where npm >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo  [!]  npm no encontrado. Instala Node.js o ejecuta DiscordDJ.exe
        echo       para que se instale automaticamente.
    ) else (
        cd /d "%~dp0app"
        npm install --prefer-offline 2>&1
        if !ERRORLEVEL! NEQ 0 (
            npm install 2>&1
            if !ERRORLEVEL! NEQ 0 (
                echo  [!]  Error en npm install. Ejecuta DiscordDJ.exe para reinstalar.
            ) else (
                echo  [OK] Paquetes npm actualizados.
            )
        ) else (
            echo  [OK] Paquetes npm actualizados.
        )
        cd /d "%~dp0"
    )
    echo.
)

:: ============================================
:: RESULTADO FINAL
:: ============================================

echo.
echo  ========================================
echo    ACTUALIZACION COMPLETADA
echo  ========================================
echo.
echo  Siguiente paso:
echo    - Ejecuta DiscordDJ.exe para arrancar el bot.
echo.
echo  Si quieres regenerar el .exe con esta version:
echo    - Ejecuta BUILD-EXE.ps1
echo.
pause
exit /b 0

:error
echo.
echo  ========================================
echo    ERROR - ACTUALIZACION FALLIDA
echo  ========================================
echo.
pause
exit /b 1
