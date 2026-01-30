# 🎵 Discord DJ Web Controller

Sistema completo para reproducir música de YouTube en Discord sin usar bots oficiales, mediante un controlador web y Virtual Audio Cable.

## 📋 Tabla de Contenidos

- [Características](#características)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso](#uso)
- [Solución de Problemas](#solución-de-problemas)
- [Preguntas Frecuentes](#preguntas-frecuentes)

---

## ✨ Características

- 🎮 **Panel web moderno** - Interfaz intuitiva y responsiva
- 🎵 **Soporte completo de YouTube** - Videos, playlists, y YouTube Music
- 🔄 **Actualizaciones en tiempo real** - WebSocket para estado en vivo
- 📱 **Responsive** - Funciona en móvil, tablet y desktop
- 🎧 **Multi-dispositivo** - Selección de dispositivo de audio
- 🌙 **Dark Mode** - Diseño moderno estilo Discord
- 🔔 **Notificaciones** - Feedback visual de todas las acciones

---

## 📦 Requisitos

### Software Requerido

1. **Node.js** (v16 o superior)
   - Descarga: https://nodejs.org/

2. **MPV Media Player**
   - Windows: https://mpv.io/installation/
   - Descarga el instalador y asegúrate de agregar MPV al PATH del sistema

3. **yt-dlp**
   - Windows: Descarga `yt-dlp.exe` de https://github.com/yt-dlp/yt-dlp/releases
   - Colócalo en una carpeta que esté en el PATH (o en `C:\Windows\System32`)

4. **VB-Audio Virtual Cable**
   - Descarga: https://vb-audio.com/Cable/
   - Instala y reinicia tu PC

### Cuenta de Discord

- Una cuenta secundaria de Discord (tu "cuenta DJ")
- Puede ser una cuenta nueva o una que ya tengas

---

## 🚀 Instalación

### Paso 1: Descargar el proyecto

```bash
# Crea una carpeta para el proyecto
mkdir discord-dj-bot
cd discord-dj-bot
```

Copia todos los archivos del proyecto a esta carpeta.

### Paso 2: Instalar dependencias de Node.js

```bash
npm install
```

### Paso 3: Verificar instalación de software

```bash
# Verificar MPV
mpv --version

# Verificar yt-dlp
yt-dlp --version

# Verificar Node.js
node --version
```

Si alguno de estos comandos falla, revisa la instalación de ese software.

---

## ⚙️ Configuración

### 1. Configurar VB-Audio Virtual Cable

#### En Windows (Configuración de Audio):

1. **Click derecho en el icono de volumen** → "Sonidos" → Pestaña "Reproducción"
2. **Verifica que aparezca "CABLE Input"** (debe estar habilitado)

#### En Discord (Cuenta DJ):

1. **Abre Discord** con tu cuenta secundaria (la que será el "DJ")
2. **Ve a Configuración de Usuario** (⚙️) → **Voz y Video**
3. **En "Dispositivo de Entrada"**, selecciona: **CABLE Output (VB-Audio Virtual Cable)**
4. **Desactiva "Cancelación de Eco"** y **"Supresión de Ruido"**
5. **Desactiva "Detección Automática de Sensibilidad"** y ajusta manualmente al mínimo

### 2. Unirse a una llamada

1. Con tu cuenta principal, **inicia una llamada privada** o únete a un canal de voz
2. Con tu cuenta DJ (la secundaria), **únete a la misma llamada**
3. Deja la cuenta DJ conectada (puede estar minimizada)

---

## 🎮 Uso

### Iniciar el servidor

```bash
npm start
```

O para desarrollo con auto-reload:

```bash
npm run dev
```

Verás este mensaje:

```
╔════════════════════════════════════════════════════════════╗
║     🎵 Discord DJ Web Controller - Servidor Iniciado 🎵    ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Servidor HTTP:     http://localhost:3000                  ║
║  WebSocket:         ws://localhost:3001                    ║
║                                                            ║
║  Panel de Control:  http://localhost:3000                  ║
╚════════════════════════════════════════════════════════════╝
```

### Usar el panel web

1. **Abre tu navegador** y ve a: `http://localhost:3000`

2. **Selecciona el dispositivo de audio**:
   - En el selector, elige **"CABLE Input"** (aparecerá con una ⭐)

3. **Pega una URL de YouTube**:
   - Copia cualquier URL de YouTube (video o playlist)
   - Pégala en el campo de texto

4. **Dale al botón "Reproducir"**:
   - La música comenzará a sonar en Discord
   - Verás el título de la canción en tiempo real

5. **Para detener**:
   - Haz clic en "Detener"

### Acceso remoto (desde tu móvil)

Para acceder desde tu teléfono en la misma red WiFi:

1. **Averigua la IP de tu PC**:
   ```bash
   ipconfig
   # Busca "Dirección IPv4" (ej: 192.168.1.100)
   ```

2. **En tu móvil**, abre el navegador y ve a:
   ```
   http://192.168.1.100:3000
   ```

3. **¡Listo!** Ahora puedes controlar la música desde tu teléfono

---

## 🔧 Solución de Problemas

### No se escucha audio en Discord

**Problema**: La música se reproduce pero no se escucha en Discord

**Soluciones**:
1. Verifica que en Discord (cuenta DJ):
   - El micrófono esté en **"CABLE Output"**
   - La **detección de sensibilidad esté al mínimo**
   - Estés **conectado a la llamada**

2. En el panel web, asegúrate de haber seleccionado **"CABLE Input"**

3. Prueba ajustar el volumen de CABLE Input en Windows:
   - Panel de Control → Sonido → Reproducción → CABLE Input → Propiedades → Niveles

### Error: "MPV not found" o "yt-dlp not found"

**Problema**: El servidor no puede encontrar MPV o yt-dlp

**Soluciones**:
1. Verifica la instalación:
   ```bash
   mpv --version
   yt-dlp --version
   ```

2. Si alguno falla, **reinstala** y asegúrate de agregarlo al PATH:
   - Windows: Variables de entorno → Path → Agregar la ruta de instalación

3. Reinicia la terminal después de modificar el PATH

### Error: "Cannot connect to WebSocket"

**Problema**: El frontend no puede conectarse al servidor

**Soluciones**:
1. Verifica que el servidor esté corriendo (`npm start`)
2. Revisa que el puerto 3000 y 3001 no estén ocupados
3. Desactiva temporalmente el firewall/antivirus
4. En el navegador, recarga la página (Ctrl + F5)

### La música se corta o tiene lag

**Problema**: El audio tiene interrupciones

**Soluciones**:
1. Cierra otros programas que usen mucho CPU/RAM
2. En Discord, reduce la calidad de voz (96 kbps es suficiente)
3. Usa YouTube Music en vez de videos (menos recursos)
4. Verifica tu conexión a internet

### Error: "spawn mpv ENOENT"

**Problema**: Node.js no puede ejecutar MPV

**Solución**:
- En Windows, asegúrate de haber agregado MPV al PATH del sistema
- Reinicia tu PC después de instalar MPV
- Verifica la instalación: `mpv --version` en cmd

---

## ❓ Preguntas Frecuentes

### ¿Es esto legal?

Sí, siempre y cuando:
- Uses una cuenta personal (no automatices el login)
- No lo uses para spam o abuso
- Respetes los términos de servicio de YouTube

### ¿Me pueden banear de Discord?

No, porque:
- **No modificas el cliente de Discord**
- **No usas la API de Discord de forma no autorizada**
- Solo estás transmitiendo audio a través del micrófono

Es como si estuvieras reproduciendo música con altavoces cerca del micrófono.

### ¿Funciona con playlists?

Sí, MPV y yt-dlp soportan playlists completas de YouTube. Simplemente pega la URL de la playlist.

### ¿Puedo usar esto en servidores de Discord?

Sí, pero recuerda que necesitas una cuenta secundaria en el canal de voz. Es más práctico para llamadas privadas o servidores pequeños.

### ¿Funciona con otras plataformas además de YouTube?

Técnicamente sí, yt-dlp soporta cientos de sitios. Pero este proyecto está optimizado para YouTube. Puedes intentar con otras URLs compatibles.

### ¿Puedo cambiar el puerto del servidor?

Sí, edita `server.js`:

```javascript
const PORT = 3000; // Cambia esto
```

Y en `public/app.js`, actualiza la conexión WebSocket si cambias el puerto 3001.

### ¿Puedo tener múltiples "cuentas DJ"?

Sí, pero cada una necesita:
- Su propia instancia del servidor (puerto diferente)
- Su propio Virtual Audio Cable (puedes instalar múltiples)

---

## 🛠️ Arquitectura del Sistema

```
┌─────────────────┐
│   Tu Móvil/PC   │ ──────────► http://localhost:3000
│   (Navegador)   │
└─────────────────┘
         │
         │ WebSocket (Estado en tiempo real)
         ▼
┌─────────────────┐
│  Node.js Server │ ──────────► Ejecuta MPV
│  (Express + WS) │             con yt-dlp
└─────────────────┘
         │
         │ Audio Output
         ▼
┌─────────────────┐
│  CABLE Input    │ ──────────► Virtual Audio Cable
└─────────────────┘
         │
         │ Audio Routing
         ▼
┌─────────────────┐
│  CABLE Output   │ ──────────► Micrófono de Discord
└─────────────────┘             (Cuenta DJ)
         │
         │ Transmisión de Voz
         ▼
┌─────────────────┐
│   Discord Call  │ ──────────► Todos escuchan
└─────────────────┘
```

---

## 📝 Notas Finales

- **Uso responsable**: Este sistema es para uso personal con amigos
- **Calidad de audio**: Depende de tu conexión y la configuración de Discord
- **Latencia**: Mínima, similar a hablar por micrófono normal
- **Recursos**: MPV es muy ligero, pero la reproducción usa algo de CPU

---

## 🤝 Créditos

Desarrollado como una solución alternativa segura para compartir música en Discord sin usar bots oficiales.

---

## 📄 Licencia

MIT License - Úsalo libremente para proyectos personales

---

**¿Tienes problemas?** Revisa la sección de [Solución de Problemas](#solución-de-problemas) o verifica que hayas seguido todos los pasos de [Configuración](#configuración).

**¡Disfruta de tu Radio Station personal en Discord! 🎵**
