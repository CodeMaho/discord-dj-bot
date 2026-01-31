# Discord DJ Bot

Reproductor de YouTube para Discord usando una cuenta secundaria como DJ. La música se reproduce en tu PC y se transmite a Discord a través de Virtual Audio Cable.

## Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Frontend Web   │────▶│  Tu PC (Backend) │────▶│   Discord   │
│    (Hosting)    │     │  Node.js + MPV   │     │  Voice Chat │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
                    Cloudflare Tunnel
```

- **Frontend**: Página web estática en tu hosting
- **Backend**: Servidor Node.js en tu PC con MPV para reproducir audio
- **Túnel**: Cloudflare Tunnel expone tu PC a internet
- **Audio**: Virtual Audio Cable envía el audio a Discord

## Requisitos

- Windows 10/11
- Cuenta secundaria de Discord (el "DJ")

## Instalación

### 1. Descargar

```bash
git clone https://github.com/CodeMaho/discord-dj-bot.git
cd discord-dj-bot
```

### 2. Instalar dependencias

Ejecuta `INSTALL.bat` - instala automáticamente:
- Node.js
- MPV (reproductor)
- yt-dlp (extractor de YouTube)
- Cloudflared (túnel)
- VB-Audio Virtual Cable

### 3. Configurar Discord

Con tu cuenta DJ:

1. Discord → Configuración → Voz y Video
2. **Dispositivo de Entrada**: CABLE Output (VB-Audio)
3. Desactiva: Cancelación de Eco, Supresión de Ruido
4. Une la cuenta DJ al canal de voz

### 4. Subir frontend a hosting

Sube la carpeta `public/` a tu hosting:

```
/tu-dominio/
├── api/
│   └── config.php
├── app_new.js
├── background.jpg
├── config.js
├── index.html
└── styles.css
```

## Uso

### Arrancar

```batch
START-DJ.bat
```

El servidor:
1. Pregunta qué dispositivo de audio usar (selecciona **CABLE Input**)
2. Inicia el túnel de Cloudflare
3. Publica la URL automáticamente a tu hosting
4. Queda listo para recibir conexiones

### Reproducir música

1. Abre tu web (ej: `https://tu-dominio.com`)
2. Pega una URL de YouTube
3. Click en "Reproducir"

La música suena en Discord a través de la cuenta DJ.

## Estructura

```
discord-dj-bot/
├── public/                 # Frontend (subir a hosting)
│   ├── api/config.php      # API para URL del túnel
│   ├── app_new.js          # JavaScript
│   ├── index.html          # Página principal
│   └── styles.css          # Estilos
├── server.js               # Servidor backend
├── package.json            # Dependencias
├── START-DJ.bat            # Arranque
├── INSTALL.bat             # Instalador
└── README.md
```

## API

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/status` | GET | Estado actual |
| `/api/play` | POST | Reproducir URL |
| `/api/stop` | POST | Detener |
| `/api/skip` | POST | Saltar canción |
| `/api/queue` | GET/POST | Cola de reproducción |
| `/api/queue/:index` | DELETE | Eliminar de cola |
| `/api/queue/clear` | POST | Limpiar cola |
| `/api/config` | GET/POST | Configuración |

WebSocket en el mismo puerto para actualizaciones en tiempo real.

## Solución de Problemas

### No se escucha en Discord
- Verifica que la cuenta DJ tenga "CABLE Output" como micrófono
- Verifica que seleccionaste "CABLE Input" al arrancar
- Asegúrate de que la cuenta DJ esté en el canal de voz

### El frontend no conecta
- Verifica que el servidor esté corriendo
- Revisa la consola del navegador (F12)
- El túnel puede haber cambiado - reinicia el servidor

### PHP no funciona en hosting
- Verifica que tu hosting soporte PHP
- Crea manualmente `/api/backend-url.json` con la URL del túnel

## FAQ

**¿Es seguro?**
No modificas Discord. Solo transmites audio por micrófono.

**¿Funciona con llamadas privadas?**
Sí. A diferencia de bots oficiales, funciona en llamadas privadas.

**¿Qué pasa si cierro el servidor?**
La música para. Tu PC debe estar encendida.

## Licencia

MIT
