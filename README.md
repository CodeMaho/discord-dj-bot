# Discord DJ Bot

Controlador web remoto para reproducir música de YouTube y Suno en Discord. La música se reproduce en tu PC a través de MPV y se transmite a Discord usando Virtual Audio Cable. Se controla desde cualquier dispositivo mediante una interfaz web accesible desde internet vía Cloudflare Tunnel.

## Arquitectura

```
┌──────────────────┐        ┌───────────────────────┐        ┌──────────────┐
│   Frontend Web   │◀──WS──▶│   Tu PC (Backend)     │──────▶│   Discord    │
│   (tu hosting)   │  HTTP  │   Node.js + MPV        │       │  Voice Chat  │
└──────────────────┘        └───────────────────────┘        └──────────────┘
                                       │
                              Cloudflare Tunnel
                           (expone tu PC a internet)
```

- **Frontend**: Página web estática en tu hosting (IONOS, etc.)
- **Backend**: Servidor Node.js en tu PC — gestiona cola, yt-dlp y MPV
- **Túnel**: Cloudflare Tunnel genera una URL pública para acceder al backend
- **Audio**: Virtual Audio Cable (VB-Cable) enruta el audio de MPV a Discord

---

## Requisitos

- Windows 10 / 11
- Cuenta secundaria de Discord (la cuenta "DJ")
- Hosting con PHP (para publicar la URL del túnel automáticamente)

---

## Instalación

### Opción A — Ejecutable todo en uno (recomendado)

> Instala dependencias y arranca el bot con un solo doble clic.

1. Descarga o clona el repositorio
2. Ejecuta `BUILD-EXE.ps1` con PowerShell → genera `DiscordDJ.exe`
3. A partir de ahora, usa **`DiscordDJ.exe`** para todo

En el primer arranque detecta qué falta e instala automáticamente:
- Node.js · MPV · yt-dlp · Cloudflared · dependencias npm

### Opción B — Scripts separados

1. Ejecuta **`INSTALL.bat`** para instalar todas las dependencias
2. Ejecuta **`START-DJ.bat`** cada vez que quieras usar el bot

### Instalación manual de dependencias

Si prefieres instalar manualmente con winget:

```powershell
winget install OpenJS.NodeJS.LTS
winget install mpv
winget install yt-dlp.yt-dlp
winget install Cloudflare.cloudflared
npm install        # dentro de la carpeta del proyecto
```

---

## Configuración de Discord

Con tu **cuenta DJ** (la secundaria):

1. Discord → Configuración de Usuario → **Voz y Vídeo**
2. **Dispositivo de entrada**: `CABLE Output (VB-Audio Virtual Cable)`
3. Desactiva: Cancelación de eco, Supresión de ruido, Cancelación de ruido
4. Une la cuenta DJ al canal de voz donde quieres que suene la música

---

## Configuración del frontend

### 1. Subir archivos al hosting

Sube el contenido de la carpeta `public/` a tu hosting:

```
tu-dominio.com/
├── api/
│   └── config.php       ← API PHP para guardar la URL del túnel
├── app_new.js
├── background.jpg
├── config.js
├── index.html
└── styles.css
```

### 2. Configurar `config.js` (opcional)

Si el frontend no detecta el backend automáticamente, edita `public/config.js`:

```js
const DJ_CONFIG = {
    BACKEND_URL: ''   // vacío = usa localhost; o pon tu URL de Cloudflare
};
```

### 3. Configurar la URL del túnel automáticamente

El servidor publica la URL del túnel en `/api/config.php` de tu hosting al arrancar.
Requiere que `server-config.json` tenga la URL de tu hosting en `ionosApiUrl`:

```json
{
  "ionosApiUrl": "https://tu-dominio.com/api/config.php"
}
```

---

## Uso

### Arrancar el bot

**Con ejecutable (Opción A):**
```
Doble clic en DiscordDJ.exe
```

**Con scripts (Opción B):**
```batch
START-DJ.bat
```

El servidor al arrancar:
1. Muestra los dispositivos de audio disponibles — selecciona **CABLE Input (VB-Audio)**
2. Inicia el túnel de Cloudflare y obtiene la URL pública
3. Publica la URL en tu hosting automáticamente
4. Queda escuchando en `http://localhost:3000`

### Controlar la música

Abre tu web (`https://tu-dominio.com`) desde cualquier dispositivo y:

| Acción | Cómo |
|--------|------|
| Reproducir | Pega URL o escribe nombre → **Reproducir** |
| Añadir a cola | Pega URL → **Añadir a cola** |
| Generar playlist automática | Pega URL de YouTube → **Crear Playlist** (añade hasta 25 relacionados) |
| Saltar canción | Botón **Skip** |
| Detener | Botón **Stop** |
| Eliminar de cola | Botón ✕ en cada canción |

### Fuentes de música soportadas

- **YouTube** — URL directa, lista de reproducción, o búsqueda por texto
- **YouTube Mix** — genera cola automática con vídeos relacionados (hasta 25)
- **Suno.com** — música generada por IA (URLs de `suno.com/song/...`)
- **Cualquier URL** compatible con yt-dlp

