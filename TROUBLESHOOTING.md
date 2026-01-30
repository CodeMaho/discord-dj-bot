# 🔧 Guía de Solución de Problemas Detallada

Esta guía cubre los problemas más comunes y sus soluciones.

---

## 📑 Índice de Problemas

1. [Problemas de Instalación](#problemas-de-instalación)
2. [Problemas de Audio](#problemas-de-audio)
3. [Problemas de Conexión](#problemas-de-conexión)
4. [Problemas de Reproducción](#problemas-de-reproducción)
5. [Problemas de Discord](#problemas-de-discord)
6. [Problemas de Rendimiento](#problemas-de-rendimiento)

---

## 🔨 Problemas de Instalación

### ❌ "node is not recognized as an internal or external command"

**Causa**: Node.js no está instalado o no está en el PATH del sistema.

**Solución**:
1. Reinstala Node.js desde https://nodejs.org/
2. Durante la instalación, asegúrate de marcar "Add to PATH"
3. Reinicia tu PC
4. Abre una nueva ventana de CMD/PowerShell
5. Verifica: `node --version`

---

### ❌ "mpv is not recognized as an internal or external command"

**Causa**: MPV no está en el PATH del sistema.

**Solución Rápida**:
1. Descarga mpv.exe
2. Copia el archivo a: `C:\Windows\System32\`
3. Abre una nueva terminal
4. Verifica: `mpv --version`

**Solución Correcta (Recomendada)**:
1. Crea la carpeta: `C:\Program Files\mpv\`
2. Extrae todos los archivos de MPV ahí
3. Agrega al PATH:
   - `Win + X` → "Sistema"
   - "Configuración avanzada del sistema"
   - "Variables de entorno"
   - En "Variables del sistema", selecciona "Path"
   - "Editar" → "Nuevo"
   - Agrega: `C:\Program Files\mpv\`
   - "Aceptar" en todo
4. Reinicia la terminal
5. Verifica: `mpv --version`

---

### ❌ "yt-dlp is not recognized as an internal or external command"

**Causa**: yt-dlp no está en el PATH.

**Solución Más Fácil**:
1. Descarga `yt-dlp.exe` desde: https://github.com/yt-dlp/yt-dlp/releases
2. Muévelo a: `C:\Windows\System32\`
3. Verifica: `yt-dlp --version`

**Solución Alternativa**:
1. Crea la carpeta: `C:\Tools\`
2. Coloca `yt-dlp.exe` ahí
3. Agrega `C:\Tools\` al PATH (mismo proceso que MPV)
4. Reinicia la terminal

---

### ❌ "npm install" falla con errores

**Posibles causas y soluciones**:

**Error de permisos:**
```cmd
# Ejecuta CMD como Administrador
npm install
```

**Caché corrupto:**
```cmd
npm cache clean --force
npm install
```

**Conexión a internet:**
- Verifica tu conexión
- Desactiva temporalmente VPN/Proxy
- Intenta con otro DNS (ej: 8.8.8.8)

**Node_modules corrupto:**
```cmd
rmdir /s /q node_modules
npm install
```

---

## 🔊 Problemas de Audio

### ❌ No se escucha audio en Discord

**Checklist completo**:

1. **Verificar Virtual Cable**:
   - Click derecho en el icono de volumen
   - "Configuración de sonido"
   - Verifica que "CABLE Input" aparezca en dispositivos de salida
   - Si no aparece, reinstala VB-Audio Virtual Cable

2. **Configuración de Discord (Cuenta DJ)**:
   - Abre Discord con la cuenta DJ
   - Configuración → Voz y Video
   - **Dispositivo de Entrada**: "CABLE Output (VB-Audio Virtual Cable)"
   - **Modo de Entrada**: "Actividad de voz"
   - **Desactiva**:
     - Cancelación de Eco
     - Supresión de Ruido
     - Ganancia Automática
   - **Sensibilidad**: Al mínimo (completamente a la izquierda)

3. **En el Panel Web**:
   - Asegúrate de seleccionar "CABLE Input" (con ⭐)
   - Si no aparece en la lista, haz clic en "Recargar Dispositivos"

4. **Verificar volumen de Windows**:
   - Click derecho en volumen → "Mezclador de volumen"
   - Verifica que CABLE Input no esté silenciado
   - Sube el volumen de CABLE Input al 100%

5. **Prueba de audio directa**:
   ```cmd
   # Reproduce un test con MPV directamente
   mpv --audio-device=help
   # Busca el ID de CABLE Input
   
   mpv --audio-device=wasapi/... test.mp3
   ```

---

### ❌ El audio se escucha distorsionado o con eco

**Causa**: Cancelación de eco o supresión de ruido activos.

**Solución**:
1. En Discord (cuenta DJ) → Configuración → Voz y Video
2. Desactiva **TODO** en "Configuración Avanzada":
   - ❌ Cancelación de Eco
   - ❌ Supresión de Ruido
   - ❌ Ganancia Automática
3. Reinicia Discord completamente
4. Vuelve a unirte a la llamada

---

### ❌ Audio con cortes o interrupciones

**Causas posibles**:

**1. CPU/RAM sobrecargados:**
- Cierra programas innecesarios
- Baja la calidad de voz en Discord (96 kbps)
- Reduce la calidad del stream de YouTube

**2. Conexión a internet:**
- Verifica tu velocidad: https://fast.com
- Cierra otros programas que usen internet
- Si usas WiFi, acércate al router o usa cable Ethernet

**3. Buffer de MPV muy pequeño:**
En `server.js`, modifica los argumentos de MPV:
```javascript
const mpvArgs = [
    '--no-video',
    '--audio-device=' + audioDevice,
    '--volume=100',
    '--ytdl-format=bestaudio',
    '--cache=yes',                    // Agregar
    '--demuxer-max-bytes=150M',       // Agregar
    '--demuxer-max-back-bytes=75M',   // Agregar
    url
];
```

---

### ❌ No se detecta "CABLE Input" en el panel web

**Solución**:

1. Verifica que VB-Audio Virtual Cable esté instalado
2. Reinicia tu PC si acabas de instalarlo
3. En el panel web, haz clic en "Recargar Dispositivos"
4. Si sigue sin aparecer, ejecuta en CMD:
   ```cmd
   mpv --audio-device=help
   ```
   Busca líneas que contengan "CABLE"

---

## 🌐 Problemas de Conexión

### ❌ "Cannot connect to WebSocket"

**Causa**: El servidor no está corriendo o hay un problema de firewall.

**Solución**:

1. **Verifica que el servidor esté corriendo**:
   ```cmd
   npm start
   ```
   Deberías ver el mensaje de inicio

2. **Verifica los puertos**:
   ```cmd
   netstat -ano | findstr :3000
   netstat -ano | findstr :3001
   ```
   Si están ocupados:
   - Cierra el programa que los está usando
   - O cambia los puertos en `server.js` y `app.js`

3. **Firewall de Windows**:
   - Panel de Control → Windows Defender Firewall
   - "Permitir una aplicación a través del firewall"
   - Busca "Node.js" y márcalo para redes privadas y públicas

4. **Antivirus**:
   - Temporalmente desactiva el antivirus
   - Si funciona, agrega una excepción para Node.js

---

### ❌ No puedo acceder desde otro dispositivo en la red

**Solución**:

1. **Encuentra tu IP local**:
   ```cmd
   ipconfig
   ```
   Busca "Dirección IPv4" (ej: 192.168.1.100)

2. **Configura el servidor**:
   En `server.js`, cambia:
   ```javascript
   app.listen(PORT, '0.0.0.0', () => {
   ```
   
   En lugar de solo:
   ```javascript
   app.listen(PORT, () => {
   ```

3. **Firewall**:
   - Permite las conexiones entrantes en el puerto 3000
   - Windows Defender Firewall → Configuración avanzada
   - Regla de entrada → Puerto → TCP 3000

4. **Accede desde el otro dispositivo**:
   ```
   http://192.168.1.100:3000
   ```
   (Usa tu IP)

---

## 🎵 Problemas de Reproducción

### ❌ "Error al reproducir" / "Failed to play"

**Posibles causas**:

**1. URL inválida**:
- Verifica que la URL sea de YouTube
- Formato válido: `https://www.youtube.com/watch?v=...`
- O: `https://youtu.be/...`

**2. Video no disponible**:
- El video puede estar bloqueado por región
- El video puede ser privado o eliminado
- Intenta con otro video

**3. yt-dlp desactualizado**:
```cmd
# En Windows, descarga la última versión:
# https://github.com/yt-dlp/yt-dlp/releases
# Reemplaza el archivo yt-dlp.exe
```

**4. Problemas de red**:
- Verifica tu conexión a internet
- Intenta: `yt-dlp -F "URL"` en CMD para probar

---

### ❌ Playlists no funcionan

**Causa**: MPV solo reproduce el primer video por defecto.

**Solución**:
En `server.js`, modifica los argumentos de MPV:
```javascript
const mpvArgs = [
    '--no-video',
    '--audio-device=' + audioDevice,
    '--volume=100',
    '--ytdl-format=bestaudio',
    '--playlist=yes',  // Agregar esta línea
    url
];
```

---

### ❌ "spawn mpv ENOENT"

**Causa**: Node.js no puede encontrar el ejecutable de MPV.

**Solución**:

**Windows**:
1. Asegúrate de que MPV esté en el PATH
2. Verifica: `where mpv` en CMD
3. Si no aparece nada, vuelve a agregarlo al PATH
4. Reinicia la terminal/PC

**Alternativa - Ruta absoluta**:
En `server.js`, cambia:
```javascript
currentProcess = spawn('mpv', mpvArgs);
```

Por:
```javascript
currentProcess = spawn('C:\\Program Files\\mpv\\mpv.exe', mpvArgs);
```

---

## 💬 Problemas de Discord

### ❌ "Mi cuenta DJ sigue sin transmitir audio"

**Verificación exhaustiva**:

1. **Prueba con otro usuario**:
   - Pídele a alguien que te diga si escuchan algo
   - A veces el problema es solo con tu audio

2. **Verifica que realmente estás transmitiendo**:
   - En la llamada de Discord, deberías ver el ícono de micrófono
   - El anillo alrededor del avatar de tu DJ debería iluminarse

3. **Prueba el micrófono virtual**:
   - Abre la grabadora de voz de Windows
   - Selecciona "CABLE Output" como micrófono
   - Reproduce música con MPV → CABLE Input
   - Graba
   - Reproduce la grabación
   - Si no se grabó nada, el problema es Virtual Cable

4. **Reinstala Virtual Cable**:
   - Desinstala VB-Audio Virtual Cable
   - Reinicia PC
   - Reinstala
   - Reinicia PC de nuevo

---

### ❌ "Me escucho a mí mismo (eco)"

**Causa**: Estás monitoreando tu propio audio.

**Solución**:
- En Discord, asegúrate de estar silenciado en tu cuenta principal
- O desactiva el monitor de audio de CABLE Output en Windows:
  1. Panel de Control → Sonido
  2. Pestaña "Grabación"
  3. CABLE Output → Propiedades
  4. Pestaña "Escuchar"
  5. Desmarca "Escuchar este dispositivo"

---

### ❌ "Mi cuenta DJ aparece como silenciada en Discord"

**Solución**:
- Asegúrate de que el micrófono no esté silenciado en Discord
- Verifica que la sensibilidad esté al mínimo
- Desactiva "Detectar automáticamente sensibilidad"

---

## ⚡ Problemas de Rendimiento

### ❌ Alto uso de CPU

**Causas y soluciones**:

**1. Múltiples instancias de MPV**:
```cmd
# Cierra todos los procesos de MPV:
taskkill /F /IM mpv.exe
```

**2. Calidad de video muy alta**:
En `server.js`, reduce la calidad:
```javascript
const mpvArgs = [
    '--no-video',
    '--audio-device=' + audioDevice,
    '--volume=100',
    '--ytdl-format=bestaudio[abr<=128]',  // Limita a 128kbps
    url
];
```

**3. Demasiadas pestañas del navegador**:
- Cierra pestañas innecesarias
- Usa solo un cliente conectado al panel

---

### ❌ Lag en el panel web

**Solución**:
- Limpia el caché del navegador
- Usa Chrome o Edge (mejor rendimiento)
- Cierra otros sitios web pesados

---

## 🆘 Último Recurso: Reset Completo

Si nada funciona, prueba esto:

```cmd
# 1. Detén el servidor (Ctrl + C)

# 2. Elimina node_modules
rmdir /s /q node_modules

# 3. Limpia caché de npm
npm cache clean --force

# 4. Reinstala dependencias
npm install

# 5. Verifica requisitos
check-requirements.bat

# 6. Reinicia tu PC

# 7. Inicia el servidor de nuevo
npm start
```

---

## 📞 Registro de Diagnóstico

Para reportar un problema, incluye esta información:

```cmd
# Versiones instaladas
node --version
npm --version
mpv --version
yt-dlp --version

# Estado de los puertos
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# Dispositivos de audio de MPV
mpv --audio-device=help

# Logs del servidor
# (Copia el output de la terminal cuando inicias npm start)
```

---

## ✅ Checklist de Diagnóstico Rápido

Antes de buscar ayuda, verifica:

- [ ] ¿Node.js instalado? (`node --version`)
- [ ] ¿MPV instalado? (`mpv --version`)
- [ ] ¿yt-dlp instalado? (`yt-dlp --version`)
- [ ] ¿Virtual Cable instalado? (Verifica en "Configuración de sonido")
- [ ] ¿Servidor corriendo? (`npm start` sin errores)
- [ ] ¿Discord configurado? (Micrófono en CABLE Output)
- [ ] ¿Dispositivo seleccionado? (CABLE Input en el panel)
- [ ] ¿Cuenta DJ en la llamada? (Realmente conectado)
- [ ] ¿Firewall permitiendo Node.js? (Especialmente para acceso remoto)

---

**Si sigues teniendo problemas**, revisa los logs de la consola donde está corriendo el servidor (`npm start`). Los errores ahí suelen indicar exactamente qué está fallando.
