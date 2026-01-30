const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const http = require('http');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;

const app = express();
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'player-state.json');

// Crear servidor HTTP para compartir con WebSocket
const server = http.createServer(app);

// Middleware - CORS configurado para permitir cualquier origen (necesario para arquitectura híbrida)
app.use(cors({
  origin: true, // Permitir cualquier origen
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Single instance de YTDlpWrap (evitar memory leaks)
// Configurar para usar Node.js como runtime de JavaScript (requerido por YouTube)
const ytDlpWrap = new YTDlpWrap();

// Función helper para obtener info del video con argumentos correctos
async function getVideoInfoWithArgs(url) {
  const args = [
    '--js-runtimes', 'node',
    '--dump-json',
    '--no-download',
    '--flat-playlist',
    url
  ];
  const output = await ytDlpWrap.execPromise(args);
  // Puede devolver múltiples JSONs (uno por línea para playlists)
  const lines = output.trim().split('\n').filter(l => l.trim());
  if (lines.length === 1) {
    return JSON.parse(lines[0]);
  }
  // Es una playlist, devolver como objeto con entries
  const entries = lines.map(l => JSON.parse(l));
  return { entries, _type: 'playlist' };
}

// Estado global
let currentProcess = null;
let queue = []; // Cola de reproducción
let currentSong = {
  url: '',
  title: 'Ninguna',
  status: 'stopped',
  index: -1,
  duration: 0,
  startedAt: null
};
let savedAudioDevice = '';
let activeConnections = 0;
let manualStop = false; // Flag para diferenciar stop manual vs finalización natural
let disconnectTimer = null; // Timer para grace period al desconectar
let isStartingPlayback = false; // Lock para evitar reproducciones simultáneas

// WebSocket para actualizaciones en tiempo real (mismo servidor HTTP)
const wss = new WebSocket.Server({ server });

// Guardar estado en archivo
function saveState() {
  const state = {
    queue,
    currentSong,
    audioDevice: savedAudioDevice
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.log('Error guardando estado:', error.message);
  }
}

// Cargar estado desde archivo
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      queue = state.queue || [];
      savedAudioDevice = state.audioDevice || '';

      // NO restaurar estado "playing" porque MPV no está ejecutándose al reiniciar
      // Solo restaurar la cola y el dispositivo de audio
      if (state.currentSong) {
        // Resetear a stopped porque no hay proceso MPV activo
        currentSong = {
          ...state.currentSong,
          status: 'stopped'
        };
        console.log(`Estado cargado - última canción: ${currentSong.title} (detenida)`);
      }

      console.log(`Estado cargado: ${queue.length} canciones en cola, dispositivo: ${savedAudioDevice || 'ninguno'}`);
    }
  } catch (error) {
    console.log('Error cargando estado:', error.message);
  }
}

// Broadcast a todos los clientes conectados
function broadcastStatus() {
  // Calcular tiempo transcurrido si está reproduciendo
  let elapsedSeconds = 0;
  if (currentSong?.status === 'playing' && currentSong?.startedAt) {
    elapsedSeconds = Math.floor((Date.now() - currentSong.startedAt) / 1000);
  }
  
  const statusData = JSON.stringify({
    type: 'status',
    data: {
      currentSong: {
        ...currentSong,
        elapsed: elapsedSeconds
      },
      queue,
      queueLength: queue.length
    }
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(statusData);
    }
  });
  
  saveState();
}

wss.on('connection', (ws) => {
  activeConnections++;
  console.log(`Cliente WebSocket conectado (${activeConnections} activos)`);

  // Cancelar timer de desconexión si existe (cliente se reconectó a tiempo)
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
    console.log('Reconexión detectada - cancelando auto-stop');
  }

  // Enviar estado actual al conectarse
  ws.send(JSON.stringify({
    type: 'status',
    data: {
      currentSong,
      queue,
      queueLength: queue.length,
      audioDevice: savedAudioDevice
    }
  }));

  // Solo detener si no hay más clientes conectados (con grace period)
  ws.on('close', () => {
    activeConnections--;
    console.log(`Cliente WebSocket desconectado (${activeConnections} activos)`);

    // Grace period de 5 segundos antes de detener (permite recargar página)
    if (activeConnections === 0) {
      console.log('No hay clientes activos - esperando 5s antes de detener...');
      disconnectTimer = setTimeout(() => {
        if (activeConnections === 0) {
          console.log('Sin reconexión después de 5s - Deteniendo reproducción');
          stopCurrentPlayback();
        }
        disconnectTimer = null;
      }, 5000);
    }
  });
});


