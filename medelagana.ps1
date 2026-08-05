# =======================================================================
# SCRIPT DE ARRANQUE UNICO: COPILOTO VISUAL Y DE VOZ
# =======================================================================
Clear-Host
Write-Host "[INFO] Iniciando el entorno del Agente Visual..." -ForegroundColor Cyan

# 1. Asegurar la politica de ejecucion de scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force

# 2. Levantar los Ojos: Screenpipe
Write-Host "[1/3] Arrancando capturador de pantalla y audio (Screenpipe)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k npx screenpipe record" -WindowStyle Normal

Write-Host "      Esperando 10 segundos a que la API de Screenpipe este online..." -ForegroundColor Magenta
Start-Sleep -Seconds 10

# 3. Levantar el Cerebro: OpenClaw Gateway
Write-Host "[2/3] Iniciando pasarela de IA (OpenClaw)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k openclaw gateway start" -WindowStyle Normal

Write-Host "      Esperando 8 segundos a que OpenClaw este online..." -ForegroundColor Magenta
Start-Sleep -Seconds 8

# 4. Asegurar Dependencias de Python (Previene el ModuleNotFoundError)
Write-Host "[INFO] Validando e instalando librerías de Python..." -ForegroundColor Cyan
pip install duckduckgo-search keyboard requests pyttsx3 --quiet

# 5. Lanzar el Puente Interactivo
Write-Host "[3/3] Conectando el puente de control por tecla y voz..." -ForegroundColor Green
Write-Host "---------------------------------------------------------" -ForegroundColor Gray

python Jarvis.py

# Si el puente se cierra o cancelas con Ctrl+C
Write-Host "Agente detenido de forma segura." -ForegroundColor Red