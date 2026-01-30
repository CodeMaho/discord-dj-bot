# Solucion de Problemas

Guia para resolver problemas comunes.

## Problemas de Instalacion

### "INSTALL.bat no hace nada" o "Se cierra inmediatamente"

**Causa**: Falta winget o permisos de administrador.

**Solucion**:
1. Click derecho en INSTALL.bat → Ejecutar como administrador
2. Si winget no esta disponible, instalalo desde Microsoft Store (busca "App Installer")
3. Reinicia Windows e intenta de nuevo

### "Node.js/MPV/yt-dlp no encontrado" despues de instalar

**Causa**: La terminal no tiene el PATH actualizado.

**Solucion**:
1. Cierra todas las terminales
2. Abre una nueva terminal
3. Verifica de nuevo: `node --version`

Si sigue sin funcionar, reinicia Windows.

### Error durante npm install

**Solucion**:
```powershell
# Limpiar cache
npm cache clean --force

# Eliminar node_modules
rmdir /s /q node_modules

# Reinstalar
npm install
```

---

## Problemas de Audio

### No se escucha musica en Discord

**Checklist**:

1. **VB-Cable instalado?**
   - Panel de Control → Sonido → Reproduccion
   - Debe aparecer "CABLE Input"
   - Si no aparece, reinstala VB-Cable y reinicia PC

2. **Discord configurado?**
   - Cuenta DJ → Configuracion → Voz y Video
   - Dispositivo de Entrada: CABLE Output
   - Sensibilidad al minimo
   - Cancelacion de eco: DESACTIVADA
   - Supresion de ruido: DESACTIVADA

3. **Dispositivo correcto en el panel web?**
   - Selecciona "CABLE Input" (con estrella)
   - Si no aparece, click en "Recargar Dispositivos"

4. **Cuenta DJ en la llamada?**
   - La cuenta DJ debe estar conectada a la llamada
   - No silenciada

### El audio se reproduce pero en el dispositivo equivocado

**Causa**: No seleccionaste CABLE Input en el panel web.

**Solucion**:
1. En el panel web, busca el selector "Dispositivo de Audio"
2. Selecciona "CABLE Input (VB-Audio Virtual Cable)"
3. Vuelve a reproducir

### Audio distorsionado o con eco

**Solucion**:
En Discord (cuenta DJ) → Voz y Video:
- Desactiva "Cancelacion de Eco"
- Desactiva "Supresion de Ruido"
- Desactiva "Ganancia Automatica"

### Audio con cortes

**Posibles causas**:
- Conexion a internet lenta
- CPU sobrecargada
- Muchos programas abiertos

**Solucion**:
- Cierra programas innecesarios
- Usa cable Ethernet en vez de WiFi
- Reduce calidad en Discord (96 kbps)

---

## Problemas de Conexion

### "No se puede conectar al servidor"

**Solucion**:
1. Verifica que START-DJ.bat este corriendo
2. Verifica que el servidor inicio correctamente (debe decir "Servidor iniciado")
3. Intenta http://localhost:3000 en el navegador

### WebSocket se desconecta constantemente

**Causa**: El servidor no esta corriendo o hay problemas de red.

**Solucion**:
1. Reinicia START-DJ.bat
2. Si usas un tunel, verifica que siga activo
3. Recarga la pagina web (Ctrl+F5)

### No puedo acceder desde otro dispositivo

**Solucion para acceso local (misma red)**:
1. Encuentra tu IP: `ipconfig` → Direccion IPv4
2. Permite Node.js en Windows Firewall
3. Accede a `http://TU_IP:3000`

**Solucion para acceso remoto (internet)**:
1. Usa el tunel de Cloudflare (START-DJ.bat lo crea automaticamente)
2. Copia la URL que aparece (https://xxx.trycloudflare.com)
3. Usa esa URL desde cualquier lugar

### La URL del tunel cambia cada vez

**Esto es normal**. Cloudflare Quick Tunnels generan URLs temporales.

**Para URL permanente**:
1. Crea cuenta en Cloudflare (gratis)
2. Configura un tunel permanente con tu dominio
3. Documentacion: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/

---

## Problemas de Reproduccion

### "Error al reproducir" o video no carga

**Posibles causas**:
1. URL invalida
2. Video privado o eliminado
3. yt-dlp desactualizado

**Solucion**:
```powershell
# Actualizar yt-dlp
yt-dlp -U

# Probar URL manualmente
yt-dlp -F "URL_DEL_VIDEO"
```

### Playlists no funcionan

**Solucion**: Las playlists funcionan automaticamente. Verifica:
1. La URL es de una playlist de YouTube
2. La playlist no es privada
3. yt-dlp esta actualizado

### "spawn mpv ENOENT"

**Causa**: MPV no esta en el PATH.

**Solucion**:
```powershell
# Verificar MPV
mpv --version

# Si falla, reinstalar
winget install mpv.net

# Reiniciar terminal
```

---

## Problemas con el Panel Web

### El panel no carga o esta en blanco

**Solucion**:
1. Verifica que el servidor este corriendo
2. Limpia cache del navegador (Ctrl+Shift+Delete)
3. Intenta en modo incognito
4. Prueba otro navegador

### Los botones no responden

**Causa**: WebSocket no conectado.

**Solucion**:
1. Mira el indicador de conexion (arriba a la derecha)
2. Si dice "Desconectado", recarga la pagina
3. Verifica que el servidor siga corriendo

### La configuracion del backend no se guarda

**Solucion**:
1. Verifica que no tengas bloqueado localStorage en el navegador
2. La URL debe ser completa (https://xxx.trycloudflare.com)
3. Click en "Guardar" despues de pegar la URL

---

## Problemas con Discord

### La cuenta DJ aparece silenciada

**Solucion**:
1. En Discord, click en el icono de microfono para activarlo
2. Verifica que CABLE Output este seleccionado como entrada
3. Baja la sensibilidad al minimo

### Echo o me escucho a mi mismo

**Causa**: Estas monitoreando el audio.

**Solucion**:
1. Panel de Control → Sonido → Grabacion
2. CABLE Output → Propiedades → Escuchar
3. Desmarca "Escuchar este dispositivo"

### La cuenta DJ no se conecta a la llamada

**Solucion**: Esto es manual. Debes:
1. Abrir Discord con la cuenta DJ
2. Unirte a la llamada/canal de voz
3. Dejar Discord abierto (puede estar minimizado)

---

## Comandos de Diagnostico

Ejecuta estos comandos para verificar el estado:

```powershell
# Versiones instaladas
node --version
npm --version
mpv --version
yt-dlp --version
cloudflared --version

# Dispositivos de audio
mpv --audio-device=help

# Puertos en uso
netstat -ano | findstr :3000

# Probar reproduccion manual
mpv --no-video "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

---

## Reset Completo

Si nada funciona, intenta un reset completo:

```powershell
# 1. Cerrar todo
# Cierra START-DJ.bat y cualquier terminal

# 2. Eliminar node_modules
cd discord-dj-bot
rmdir /s /q node_modules

# 3. Limpiar npm
npm cache clean --force

# 4. Reinstalar
npm install

# 5. Reiniciar PC

# 6. Ejecutar INSTALL.bat de nuevo

# 7. Ejecutar START-DJ.bat
```

---

## Obtener Ayuda

Si sigues teniendo problemas:

1. Revisa los logs en la terminal donde corre START-DJ.bat
2. Copia el error completo
3. Verifica que seguiste todos los pasos de instalacion
4. Abre un issue en GitHub con:
   - Sistema operativo
   - Mensaje de error completo
   - Pasos que seguiste
   - Output de los comandos de diagnostico