// Función para detener reproducción actual
function stopCurrentPlayback(skipBroadcast = false, isManualStop = true) {
  if (currentProcess) {
    try {
      console.log('Deteniendo reproducción MPV...');
      // Marcar como stop manual para evitar auto-play
      if (isManualStop) {
        manualStop = true;
      }

      const pid = currentProcess.pid;

      // En Windows, usar taskkill para matar el proceso y sus hijos
      if (process.platform === 'win32' && pid) {
        exec(`taskkill /F /T /PID ${pid}`, (error) => {
          // Ignorar error si el proceso ya no existe
          if (error && !error.message.includes('no se encontr')) {
            console.log('taskkill error (ignorado):', error.message);
          }
        });
      } else {
        try {
          currentProcess.kill('SIGKILL');
        } catch (e) {}
      }
      currentProcess = null;
    } catch (error) {
      console.log('Error al detener proceso:', error.message);
      currentProcess = null;
    }
  }

  currentSong.status = 'stopped';
  currentSong.title = 'Ninguna';
  currentSong.url = '';
  currentSong.index = -1;

  if (!skipBroadcast) {
    broadcastStatus();
  }
}

// Reproducir siguiente canción de la cola
async function playNext(audioDevice) {
  if (queue.length === 0) {
    console.log('Cola vacía');
    stopCurrentPlayback(false, false); // No es stop manual, queremos broadcast
    return;
  }
  
  const nextSong = queue.shift();
  console.log(`Reproduciendo siguiente: ${nextSong.title}`);
  
  try {
    await playWithMPV(nextSong.url, audioDevice, nextSong.title);
  } catch (error) {
    console.error('Error reproduciendo siguiente:', error);
    // Si falla, intentar con la siguiente si hay más en la cola
    if (queue.length > 0) {
      console.log('Saltando a siguiente canción debido a error...');
      // Esperar 1 segundo antes de intentar siguiente
      await new Promise(resolve => setTimeout(resolve, 1000));
      await playNext(audioDevice);
    } else {
      // Si no hay más, detener
      stopCurrentPlayback();
    }
  }
}

// Función para reproducir con MPV
async function playWithMPV(url, audioDevice, title = null) {
  // Verificar si ya hay una reproducción iniciándose
  if (isStartingPlayback) {
    console.log('[MPV] Ya hay una reproducción iniciándose, ignorando...');
    return Promise.resolve();
  }

  // Matar proceso existente si hay uno
  if (currentProcess) {
    console.log('[MPV] Matando proceso existente antes de iniciar nuevo...');
    try {
      const pid = currentProcess.pid;
      if (process.platform === 'win32' && pid) {
        exec(`taskkill /F /T /PID ${pid}`, () => {});
      } else {
        currentProcess.kill('SIGKILL');
      }
    } catch (e) {}
    currentProcess = null;
    // Pequeña pausa para asegurar que el proceso se cierre
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  isStartingPlayback = true;

  return new Promise((resolve, reject) => {

    const startPlayback = (videoTitle, duration = 0) => {
      currentSong.title = videoTitle;
      currentSong.url = url;
      currentSong.status = 'playing';
      currentSong.duration = duration;
      currentSong.startedAt = Date.now();
      broadcastStatus();
      
      const mpvArgs = [
        '--no-video',
        '--volume=100',
        '--ytdl-format=bestaudio'
      ];
      
      // Solo agregar dispositivo de audio si es válido
      if (audioDevice && audioDevice.trim() && !audioDevice.includes('{')) {
        mpvArgs.push('--audio-device=' + audioDevice);
      }
      
      mpvArgs.push(url);
      
      console.log('===== Iniciando reproducción =====');
      console.log('Título:', videoTitle);
      console.log('Dispositivo:', audioDevice);
      console.log('Argumentos MPV:', mpvArgs);

      const thisProcess = spawn('mpv', mpvArgs, { shell: true });
      currentProcess = thisProcess;
      isStartingPlayback = false; // Liberar lock una vez que el proceso inició

      thisProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.log(`[MPV stdout] ${output}`);
      });

      thisProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.log(`[MPV stderr] ${output}`);
      });

      thisProcess.on('close', (code) => {
        console.log(`[MPV] Proceso cerrado con código: ${code}`);

        // Solo actualizar estado si este proceso sigue siendo el actual
        if (currentProcess === thisProcess) {
          currentProcess = null;
          currentSong.status = 'stopped';

          if (manualStop) {
            console.log('[MPV] Stop manual detectado - NO auto-play');
            manualStop = false;
            broadcastStatus();
          } else if (queue.length > 0) {
            console.log('[Auto-play] Reproduciendo siguiente canción...');
            playNext(audioDevice).catch(error => {
              console.error('[Auto-play] Error:', error.message);
              broadcastStatus();
            });
          } else {
            broadcastStatus();
          }
        } else {
          console.log('[MPV] Proceso antiguo cerrado, ignorando');
          if (manualStop) manualStop = false;
        }

        resolve();
      });

      thisProcess.on('error', (error) => {
        console.error('===== ERROR AL INICIAR MPV =====');
        console.error('Mensaje:', error.message);
        console.error('Código de error:', error.code);
        if (error.path) console.error('Path buscado:', error.path);
        console.error('Dispositivo:', audioDevice);
        console.error('Argumentos:', mpvArgs);
        
        currentSong.status = 'error';
        currentSong.errorMessage = error.message;
        isStartingPlayback = false; // Liberar lock en error
        broadcastStatus();
        reject(error);
      });
    };

    if (title) {
      startPlayback(title, 0);
    } else {
      getVideoInfoWithArgs(url)
        .then(info => {
          const duration = info?.duration || 0;
          startPlayback(info?.title || 'Desconocido', duration);
        })
        .catch(error => {
          console.error('Error obteniendo info del video:', error);
          isStartingPlayback = false; // Liberar lock en error
          reject(error);
        });
    }
  });
}

