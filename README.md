# Discord DJ Web Controller

Sistema para reproducir musica de YouTube en Discord mediante un controlador web y Virtual Audio Cable. Funciona con llamadas privadas y canales de voz.

## Caracteristicas

- Panel web moderno con tema oscuro estilo Discord
- Soporte de YouTube: videos individuales y playlists
- Cola de reproduccion con auto-play
- Actualizaciones en tiempo real via WebSocket
- Acceso remoto desde cualquier dispositivo
- Instalador automatico de dependencias
- Arquitectura hibrida: frontend en hosting + backend local con tunel

## Requisitos

- Windows 10/11
- Conexion a internet
- Cuenta secundaria de Discord (tu "cuenta DJ")

## Instalacion Rapida

### 1. Descargar el proyecto

```bash
git clone https://github.com/CodeMaho/discord-dj-bot.git
cd discord-dj-bot
```

### 2. Ejecutar el instalador

**Doble click en `INSTALL.bat`**

El instalador automaticamente:
- Instala Node.js
- Instala MPV (reproductor)
- Instala yt-dlp (extractor de YouTube)
- Instala Cloudflared (tunel para acceso remoto)
- Guia para instalar VB-Audio Virtual Cable
- Instala dependencias npm

### 3. Configurar Discord

Con tu cuenta DJ (secundaria):

1. Abre Discord → Configuracion → Voz y Video
2. Dispositivo de Entrada: **CABLE Output (VB-Audio Virtual Cable)**
3. Desactiva: Cancelacion de Eco, Supresion de Ruido, Ganancia Automatica
4. Sensibilidad de entrada: al minimo

### 4. Iniciar el bot

**Doble click en `START-DJ.bat`**

Esto inicia:
- Servidor Node.js en puerto 3000
- Tunel de Cloudflare (para acceso remoto)

Veras una URL tipo `https://xxx.trycloudflare.com` - esta es tu URL de acceso remoto.

## Uso

### Local

1. Abre http://localhost:3000
2. Selecciona **CABLE Input** como dispositivo de audio
3. Pega una URL de YouTube
4. Click en Reproducir
5. Une tu cuenta DJ a la llamada de Discord

### Remoto (desde movil u otro PC)

1. Copia la URL del tunel (aparece al ejecutar START-DJ.bat)
2. Abre esa URL en tu navegador
3. Usa normalmente

### Con hosting propio (arquitectura hibrida)

Si tienes un dominio/hosting:

1. Sube la carpeta `public/` a tu hosting
2. Ejecuta `START-DJ.bat` en tu PC
3. En tu web, click en ⚙️ (configuracion)
4. Pega la URL del tunel de Cloudflare
5. Guarda

Ahora tu web publica controla el backend en tu PC.

## Estructura del proyecto

```
discord-dj-bot/
├── INSTALL.bat        # Instalador (ejecutar primero)
├── START-DJ.bat       # Iniciar el bot
├── server.js          # Backend Node.js
├── package.json       # Dependencias
├── public/            # Frontend (subir a hosting si quieres)
│   ├── index.html
│   ├── app_new.js
│   └── styles.css
├── README.md          # Esta documentacion
├── INSTALL_WINDOWS.md # Guia detallada de instalacion
└── TROUBLESHOOTING.md # Solucion de problemas
```

## Arquitectura

```
┌─────────────────────┐
│   Navegador/Movil   │
│   (Frontend)        │
└──────────┬──────────┘
           │ HTTP + WebSocket
           ▼
┌─────────────────────┐
│   Tu PC (Backend)   │
│   Node.js + MPV     │
└──────────┬──────────┘
           │ Audio
           ▼
┌─────────────────────┐
│   CABLE Input       │
│   (Virtual Cable)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   CABLE Output      │
│   (Mic en Discord)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Llamada Discord   │
│   (Todos escuchan)  │
└─────────────────────┘
```

## API

El servidor expone estos endpoints:

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/status` | GET | Estado actual |
| `/api/play` | POST | Reproducir URL |
| `/api/stop` | POST | Detener |
| `/api/skip` | POST | Siguiente cancion |
| `/api/queue` | GET | Obtener cola |
| `/api/queue` | POST | Anadir a cola |
| `/api/queue/:index` | DELETE | Eliminar de cola |
| `/api/queue/clear` | POST | Limpiar cola |
| `/api/audio-devices` | GET | Listar dispositivos |

WebSocket en el mismo puerto para actualizaciones en tiempo real.

## FAQ

### ¿Es seguro? ¿Me pueden banear?

No modificas Discord ni usas su API de forma no autorizada. Solo transmites audio por microfono, igual que si pusieras musica con altavoces.

### ¿Funciona con llamadas privadas?

Si. A diferencia de los bots oficiales de Discord, este sistema funciona en llamadas privadas porque usa una cuenta normal.

### ¿Puedo usarlo en varios servidores?

Si, pero la cuenta DJ debe estar en cada llamada. Para multiples llamadas simultaneas necesitarias multiples instancias.

### ¿Que pasa si cierro START-DJ.bat?

El servidor se detiene y la musica para. Tu PC debe estar encendida mientras quieras usar el bot.

## Solucion de problemas

Ver [TROUBLESHOOTING.md](TROUBLESHOOTING.md) para problemas comunes.

## Licencia

MIT License - Uso libre para proyectos personales.
