# 🚀 Guía de Instalación Rápida - Windows 11

Esta guía te llevará paso a paso para tener tu Discord DJ funcionando en menos de 15 minutos.

---

## 📥 PASO 1: Descargar e Instalar Software Base

### 1.1 Node.js
1. Ve a: https://nodejs.org/
2. Descarga la versión **LTS (recomendada)**
3. Ejecuta el instalador
4. ✅ Marca **todas las opciones** durante la instalación
5. Reinicia tu PC después de instalar

**Verificar instalación:**
```cmd
node --version
npm --version
```

---

### 1.2 MPV Player

**Opción A - Instalador automático (Recomendado):**
1. Ve a: https://mpv.io/installation/
2. Busca **"mpv-install.bat"** o descarga desde: https://sourceforge.net/projects/mpv-player-windows/files/
3. Descarga el archivo `.7z` más reciente
4. Extrae el contenido a: `C:\Program Files\mpv\`
5. Agrega al PATH:
   - Presiona `Win + X` → "Sistema"
   - Click en "Configuración avanzada del sistema"
   - "Variables de entorno"
   - En "Variables del sistema", selecciona "Path" → "Editar"
   - "Nuevo" → Pega: `C:\Program Files\mpv\`
   - "Aceptar" en todo

**Opción B - Con Chocolatey:**
```cmd
# Si tienes Chocolatey instalado:
choco install mpv
```

**Verificar instalación:**
```cmd
mpv --version
```

---

### 1.3 yt-dlp

1. Ve a: https://github.com/yt-dlp/yt-dlp/releases
2. Descarga: **yt-dlp.exe** (el archivo .exe solo)
3. Opciones para instalarlo:

**Opción A - Moverlo a System32 (Más fácil):**
- Mueve `yt-dlp.exe` a: `C:\Windows\System32\`
- ⚠️ Necesitarás permisos de administrador

**Opción B - Crear carpeta dedicada:**
- Crea la carpeta: `C:\Tools\`
- Mueve `yt-dlp.exe` ahí
- Agrega `C:\Tools\` al PATH (mismo proceso que MPV)

**Verificar instalación:**
```cmd
yt-dlp --version
```

---

### 1.4 VB-Audio Virtual Cable

1. Ve a: https://vb-audio.com/Cable/
2. Descarga: **VBCABLE_Driver_Pack43.zip** (o versión más reciente)
3. Extrae el ZIP
4. **Click derecho** en `VBCABLE_Setup_x64.exe`
5. "Ejecutar como administrador"
6. Sigue el asistente de instalación
7. ⚠️ **REINICIA TU PC** (esto es importante)

**Verificar instalación:**
- Después de reiniciar, click derecho en el icono de volumen
- "Configuración de sonido"
- En "Dispositivos de salida" debería aparecer **"CABLE Input"**

---

## 📁 PASO 2: Configurar el Proyecto

### 2.1 Descargar el proyecto

1. Crea una carpeta, por ejemplo: `C:\Discord-DJ\`
2. Descarga todos los archivos del proyecto ahí
3. Deberías tener esta estructura:
   ```
   C:\Discord-DJ\
   ├── package.json
   ├── server.js
   ├── README.md
   ├── .gitignore
   └── public/
       ├── index.html
       ├── styles.css
       └── app.js
   ```

### 2.2 Instalar dependencias

1. Abre **PowerShell** o **CMD**
2. Navega a la carpeta:
   ```cmd
   cd C:\Discord-DJ
   ```
3. Instala las dependencias:
   ```cmd
   npm install
   ```
   
   Esto tomará 1-2 minutos.

---

## ⚙️ PASO 3: Configurar Discord

### 3.1 Preparar la Cuenta DJ

1. **Opción A**: Crea una nueva cuenta de Discord
2. **Opción B**: Usa una cuenta secundaria que ya tengas

### 3.2 Configurar el Audio en Discord

1. Abre Discord con tu **cuenta DJ** (la secundaria)
2. Ve a **Configuración de Usuario** (⚙️, abajo a la izquierda)
3. En el menú lateral, selecciona **"Voz y Video"**
4. Realiza estos ajustes:

   **Dispositivo de Entrada:**
   - Selecciona: **"CABLE Output (VB-Audio Virtual Cable)"**
   
   **Modo de Entrada:**
   - Marca: **"Actividad de voz"**
   
   **Configuración Avanzada:**
   - ❌ Desactiva: "Cancelación de Eco"
   - ❌ Desactiva: "Supresión de Ruido"
   - ❌ Desactiva: "Ganancia Automática"
   
   **Sensibilidad de Entrada:**
   - ❌ Desactiva: "Detectar automáticamente la sensibilidad de entrada"
   - Mueve el control deslizante **completamente a la izquierda** (al mínimo)

5. Haz clic en **"Guardar Cambios"**

### 3.3 Verificar Configuración de Windows

1. Click derecho en el **icono de volumen** (bandeja del sistema)
2. "Configuración de sonido"
3. Scroll hasta abajo → "Configuración avanzada de sonido"
4. Verifica que **CABLE Input** esté visible y **no esté silenciado**

---

## 🎮 PASO 4: Iniciar el Sistema

### 4.1 Arrancar el Servidor

1. Abre **PowerShell** o **CMD** en la carpeta del proyecto:
   ```cmd
   cd C:\Discord-DJ
   ```

2. Inicia el servidor:
   ```cmd
   npm start
   ```

3. Deberías ver:
   ```
   ╔════════════════════════════════════════════════════════════╗
   ║     🎵 Discord DJ Web Controller - Servidor Iniciado 🎵    ║
   ╠════════════════════════════════════════════════════════════╣
   ║  Servidor HTTP:     http://localhost:3000                  ║
   ║  Panel de Control:  http://localhost:3000                  ║
   ╚════════════════════════════════════════════════════════════╝
   ```

### 4.2 Abrir el Panel Web

1. Abre tu navegador (Chrome, Firefox, Edge)
2. Ve a: `http://localhost:3000`
3. Deberías ver el panel de control con diseño oscuro