// API Endpoints

// GET: Estado actual
app.get('/api/status', (req, res) => {
  res.json({
    currentSong,
    queue,
    queueLength: queue.length,
    audioDevice: savedAudioDevice
  });
});

// POST: Reproducir canción o playlist
app.post('/api/play', async (req, res) => {
  const { url, audioDevice } = req.body;
  const startTime = Date.now();
  
  if (!url) {
    return res.status(400).json({ error: 'URL requerida' });
  }
  
  savedAudioDevice = audioDevice || savedAudioDevice;
  
  try {
    // Usar instancia global de YTDlpWrap (evitar memory leak)
    
    // Verificar si es una playlist con TIMEOUT de 30 segundos
    console.log('[Play] INICIO - Obteniendo información del video (max 30s)...');
    const infoStart = Date.now();

    const getInfoPromise = getVideoInfoWithArgs(url);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: YouTube tardó más de 30s (bloqueado o conexión lenta)')), 30000)
    );
    
    const info = await Promise.race([getInfoPromise, timeoutPromise]);
    const infoTime = Date.now() - infoStart;
    console.log(`[Play] ✅ Info obtenida en ${infoTime}ms`);
    
    // Validar que info existe
    if (!info) {
      return res.status(400).json({ error: 'No se pudo obtener información del video' });
    }
    
    if (info.entries && info.entries.length > 1) {
      // Es una playlist
      console.log(`[Playlist] Detectada: ${info.entries.length} videos`);
      
      // Si no hay nada reproduciéndose, reproducir el primero
      if (currentSong.status !== 'playing') {
        const firstVideo = info.entries[0];
        
        // Validar que el primer video tiene propiedades necesarias
        if (!firstVideo || !firstVideo.url) {
          return res.status(400).json({ 
            error: 'Primer video de playlist inválido' 
          });
        }
        
        stopCurrentPlayback(true, true); // skipBroadcast=true, isManualStop=true (evitar auto-play)

        // Agregar el resto a la cola ANTES de reproducir
        for (let i = 1; i < info.entries.length; i++) {
          const entry = info.entries[i];
          if (entry && entry.url) {
            queue.push({
              url: entry.url,
              title: entry.title || `Video ${i}`,
              addedAt: Date.now()
            });
          }
        }
        
        // Reproducir el primero (sin setTimeout)
        try {
          await playWithMPV(
            firstVideo.url, 
            savedAudioDevice, 
            firstVideo.title || `Video 1`
          );
          
          // Respuesta de éxito SOLO si llegó aquí
          res.json({ 
            success: true, 
            message: `Playlist agregada: ${info.entries.length} canciones`,
            queue: queue.length
          });
        } catch (error) {
          console.error('[Playlist Error] Error reproduciendo primer video:', error.message);
          // Respuesta de error
          res.status(500).json({ 
            error: 'Error al reproducir primer video', 
            details: error.message
          });
        }
      } else {
        // Agregar todos a la cola
        info.entries.forEach(entry => {
          queue.push({
            url: entry.url,
            title: entry.title,
            addedAt: Date.now()
          });
        });
        
        broadcastStatus();
        res.json({ 
          success: true, 
          message: `Playlist agregada: ${info.entries.length} canciones`,
          queue: queue.length
        });
      }
    } else {
      // Es un solo video
      const videoTitle = info?.title || 'Desconocido';
      
      if (currentSong.status === 'playing') {
        // Agregar a la cola
        queue.push({
          url: url,
          title: videoTitle,
          addedAt: Date.now()
        });
        console.log(`[Queue] Video agregado: ${videoTitle}`);
        broadcastStatus();
        res.json({ 
          success: true, 
          message: 'Canción agregada a la cola',
          queue: queue.length
        });
      } else {
        // Reproducir inmediatamente (sin setTimeout)
        stopCurrentPlayback(true, true); // skipBroadcast=true, isManualStop=true (evitar auto-play)

        try {
          console.log(`[Play] Reproduciendo: ${videoTitle}`);
          const mpvStart = Date.now();
          await playWithMPV(url, savedAudioDevice, videoTitle);
          const mpvTime = Date.now() - mpvStart;
          const totalTime = Date.now() - startTime;
          console.log(`[Play] ✅ Total: ${totalTime}ms (yt-dlp: ${infoTime}ms, mpv: ${mpvTime}ms)`);
          
          res.json({ 
            success: true, 
            message: 'Reproducción iniciada',
            song: {
              url: url,
              title: videoTitle
            }
          });
        } catch (error) {
          console.error('[Play Error]', error.message);
          res.status(500).json({ 
            error: 'Error al iniciar reproducción', 
            details: error.message 
          });
        }
      }
    }
  } catch (error) {
    res.status(500).json({ 
      error: 'Error al procesar URL', 
      details: error.message 
    });
  }
});

