# Guia de Instalacion - Windows

Esta guia detalla el proceso de instalacion en Windows 10/11.

## Metodo Rapido (Recomendado)

### Paso 1: Descargar el proyecto

```bash
git clone https://github.com/CodeMaho/discord-dj-bot.git
cd discord-dj-bot
```

O descarga el ZIP desde GitHub y extrae.

### Paso 2: Ejecutar instalador

**Doble click en `INSTALL.bat`**

El instalador:
1. Solicita permisos de administrador
2. Verifica/instala Node.js via winget
3. Verifica/instala MPV via winget
4. Verifica/instala yt-dlp via winget
5. Verifica/instala Cloudflared via winget
6. Detecta VB-Audio Virtual Cable (requiere instalacion manual)
7. Ejecuta `npm install` para dependencias

### Paso 3: Instalar VB-Audio Virtual Cable

Este componente requiere instalacion manual:

1. Ve a https://vb-audio.com/Cable/
2. Descarga **VBCABLE_Driver_Pack45.zip** (o version mas reciente)
3. Extrae el ZIP
4. Click derecho en `VBCABLE_Setup_x64.exe` → **Ejecutar como administrador**
5. Sigue el asistente
6. **Reinicia tu PC**

### Paso 4: Configurar Discord

Con tu cuenta DJ (cuenta secundaria):

1. Abre Discord
2. Configuracion (⚙️) → Voz y Video
3. **Dispositivo de Entrada**: CABLE Output (VB-Audio Virtual Cable)
4. **Desactiva**:
   - Cancelacion de Eco
   - Supresion de Ruido
   - Ganancia Automatica
   - Detectar automaticamente sensibilidad
5. **Sensibilidad**: Mover al minimo (izquierda)

### Paso 5: Iniciar

**Doble click en `START-DJ.bat`**

Veras:
```
========================================
    Discord DJ Bot - Iniciando...
========================================

[1/5] Verificando Node.js... OK
[2/5] Verificando MPV... OK
[3/5] Verificando yt-dlp... OK
[4/5] Verificando Cloudflared... OK
[5/5] Verificando dependencias npm... OK

Todas las dependencias OK

[Servidor] Iniciando Node.js...
[Servidor] Iniciado en http://localhost:3000

========================================
  INICIANDO TUNEL DE CLOUDFLARE
========================================

Your quick Tunnel has been created! Visit it at:
https://example-words.trycloudflare.com
```

Copia la URL del tunel para acceso remoto.

---

## Metodo Manual

Si prefieres instalar manualmente cada componente:

### 1. Node.js

```powershell
winget install OpenJS.NodeJS.LTS
```

O descarga desde https://nodejs.org/

Verificar:
```powershell
node --version
npm --version
```

### 2. MPV

```powershell
winget install mpv.net
```

O descarga desde https://mpv.io/installation/

Verificar:
```powershell
mpv --version
```

### 3. yt-dlp

```powershell
winget install yt-dlp.yt-dlp
```

O descarga desde https://github.com/yt-dlp/yt-dlp/releases

Verificar:
```powershell
yt-dlp --version
```

### 4. Cloudflared

```powershell
winget install Cloudflare.cloudflared
```

Verificar:
```powershell
cloudflared --version
```

### 5. Dependencias npm

```powershell
cd discord-dj-bot
npm install
```

### 6. VB-Audio Virtual Cable

Descarga e instala desde https://vb-audio.com/Cable/

---

## Verificar Instalacion

Ejecuta estos comandos para verificar todo:

```powershell
# Node.js
node --version

# MPV
mpv --version

# yt-dlp
yt-dlp --version

# Cloudflared
cloudflared --version

# Dispositivos de audio
mpv --audio-device=help | findstr CABLE
```

Si todos funcionan, ejecuta `START-DJ.bat`.

---

## Estructura de Archivos

Despues de la instalacion:

```
discord-dj-bot/
├── INSTALL.bat          # Instalador automatico
├── INSTALL.ps1          # Script de instalacion (PowerShell)
├── START-DJ.bat         # Iniciar el bot
├── start-dj.ps1         # Script de inicio (PowerShell)
├── server.js            # Servidor backend
├── package.json         # Dependencias Node.js
├── node_modules/        # Dependencias instaladas
├── public/              # Frontend web
│   ├── index.html       # Pagina principal
│   ├── app_new.js       # Logica del frontend
│   └── styles.css       # Estilos
├── README.md            # Documentacion principal
├── INSTALL_WINDOWS.md   # Esta guia
└── TROUBLESHOOTING.md   # Solucion de problemas
```

---

## Configuracion Avanzada

### Cambiar puerto del servidor

Edita `server.js`:
```javascript
const PORT = process.env.PORT || 3000;  // Cambia 3000 por otro puerto
```

### Usar sin Cloudflare Tunnel

Si solo quieres uso local, puedes iniciar manualmente:

```powershell
cd discord-dj-bot
node server.js
```

Accede a http://localhost:3000

### Acceso desde red local (sin tunel)

1. Encuentra tu IP local:
   ```powershell
   ipconfig
   ```
   Busca "Direccion IPv4" (ej: 192.168.1.100)

2. Permite Node.js en el firewall de Windows

3. Accede desde otro dispositivo:
   ```
   http://192.168.1.100:3000
   ```

---

## Desinstalacion

Para desinstalar los componentes:

```powershell
winget uninstall OpenJS.NodeJS.LTS
winget uninstall mpv.net
winget uninstall yt-dlp.yt-dlp
winget uninstall Cloudflare.cloudflared
```

VB-Audio Virtual Cable: Panel de Control → Programas → Desinstalar

---

## Siguiente Paso

Una vez instalado, lee [README.md](README.md) para aprender a usar el sistema.

Si tienes problemas, consulta [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
