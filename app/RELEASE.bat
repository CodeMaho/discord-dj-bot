@echo off
setlocal EnableDelayedExpansion
title Discord DJ Bot - Publicar Release
color 0D

:: Trabajar siempre desde la raiz del repo (un nivel arriba de app/)
cd /d "%~dp0.."

echo.
echo  ========================================
echo    Discord DJ Bot - Publicar Release
echo  ========================================
echo.

:: ============================================
:: 1. COMPROBAR HERRAMIENTAS
:: ============================================

where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [X]  Git no encontrado.
    echo       Instala Git desde: https://git-scm.com/download/win
    goto :error
)
for /f "tokens=*" %%v in ('git --version 2^>nul') do echo  [OK] %%v

where gh >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [X]  GitHub CLI ^(gh^) no encontrado.
    echo       Instala desde: https://cli.github.com/
    goto :error
)
for /f "tokens=*" %%v in ('gh --version 2^>nul') do (echo  [OK] %%v & goto :gh_ok)
:gh_ok

gh auth status >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [X]  No estas autenticado en GitHub CLI.
    echo       Ejecuta: gh auth login
    goto :error
)
echo  [OK] GitHub CLI autenticado.
echo.

:: ============================================
:: 2. PEDIR VERSION
:: ============================================

for /f "tokens=*" %%v in ('gh release list --limit 1 --json tagName --jq ".[0].tagName" 2^>nul') do set "LAST_TAG=%%v"
if defined LAST_TAG (
    echo  Ultimo release publicado: !LAST_TAG!
) else (
    echo  No hay releases anteriores.
)
echo.

set /p "VERSION=  Nueva version (ej: v1.2.0): "
if "!VERSION!"=="" (
    echo  [X]  La version no puede estar vacia.
    goto :error
)

:: Verificar que el tag no existe ya
gh release view "!VERSION!" >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo.
    echo  [X]  El release !VERSION! ya existe en GitHub.
    echo       Usa una version diferente o borralo primero con: gh release delete !VERSION!
    goto :error
)

:: ============================================
:: 3. PEDIR NOTAS DEL RELEASE
:: ============================================

echo.
echo  Notas del release ^(deja vacio para generarlas automaticamente desde los commits^):
set /p "NOTES=  > "
echo.

:: ============================================
:: 4. GIT: COMMIT Y PUSH
:: ============================================

echo  ----------------------------------------
echo  [1/3] Actualizando codigo en GitHub...
echo  ----------------------------------------
echo.

:: Comprobar si hay cambios pendientes
git status --porcelain > "%TEMP%\_djbot_status.txt" 2>&1
set "HAS_CHANGES=0"
for %%F in ("%TEMP%\_djbot_status.txt") do if %%~zF gtr 0 set "HAS_CHANGES=1"
del "%TEMP%\_djbot_status.txt" >nul 2>&1

if "!HAS_CHANGES!"=="1" (
    echo  [!]  Hay cambios sin commitear:
    echo.
    git status --short
    echo.
    set /p "DO_COMMIT=  Commitear y subir todos los cambios ahora? (S/N): "
    if /i "!DO_COMMIT!"=="S" (
        git add -A
        git commit -m "Release !VERSION!"
        if !ERRORLEVEL! NEQ 0 (
            echo  [X]  Error al hacer commit.
            goto :error
        )
        echo  [OK] Commit creado.
    ) else (
        echo  [!]  Continuando sin commitear los cambios locales.
    )
) else (
    echo  [OK] No hay cambios locales pendientes.
)

echo.
echo  [*]  Subiendo codigo a GitHub...
git push origin master
if %ERRORLEVEL% NEQ 0 (
    echo  [X]  Error al subir el codigo. Comprueba tu conexion y permisos.
    goto :error
)
echo  [OK] Codigo actualizado en GitHub.

:: ============================================
:: 5. COMPILAR EXE
:: ============================================

echo.
echo  ----------------------------------------
echo  [2/3] Compilando DiscordDJ.exe...
echo  ----------------------------------------
echo.

:: Borrar el exe anterior para detectar fallos de compilacion
if exist "DiscordDJ.exe" del "DiscordDJ.exe"

:: Compilar - stdin desde NUL para que Read-Host no bloquee
powershell -NoProfile -ExecutionPolicy Bypass -File "BUILD-EXE.ps1" < nul

if not exist "DiscordDJ.exe" (
    echo.
    echo  [X]  La compilacion fallo: DiscordDJ.exe no fue generado.
    echo       Revisa los mensajes anteriores.
    goto :error
)

for %%F in ("DiscordDJ.exe") do echo  [OK] DiscordDJ.exe generado ^(%%~zF bytes^).

:: ============================================
:: 6. CREAR RELEASE EN GITHUB
:: ============================================

echo.
echo  ----------------------------------------
echo  [3/3] Publicando release en GitHub...
echo  ----------------------------------------
echo.

if "!NOTES!"=="" (
    gh release create "!VERSION!" DiscordDJ.exe ^
        --title "Discord DJ Bot !VERSION!" ^
        --generate-notes
) else (
    :: Notas a archivo temporal para evitar problemas con caracteres especiales
    echo !NOTES!> "%TEMP%\_djbot_notes.txt"
    gh release create "!VERSION!" DiscordDJ.exe ^
        --title "Discord DJ Bot !VERSION!" ^
        --notes-file "%TEMP%\_djbot_notes.txt"
    del "%TEMP%\_djbot_notes.txt" >nul 2>&1
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [X]  Error creando el release en GitHub.
    goto :error
)

:: ============================================
:: RESULTADO FINAL
:: ============================================

echo.
echo  ========================================
echo    RELEASE !VERSION! PUBLICADO
echo  ========================================
echo.
for /f "tokens=*" %%u in ('gh release view "!VERSION!" --json url --jq ".url" 2^>nul') do echo    %%u
echo.
pause
exit /b 0

:error
echo.
echo  ========================================
echo    ERROR - RELEASE CANCELADO
echo  ========================================
echo.
pause
exit /b 1