---

## Estructura de archivos

```
discord-dj-bot/
├── public/                    # Frontend — subir a tu hosting
│   ├── api/
│   │   └── config.php         # API PHP para guardar URL del túnel
│   ├── app_new.js             # Lógica principal del frontend
│   ├── config.js              # Configuración de URL del backend
│   ├── index.html             # Interfaz web
│   ├── styles.css             # Estilos (tema Discord)
│   └── background.jpg         # Fondo
├── server.js                  # Servidor backend (Node.js)
├── package.json               # Dependencias Node.js
├── server-config.json         # Config del servidor (URL túnel, dispositivo audio)
├── player-state.json          # Estado persistido (cola, canción actual)
├── tunnel-url.txt             # URL pública actual del túnel
├── DiscordDJ.exe              # Ejecutable todo en uno (generado)
├── DiscordDJ.ps1              # Fuente del ejecutable (install + start)
├── BUILD-EXE.ps1              # Genera DiscordDJ.exe desde DiscordDJ.ps1
├── INSTALL.bat                # Instalador de dependencias (alternativo)
├── INSTALL.ps1                # Lógica del instalador (PowerShell)
├── START-DJ.bat               # Arranque del bot (alternativo)
├── start-dj.ps1               # Lógica del arranque (PowerShell)
└── VBCABLE_Driver_Pack45/     # Driver de VB-Audio (instalación manual)
```

---

## API

El servidor expone una API REST en `http://localhost:3000` y un WebSocket en el mismo puerto para actualizaciones en tiempo real (cada 500 ms).

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/status` | GET | Estado actual: canción, progreso, cola |
| `/api/play` | POST | Reproducir URL o búsqueda de texto |
| `/api/play-with-mix` | POST | Reproducir + generar mix de YouTube en cola |
| `/api/stop` | POST | Detener reproducción |
| `/api/skip` | POST | Saltar a la siguiente canción |
| `/api/queue` | GET | Ver cola actual |
| `/api/queue` | POST | Añadir canción a la cola |
| `/api/queue/:index` | DELETE | Eliminar canción de la cola por índice |
| `/api/queue/clear` | POST | Vaciar toda la cola |
| `/api/audio-devices` | GET | Listar dispositivos de audio disponibles |
| `/api/audio-device` | POST | Cambiar dispositivo de audio activo |
| `/api/config` | GET | Ver configuración del servidor |
| `/api/config` | POST | Actualizar configuración |
| `/api/tunnel-url` | GET | Obtener URL pública actual del túnel |

---

## Solución de problemas

### No se escucha audio en Discord

- Verifica que la cuenta DJ tenga **CABLE Output** como dispositivo de entrada en Discord
- Verifica que al arrancar el bot hayas seleccionado **CABLE Input**
- Asegúrate de que la cuenta DJ esté en el canal de voz

### El frontend no conecta al backend

- Comprueba que el servidor esté corriendo (debe mostrar "Servidor listo")
- Abre la consola del navegador (F12) para ver el error exacto
- La URL del túnel cambia cada vez que reinicias — el frontend la carga automáticamente desde el hosting
- Si falla la carga automática, abre la configuración (⚙️) e introduce la URL manualmente

### MPV no se encuentra al arrancar

- Si tienes la carpeta `mpv-x86_64-*/` en el proyecto, ejecuta `INSTALL.bat` o `DiscordDJ.exe` para que la añada al PATH automáticamente
- O añádela manualmente: `winget install mpv`

### PHP no funciona en el hosting

- Verifica que tu hosting soporte PHP (IONOS, Hostinger, etc.)
- Si no tienes PHP, crea manualmente el archivo `/api/backend-url.json` en tu hosting con el contenido:
  ```json
  { "backendUrl": "https://tu-url-de-cloudflare.trycloudflare.com" }
  ```

### yt-dlp tarda mucho o falla

- Actualiza yt-dlp: `winget upgrade yt-dlp.yt-dlp`
- Algunos vídeos con restricciones pueden no estar disponibles

---

## FAQ

**¿Es necesario tener una cuenta de Discord secundaria?**
Sí. El bot usa una cuenta real de usuario (no un bot oficial) para unirse al canal de voz y transmitir audio como si fuera un micrófono.

**¿Funciona en llamadas privadas de Discord?**
Sí. A diferencia de los bots de Discord oficiales, funciona en llamadas 1:1 y grupos privados.

**¿Qué pasa si cierro el servidor?**
La música se detiene. Tu PC debe estar encendida y con el servidor corriendo.

**¿Qué pasa si reinicio el servidor sin parar la música?**
El estado (cola y canción actual) se guarda en `player-state.json` y se restaura al volver a arrancar.

**¿Es seguro?**
No se modifica Discord ni se usa ninguna API no oficial de Discord. Solo se transmite audio a través del micrófono virtual.

---

## Licencia

MIT
