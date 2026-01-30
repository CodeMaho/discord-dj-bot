# 🚀 Setup Rápido - Discord DJ Bot

## Estado Actual ✅

Aquí está lo que ya hemos verificado e instalado:

### ✅ Instalado
- **Node.js v22.19.0** ✓
- **npm v10.9.3** ✓
- **Dependencias de Node.js** ✓ (101 paquetes)
- **yt-dlp v2025.12.08** ✓ (descargado en `C:\Temp\discord-dj-tools\yt-dlp.exe`)

### ❌ Falta Instalar (Manual)
- **MPV** - Reproductor de audio
- **VB-Audio Virtual Cable** - Dispositivo de audio virtual para Discord

---

## 📝 Pasos de Instalación

### 1️⃣ Instalar MPV (Reproductor)

**Opción A - Recomendado (Oficial):**
1. Ve a: https://mpv.io/installation/
2. Descarga el archivo `.zip` para Windows
3. Extrae los archivos a `C:\Program Files\mpv\` (o donde prefieras)
4. **Importante:** Agrega MPV al PATH del sistema:
   - Presiona `Win + X` → "Sistema"
   - "Configuración avanzada del sistema"
   - Haz clic en "Variables de entorno"
   - En "Variables del usuario", haz clic en "Nuevo"
   - **Nombre:** `Path`
   - **Valor:** `C:\Program Files\mpv\` (la ruta donde instalaste MPV)
   - Haz clic en "Aceptar" en todos los diálogos

**Opción B - Alternativa:**
1. Ve a: https://github.com/zhongfly/mpv-winbuild/releases
2. Descarga la última versión (carpeta `.zip`)
3. Extrae a `C:\Program Files\mpv\`
4. Agrega al PATH (mismo proceso que arriba)

**Verifica que funciona:**
```powershell
mpv --version
```

### 2️⃣ Instalar VB-Audio Virtual Cable

1. Ve a: https://vb-audio.com/Cable/
2. Descarga "VB-CABLE Driver" (la versión gratis)
3. Ejecuta el instalador y sigue las instrucciones
4. **Reinicia tu PC** para que Windows reconozca el dispositivo

**Verifica que funciona:**
- Abre "Configuración de Sonido" en Windows
- Ve a "Reproducción"
- Debes ver "CABLE Input" en la lista

### 3️⃣ Configurar Discord

Con tu **cuenta secundaria (la "cuenta DJ"):**

1. Abre Discord
2. Ve a **Configuración** (⚙️) → **Voz y Video**
3. En **"Dispositivo de Entrada"**, selecciona: **CABLE Output (VB-Audio Virtual Cable)**
4. Desactiva:
   - ✓ "Cancelación de Eco"
   - ✓ "Supresión de Ruido"
   - ✓ "Detección Automática de Sensibilidad"
5. Ajusta el volumen de entrada al **mínimo**

---

## 🎮 Cómo Iniciar la Aplicación

### Opción 1: Script Automático (Recomendado)
```powershell
# En PowerShell, navega a la carpeta del proyecto y ejecuta:
.\setup.ps1

# Luego abre una NUEVA terminal y:
npm start
```

### Opción 2: Script Batch (Simple)
Haz doble clic en:
```
start-server.cmd
```

### Opción 3: Manual
```powershell
npm start
```

---

## 🌐 Acceder al Panel

Una vez que el servidor esté corriendo:

**Desde tu PC:**
```
http://localhost:3000
```

**Desde tu móvil (misma red WiFi):**
1. Averigua tu IP: `ipconfig` en PowerShell
2. Busca "Dirección IPv4" (ejemplo: `192.168.1.100`)
3. En tu móvil abre: `http://192.168.1.100:3000`

---

## 📋 Checklist Antes de Usar

Antes de presionar "Reproducir", verifica:

- [ ] MPV está instalado y en el PATH
- [ ] yt-dlp está funcionando (`yt-dlp --version`)
- [ ] VB-Audio Virtual Cable está instalado y aparece en sonido
- [ ] Tu cuenta DJ está en Discord configurada con CABLE Output
- [ ] El servidor está corriendo (`npm start`)
- [ ] El navegador abre en `http://localhost:3000`

---

## 🔧 Solución de Problemas

### Error: "mpv not found"
```powershell
# Verifica que MPV está en el PATH:
mpv --version

# Si falla, reinstala y agrega al PATH (ver Paso 1)
```

### Error: "yt-dlp not found"
```powershell
# Abre una NUEVA terminal (después de haber actualizado PATH)
# El PATH se carga al abrir la terminal

# Verifica:
yt-dlp --version
```

### No se escucha audio en Discord
1. Verifica que tu cuenta DJ tiene CABLE Output seleccionado
2. En el panel web, asegúrate de seleccionar "CABLE Input" (con ⭐)
3. Revisa que Discord está conectado a la llamada
4. Intenta bajar/subir el volumen en Windows (panel de control → Sonido)

### Error: "Cannot connect to WebSocket"
1. Verifica que el servidor está corriendo
2. Recarga la página (Ctrl + F5)
3. Revisa que los puertos 3000 y 3001 no están ocupados

---

## 📚 Documentación Adicional

- **README.md** - Documentación completa del proyecto
- **TROUBLESHOOTING.md** - Solución de problemas detallada
- **INSTALL_WINDOWS.md** - Guía extendida de Windows

---

## ✅ ¡Listo!

Si todo está configurado correctamente, deberías:
1. Abrir http://localhost:3000
2. Seleccionar "CABLE Input" 
3. Pegar una URL de YouTube
4. Presionar "Reproducir"
5. **¡Escuchar la música en Discord!**

**¿Problemas?** Revisa TROUBLESHOOTING.md o ejecuta el script `setup.ps1` para verificar dependencias.