// POST: Detener reproducción
app.post('/api/stop', (req, res) => {
  stopCurrentPlayback();
  res.json({ 
    success: true, 
    message: 'Reproducción detenida' 
  });
});

// POST: Saltar a la siguiente canción
app.post('/api/skip', async (req, res) => {
  if (queue.length === 0) {
    return res.status(400).json({ error: 'No hay canciones en la cola' });
  }

  // isManualStop=true para evitar que el evento close también llame a playNext
  stopCurrentPlayback(true, true);

  try {
    // Esperar a que el proceso termine
    await new Promise(resolve => setTimeout(resolve, 500));
    await playNext(savedAudioDevice);

    res.json({
      success: true,
      message: 'Saltando a la siguiente canción'
    });
  } catch (error) {
    console.error('Error saltando:', error);
    res.status(500).json({
      error: 'Error al saltar canción',
      details: error.message
    });
  }
});

// GET: Obtener cola
app.get('/api/queue', (req, res) => {
  res.json({ queue, length: queue.length });
});

// POST: Añadir canción a la cola (sin reproducir)
app.post('/api/queue', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL requerida' });
  }

  try {
    console.log('[Queue Add] Obteniendo info del video...');
    const info = await getVideoInfoWithArgs(url);

    if (info.entries && info.entries.length > 1) {
      // Es una playlist
      info.entries.forEach(entry => {
        if (entry && entry.url) {
          queue.push({
            url: entry.url,
            title: entry.title || 'Desconocido',
            addedAt: Date.now()
          });
        }
      });
      broadcastStatus();
      res.json({
        success: true,
        message: `Playlist añadida: ${info.entries.length} canciones`,
        queueLength: queue.length
      });
    } else {
      // Video único
      queue.push({
        url: url,
        title: info?.title || 'Desconocido',
        addedAt: Date.now()
      });
      broadcastStatus();
      res.json({
        success: true,
        message: `Añadido a la cola: ${info?.title || 'Desconocido'}`,
        queueLength: queue.length
      });
    }
  } catch (error) {
    console.error('[Queue Add] Error:', error.message);
    res.status(500).json({
      error: 'Error al añadir a la cola',
      details: error.message
    });
  }
});

// DELETE: Eliminar canción de la cola
app.delete('/api/queue/:index', (req, res) => {
  const index = parseInt(req.params.index);
  
  if (index < 0 || index >= queue.length) {
    return res.status(400).json({ error: 'Índice inválido' });
  }
  
  const removed = queue.splice(index, 1);
  broadcastStatus();
  
  res.json({ 
    success: true, 
    message: 'Canción eliminada de la cola',
    removed: removed[0]
  });
});

// POST: Limpiar cola
app.post('/api/queue/clear', (req, res) => {
  queue = [];
  broadcastStatus();
  
  res.json({ 
    success: true, 
    message: 'Cola limpiada' 
  });
});