---

## 🎵 PASO 5: Primera Prueba

### 5.1 Unirse a una Llamada

**Con tu cuenta principal:**
1. Inicia una llamada privada con alguien
2. O únete a un canal de voz en un servidor

**Con tu cuenta DJ:**
1. Únete a la misma llamada/canal
2. Deja esta ventana abierta (puede estar minimizada)

### 5.2 Reproducir Música

1. En el **panel web** (`http://localhost:3000`):

2. **Selecciona el dispositivo de audio:**
   - En el selector, elige: **"CABLE Input (VB-Audio Virtual Cable)"**
   - Aparecerá con una estrella ⭐

3. **Copia una URL de YouTube**, por ejemplo:
   ```
   https://www.youtube.com/watch?v=dQw4w9WgXcQ
   ```

4. **Pega la URL** en el campo de texto

5. **Click en "Reproducir"** ▶️

6. ✅ **La música debería empezar a sonar en Discord**

### 5.3 Verificar que Funciona

- En el panel web verás el título de la canción
- El estado cambiará a "Reproduciendo"
- Todos en la llamada deberían escuchar la música

---

## 🔧 Si Algo No Funciona

### ❌ No se escucha audio en Discord

**Checklist:**
- [ ] ¿Reiniciaste el PC después de instalar Virtual Cable?
- [ ] ¿El micrófono de Discord está en "CABLE Output"?
- [ ] ¿La sensibilidad está al mínimo en Discord?
- [ ] ¿La cuenta DJ está realmente en la llamada?
- [ ] ¿Seleccionaste "CABLE Input" en el panel web?

**Prueba esto:**
1. Cierra completamente Discord
2. Reinicia Discord
3. Vuelve a configurar el micrófono
4. Reintenta la reproducción

---

### ❌ Error: "MPV not found"

1. Abre CMD y escribe:
   ```cmd
   mpv --version
   ```
   
   Si no funciona:
   - Reinstala MPV
   - Asegúrate de agregarlo al PATH
   - **Reinicia la terminal** (cierra y abre CMD de nuevo)
   - Si sigue sin funcionar, reinicia el PC

---

### ❌ Error: "yt-dlp not found"

1. Verifica:
   ```cmd
   yt-dlp --version
   ```
   
   Si no funciona:
   - Mueve `yt-dlp.exe` a `C:\Windows\System32\`
   - O agrega su ubicación al PATH
   - Reinicia la terminal

---

### ❌ El servidor no inicia

1. Verifica que Node.js esté instalado:
   ```cmd
   node --version
   ```

2. Vuelve a instalar dependencias:
   ```cmd
   cd C:\Discord-DJ
   rm -r node_modules
   npm install
   ```

3. Verifica que los puertos 3000 y 3001 no estén ocupados:
   ```cmd
   netstat -ano | findstr :3000
   netstat -ano | findstr :3001
   ```
   
   Si están ocupados, cierra el programa que los usa.

---

## 📱 Bonus: Acceder desde tu Móvil

### Encontrar tu IP local:

```cmd
ipconfig
```

Busca **"Dirección IPv4"**, algo como: `192.168.1.100`

### En tu teléfono:

1. Conéctate a la **misma red WiFi** que tu PC
2. Abre el navegador
3. Ve a: `http://192.168.1.100:3000` (usa tu IP)
4. ¡Ahora puedes controlar la música desde tu móvil!

---

## 🎉 ¡Listo!

Ya tienes tu **Discord DJ Web Controller** funcionando.

**Resumen de lo que tienes:**
- ✅ Panel web para controlar música
- ✅ Compatible con YouTube y playlists
- ✅ Acceso desde cualquier dispositivo en tu red
- ✅ Sin riesgo de baneo (no usas bots)
- ✅ Calidad de audio excelente

---

## 📚 Siguiente Paso

Lee el **README.md** completo para:
- Entender cómo funciona el sistema
- Ver todas las funciones disponibles
- Solucionar problemas avanzados
- Personalizar la configuración

---

**¿Necesitas ayuda?** Revisa la documentación completa en `README.md`

**¡Disfruta tu Radio Station en Discord! 🎵🎧**