// GET: Listar dispositivos de audio disponibles
app.get('/api/audio-devices', (req, res) => {
  console.log('[Audio-Devices] 📡 Iniciando búsqueda de dispositivos...');
  
  // Obtener dispositivos de audio válidos
  const mpvProcess = spawn('mpv', ['--audio-device=help'], { shell: true });
  
  let output = '';
  let errorOutput = '';
  let responded = false; // Flag para evitar doble respuesta
  
  const sendResponse = (devices) => {
    if (!responded) {
      responded = true;
      console.log(`[Audio-Devices] ✅ Enviando ${devices.length} dispositivo(s)`);
      res.json({ devices });
    }
  };
  
  // Timeout de 5 segundos para evitar bloqueos
  const timeout = setTimeout(() => {
    console.log('[Audio-Devices] ⚠️ TIMEOUT - MPV no respondió en 5 segundos');
    sendResponse([]);
    mpvProcess.kill();
  }, 5000);

  mpvProcess.stdout.on('data', (data) => {
    const chunk = data.toString().trim();
    output += chunk + '\n';
    if (chunk.length > 0) {
      console.log('[MPV stdout]', chunk);
    }
  });
  
  mpvProcess.stderr.on('data', (data) => {
    const chunk = data.toString().trim();
    errorOutput += chunk + '\n';
    if (chunk.length > 0) {
      console.log('[MPV stderr]', chunk);
    }
  });
  
  mpvProcess.on('close', (code) => {
    clearTimeout(timeout);
    console.log(`[Audio-Devices] Process cerrado con código: ${code}`);
    
    const fullOutput = output || errorOutput;
    const devices = [];
    const lines = fullOutput.split('\n');
    
    // Parsear salida de MPV
    lines.forEach(line => {
      line = line.trim();
      
      // Buscar líneas con formato: 'device-id' (Description)
      // Ejemplo: 'wasapi/{...}' (CABLE Input (VB-Audio Virtual Cable))
      const match = line.match(/^'([^']+)'\s*\((.+)\)$/);
      if (match) {
        const deviceId = match[1];
        const deviceName = match[2].trim();
        
        devices.push({
          id: deviceId,
          name: deviceName
        });
      }
    });
    
    console.log(`[Audio-Devices] 📊 Total: ${devices.length} dispositivo(s) detectado(s)`);
    devices.forEach((dev, idx) => {
      console.log(`  [${idx + 1}] ${dev.name}`);
    });
    
    sendResponse(devices);
  });
  
  mpvProcess.on('error', (error) => {
    console.error('[Audio-Devices] ❌ Error al iniciar MPV:', error.message);
    console.error('[Audio-Devices] Código de error:', error.code);
    clearTimeout(timeout);
    sendResponse([]);
  });
});

// Cargar estado al iniciar
loadState();

// ===== INTERVALO DE BROADCAST EN TIEMPO REAL =====
// Enviar actualización de estado cada 500ms mientras se está reproduciendo
setInterval(() => {
  if (currentSong?.status === 'playing' && activeConnections > 0) {
    // Recalcular elapsed
    let elapsedSeconds = 0;
    if (currentSong.startedAt) {
      elapsedSeconds = Math.floor((Date.now() - currentSong.startedAt) / 1000);
    }
    
    // Enviar status a todos los clientes
    const statusData = JSON.stringify({
      type: 'status',
      data: {
        currentSong: {
          ...currentSong,
          elapsed: elapsedSeconds
        },
        queue,
        queueLength: queue.length
      }
    });
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(statusData);
      }
    });
  }
}, 500);

// Iniciar servidor (HTTP + WebSocket en el mismo puerto)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     🎵 Discord DJ Web Controller - Servidor Iniciado 🎵    ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Servidor HTTP+WS:  http://localhost:${PORT}                  ║
║  WebSocket:         ws://localhost:${PORT}                    ║
║                                                            ║
║  Panel de Control:  http://localhost:${PORT}                  ║
║                                                            ║
║  Cola restaurada:   ${queue.length} canciones                       ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║  Modo Híbrido:                                             ║
║  • Listo para túnel (Cloudflare/ngrok)                    ║
║  • HTTP y WebSocket en el mismo puerto                    ║
║  • CORS habilitado para cualquier origen                  ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Manejo de cierre graceful
process.on('SIGINT', () => {
  console.log('\nCerrando servidor...');
  stopCurrentPlayback();
  process.exit(0);
});
