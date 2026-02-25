const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;

const app = express();
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'player-state.json');
const CONFIG_FILE = path.join(__dirname, 'server-config.json');
const TUNNEL_URL_FILE = path.join(__dirname, 'tunnel-url.txt');

// Variable global para la URL del túnel
let tunnelUrl = '';

// Configuración del servidor (compartida con todos los clientes)
let serverConfig = {
  backendUrl: '',      // URL pública del backend (túnel de Cloudflare)
  audioDevice: '',     // Dispositivo de audio seleccionado
  ionosApiUrl: ''      // URL del API en IONOS para publicar automáticamente
};

// Cargar configuración del servidor
function loadServerConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      serverConfig = { ...serverConfig, ...data };
      console.log('[Config] Configuración cargada:', serverConfig);
    }
  } catch (error) {
    console.log('[Config] Error cargando configuración:', error.message);
  }
}

// Guardar configuración del servidor
function saveServerConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(serverConfig, null, 2));
    console.log('[Config] Configuración guardada');
  } catch (error) {
    console.log('[Config] Error guardando configuración:', error.message);
  }
}

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

// ===== SOPORTE PARA SUNO.COM =====

function isSunoUrl(url) {
  return /suno\.com\/song\/[0-9a-f-]+/i.test(url);
}

// Fetch simple de una página HTTPS usando el módulo https ya importado
function fetchPageHtml(pageUrl) {
  return new Promise((resolve, reject) => {
    const req = https.get(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      // Seguir redirecciones
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPageHtml(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout al cargar página de Suno'));
    });
  });
}

async function getSunoInfo(url) {
  const match = url.match(/suno\.com\/song\/([0-9a-f-]+)/i);
  if (!match) throw new Error('URL de Suno inválida');

  const songId = match[1];
  const audioUrl = `https://cdn1.suno.ai/${songId}.mp3`;
  let title = `Suno ${songId.substring(0, 8)}`;

  try {
    const html = await fetchPageHtml(`https://suno.com/song/${songId}`);
    // Buscar og:title primero
    const ogMatch = html.match(/property="og:title"\s+content="([^"]+)"/i) ||
                    html.match(/content="([^"]+)"\s+property="og:title"/i);
    if (ogMatch) {
      title = ogMatch[1].replace(/\s*[|–\-]\s*Suno.*$/i, '').trim();
    } else {
      // Fallback a <title>
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].replace(/\s*[|–\-]\s*Suno.*$/i, '').trim();
    }
  } catch (e) {
    console.log('[Suno] No se pudo obtener título, usando ID:', e.message);
  }

  console.log(`[Suno] ID: ${songId} | Título: "${title}" | Audio: ${audioUrl}`);
  return { title, audioUrl, duration: 0 };
}

// Extrae el ID de un vídeo de YouTube desde cualquier formato de URL
function extractYouTubeVideoId(url) {
  const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
    || url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Obtiene hasta 25 canciones del mix automático de YouTube para un vídeo
async function getYouTubeMix(videoId) {
  const mixUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;
  console.log(`[Mix] Obteniendo mix: ${mixUrl}`);
  const args = [
    '--js-runtimes', 'node',
    '--dump-json',
    '--no-download',
    '--flat-playlist',
    '--playlist-end', '25',
    mixUrl
  ];
  const output = await ytDlpWrap.execPromise(args);
  const lines = output.trim().split('\n').filter(l => l.trim());
  return lines.map(l => JSON.parse(l));
}

// Detecta si el input es una URL válida o texto libre
function isUrl(input) {
  return /^https?:\/\//i.test(input) || /^www\./i.test(input);
}

// Busca en YouTube el resultado más relevante para una consulta de texto
async function searchYouTube(query) {
  console.log(`[YT Search] Buscando: "${query}"`);
  const args = [
    '--js-runtimes', 'node',
    '--dump-json',
    '--no-download',
    '--flat-playlist',
    `ytsearch1:${query}`
  ];
  const output = await ytDlpWrap.execPromise(args);
  const lines = output.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) throw new Error('No se encontraron resultados en YouTube');

  const result = JSON.parse(lines[0]);
  const videoUrl = result.webpage_url
    || result.url
    || (result.id ? `https://www.youtube.com/watch?v=${result.id}` : null);

  if (!videoUrl) throw new Error('Resultado de búsqueda sin URL válida');

  console.log(`[YT Search] ✅ Encontrado: "${result.title}" → ${videoUrl}`);
  return {
    info: { title: result.title, duration: result.duration || 0 },
    playUrl: videoUrl
  };
}

// Resuelve cualquier input y devuelve { info, playUrl }
// - Suno URL:     bypasa yt-dlp, playUrl = CDN MP3 directo
// - YouTube URL:  usa yt-dlp, playUrl = url original
// - Texto libre:  busca en YouTube el resultado más relevante
async function resolveTrackInfo(input) {
  if (isSunoUrl(input)) {
    const suno = await getSunoInfo(input);
    return {
      info: { title: suno.title, duration: 0 },
      playUrl: suno.audioUrl
    };
  }
  if (!isUrl(input)) {
    return await searchYouTube(input);
  }
  const info = await getVideoInfoWithArgs(input);
  return { info, playUrl: input };
}

// ===== FIN SOPORTE SUNO =====

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
let isStartingPlayback = false; // Lock para evitar reproducciones simultáneas
let cachedAudioDevices = []; // Cache de dispositivos de audio

// Función para cargar dispositivos de audio (usado al inicio y para refrescar)
function loadAudioDevices() {
  return new Promise((resolve) => {
    console.log('[Audio-Devices] Cargando dispositivos...');
    const mpvProcess = spawn('mpv', ['--audio-device=help'], { shell: true });

    let output = '';
    let errorOutput = '';

    const timeout = setTimeout(() => {
      console.log('[Audio-Devices] Timeout cargando dispositivos');
      mpvProcess.kill();
      resolve([]);
    }, 10000);

    mpvProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    mpvProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    mpvProcess.on('close', () => {
      clearTimeout(timeout);
      const fullOutput = output || errorOutput;
      const devices = [];
      const lines = fullOutput.split('\n');

      lines.forEach(line => {
        line = line.trim();
        const match = line.match(/^'([^']+)'\s*\((.+)\)$/);
        if (match) {
          devices.push({
            id: match[1],
            name: match[2].trim()
          });
        }
      });

      console.log(`[Audio-Devices] ${devices.length} dispositivo(s) encontrado(s)`);
      cachedAudioDevices = devices;
      resolve(devices);
    });

    mpvProcess.on('error', () => {
      clearTimeout(timeout);
      console.log('[Audio-Devices] Error ejecutando MPV');
      resolve([]);
    });
  });
}

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

  // Enviar configuración del servidor
  ws.send(JSON.stringify({
    type: 'config',
    data: {
      backendUrl: serverConfig.backendUrl,
      audioDevice: serverConfig.audioDevice || savedAudioDevice
    }
  }));

  // Cuando un cliente se desconecta, solo registrar (la música sigue sonando)
  ws.on('close', () => {
    activeConnections--;
    console.log(`Cliente WebSocket desconectado (${activeConnections} activos)`);
    // La música sigue reproduciéndose aunque no haya clientes conectados
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
      if (audioDevice && audioDevice.trim()) {
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

    const getInfoPromise = resolveTrackInfo(url);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: la fuente tardó más de 30s')), 30000)
    );

    const { info, playUrl } = await Promise.race([getInfoPromise, timeoutPromise]);
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

        // Insertar el resto al FRENTE de la cola (antes de lo que ya había)
        const restEntries = [];
        for (let i = 1; i < info.entries.length; i++) {
          const entry = info.entries[i];
          if (entry && entry.url) {
            restEntries.push({
              url: entry.url,
              title: entry.title || `Video ${i}`,
              addedAt: Date.now()
            });
          }
        }
        queue.unshift(...restEntries);
        
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
        // Hay algo sonando: insertar toda la playlist al frente de la cola sin interrumpir
        const newEntries = info.entries
          .filter(e => e && e.url)
          .map(e => ({ url: e.url, title: e.title || 'Desconocido', addedAt: Date.now() }));
        queue.unshift(...newEntries);
        console.log(`[Play] Playlist añadida al frente de la cola: ${newEntries.length} canciones`);
        broadcastStatus();
        res.json({
          success: true,
          message: `${newEntries.length} canciones añadidas al frente de la cola`,
          queue: queue.length
        });
      }
    } else {
      // Es un solo video
      const videoTitle = info?.title || 'Desconocido';
      
      if (currentSong.status === 'playing') {
        // Hay algo sonando: insertar al principio de la cola (siguiente canción)
        queue.unshift({
          url: playUrl,
          title: videoTitle,
          addedAt: Date.now()
        });
        console.log(`[Play] Añadido al frente de la cola: ${videoTitle}`);
        broadcastStatus();
        res.json({
          success: true,
          message: `"${videoTitle}" sonará a continuación`,
          queue: queue.length
        });
      } else {
        // No hay nada sonando: reproducir inmediatamente
        stopCurrentPlayback(true, true);

        try {
          console.log(`[Play] Reproduciendo: ${videoTitle}`);
          const mpvStart = Date.now();
          await playWithMPV(playUrl, savedAudioDevice, videoTitle);
          const mpvTime = Date.now() - mpvStart;
          const totalTime = Date.now() - startTime;
          console.log(`[Play] ✅ Total: ${totalTime}ms (yt-dlp: ${infoTime}ms, mpv: ${mpvTime}ms)`);

          res.json({
            success: true,
            message: 'Reproducción iniciada',
            song: { url: url, title: videoTitle }
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

// POST: Reproducir canción + generar playlist de mix automático en la cola
app.post('/api/play-with-mix', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL o búsqueda requerida' });

  try {
    // 1. Resolver el input (texto de búsqueda, URL de YouTube o Suno)
    console.log('[Mix] Resolviendo input:', url);
    const { info: baseInfo, playUrl: basePlayUrl } = await resolveTrackInfo(url);
    console.log(`[Mix] Base: "${baseInfo.title}" → ${basePlayUrl}`);

    // 2. Intentar extraer el video ID para construir el mix de YouTube
    const videoId = extractYouTubeVideoId(basePlayUrl);

    const isPlaying = currentSong.status === 'playing';

    if (!videoId) {
      // No es YouTube (ej: Suno) → sin mix disponible
      console.log('[Mix] No es un vídeo de YouTube, reproduciendo sin mix');
      if (isPlaying) {
        // Insertar al frente sin interrumpir
        queue.unshift({ url: basePlayUrl, title: baseInfo.title, addedAt: Date.now() });
        broadcastStatus();
        return res.json({
          success: true,
          message: `"${baseInfo.title}" sonará a continuación (mix no disponible)`,
          mixSize: 0
        });
      } else {
        stopCurrentPlayback(true, true);
        await playWithMPV(basePlayUrl, savedAudioDevice, baseInfo.title);
        return res.json({
          success: true,
          message: `Reproduciendo "${baseInfo.title}" (mix no disponible para esta fuente)`,
          mixSize: 0
        });
      }
    }

    // 3. Obtener el mix automático de YouTube (máx 25 canciones)
    let mixEntries = [];
    try {
      mixEntries = await getYouTubeMix(videoId);
      console.log(`[Mix] ${mixEntries.length} canciones obtenidas del mix`);
    } catch (mixError) {
      console.log('[Mix] No se pudo obtener el mix:', mixError.message);
    }

    // 4. Si algo suena → insertar mix al frente sin interrumpir
    //    Si no suena → detener y reproducir inmediatamente
    if (isPlaying) {
      // Construir todas las entradas del mix y meterlas al frente
      const mixQueue = mixEntries.map((entry, i) => {
        const entryUrl = entry.webpage_url
          || entry.url
          || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);
        return entryUrl ? { url: entryUrl, title: entry.title || `Canción ${i + 1}`, addedAt: Date.now() } : null;
      }).filter(Boolean);

      if (mixQueue.length === 0) {
        // Sin entradas válidas: al menos añadir la canción base al frente
        queue.unshift({ url: basePlayUrl, title: baseInfo.title, addedAt: Date.now() });
      } else {
        queue.unshift(...mixQueue);
      }

      console.log(`[Mix] ${mixQueue.length} canciones añadidas al frente de la cola`);
      broadcastStatus();
      res.json({
        success: true,
        message: `Mix de ${mixQueue.length} canciones añadido al frente de la cola`,
        mixSize: mixQueue.length
      });
    } else {
      // Nada sonando: reproducir primera canción e insertar el resto al frente
      stopCurrentPlayback(true, true);

      if (mixEntries.length > 0) {
        const first = mixEntries[0];
        const firstUrl = first.webpage_url
          || first.url
          || (first.id ? `https://www.youtube.com/watch?v=${first.id}` : null);
        const firstTitle = first.title || baseInfo.title;

        if (!firstUrl) throw new Error('Primera entrada del mix sin URL válida');

        // Insertar el resto al frente (antes de lo que ya había en cola)
        const restQueue = [];
        for (let i = 1; i < mixEntries.length; i++) {
          const entry = mixEntries[i];
          const entryUrl = entry.webpage_url
            || entry.url
            || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);
          if (entryUrl) {
            restQueue.push({ url: entryUrl, title: entry.title || `Canción ${i}`, addedAt: Date.now() });
          }
        }
        queue.unshift(...restQueue);

        await playWithMPV(firstUrl, savedAudioDevice, firstTitle);
        res.json({
          success: true,
          message: `Reproduciendo "${firstTitle}" + ${restQueue.length} canciones en cola`,
          mixSize: mixEntries.length
        });
      } else {
        // Sin mix: reproducir la canción base directamente
        await playWithMPV(basePlayUrl, savedAudioDevice, baseInfo.title);
        res.json({
          success: true,
          message: `Reproduciendo "${baseInfo.title}" (no se encontró mix relacionado)`,
          mixSize: 0
        });
      }
    }

  } catch (error) {
    console.error('[Mix] Error:', error.message);
    res.status(500).json({ error: 'Error al crear la playlist', details: error.message });
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
    const { info, playUrl } = await resolveTrackInfo(url);

    if (info.entries && info.entries.length > 1) {
      // Es una playlist (solo YouTube)
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
      // Video/canción única
      queue.push({
        url: playUrl,
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

// POST: Guardar dispositivo de audio predeterminado
app.post('/api/audio-device', (req, res) => {
  const { audioDevice } = req.body;

  if (audioDevice !== undefined) {
    savedAudioDevice = audioDevice;
    serverConfig.audioDevice = audioDevice;
    saveState();
    saveServerConfig();
    broadcastStatus(); // Notificar a todos los clientes
    console.log('[Audio-Device] Dispositivo guardado:', audioDevice);
    res.json({ success: true, audioDevice: savedAudioDevice });
  } else {
    res.status(400).json({ error: 'audioDevice requerido' });
  }
});

// GET: Obtener configuración del servidor
app.get('/api/config', (req, res) => {
  res.json({
    backendUrl: serverConfig.backendUrl || tunnelUrl,
    audioDevice: serverConfig.audioDevice || savedAudioDevice
  });
});

// GET: Obtener solo la URL del túnel (para IONOS)
app.get('/api/tunnel-url', (req, res) => {
  res.json({
    tunnelUrl: tunnelUrl || serverConfig.backendUrl,
    active: !!cloudflaredProcess
  });
});

// POST: Guardar configuración del servidor
app.post('/api/config', (req, res) => {
  const { backendUrl, audioDevice } = req.body;

  if (backendUrl !== undefined) {
    serverConfig.backendUrl = backendUrl;
  }
  if (audioDevice !== undefined) {
    serverConfig.audioDevice = audioDevice;
    savedAudioDevice = audioDevice;
  }

  saveServerConfig();
  broadcastConfig(); // Notificar a todos los clientes
  console.log('[Config] Configuración actualizada:', serverConfig);
  res.json({ success: true, config: serverConfig });
});

// Broadcast de configuración a todos los clientes
function broadcastConfig() {
  const configData = JSON.stringify({
    type: 'config',
    data: {
      backendUrl: serverConfig.backendUrl,
      audioDevice: serverConfig.audioDevice || savedAudioDevice
    }
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(configData);
    }
  });
}

// GET: Listar dispositivos de audio disponibles (usa caché)
app.get('/api/audio-devices', async (req, res) => {
  const refresh = req.query.refresh === 'true';

  if (refresh || cachedAudioDevices.length === 0) {
    console.log('[Audio-Devices] Refrescando lista de dispositivos...');
    await loadAudioDevices();
  }

  console.log(`[Audio-Devices] Enviando ${cachedAudioDevices.length} dispositivo(s) (desde caché)`);
  res.json({ devices: cachedAudioDevices });
});

// Cargar estado y configuración al iniciar
loadServerConfig();
loadState();

// Sincronizar audioDevice entre config y state
if (serverConfig.audioDevice) {
  savedAudioDevice = serverConfig.audioDevice;
} else if (savedAudioDevice) {
  serverConfig.audioDevice = savedAudioDevice;
  saveServerConfig();
}

// ===== CLOUDFLARED TUNNEL =====
let cloudflaredProcess = null;

function startCloudflared() {
  return new Promise((resolve) => {
    console.log('[Cloudflared] Iniciando túnel...');

    cloudflaredProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
      shell: true
    });

    let urlFound = false;

    const processOutput = (data) => {
      const output = data.toString();

      // Buscar la URL del túnel en el output
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (urlMatch && !urlFound) {
        urlFound = true;
        tunnelUrl = urlMatch[0];
        console.log('[Cloudflared] ✅ Túnel activo:', tunnelUrl);

        // Guardar URL en archivo local
        fs.writeFileSync(TUNNEL_URL_FILE, tunnelUrl);

        // Actualizar configuración del servidor
        serverConfig.backendUrl = tunnelUrl;
        saveServerConfig();

        // Publicar a IONOS
        publishTunnelUrl(tunnelUrl);

        resolve(tunnelUrl);
      }

      // Mostrar logs de cloudflared
      if (output.trim()) {
        output.split('\n').forEach(line => {
          if (line.trim()) console.log('[Cloudflared]', line.trim());
        });
      }
    };

    cloudflaredProcess.stdout.on('data', processOutput);
    cloudflaredProcess.stderr.on('data', processOutput);

    cloudflaredProcess.on('error', (error) => {
      console.error('[Cloudflared] Error:', error.message);
      resolve(null);
    });

    cloudflaredProcess.on('close', (code) => {
      console.log('[Cloudflared] Proceso cerrado con código:', code);
      cloudflaredProcess = null;
    });

    // Timeout si no encuentra la URL en 30 segundos
    setTimeout(() => {
      if (!urlFound) {
        console.error('[Cloudflared] Timeout esperando URL del túnel');
        resolve(null);
      }
    }, 30000);
  });
}

// Publicar URL del túnel a IONOS usando HTTPS nativo
function publishTunnelUrl(tunnelUrlToPublish) {
  const ionosUrl = serverConfig.ionosApiUrl || 'https://dj.mingod.es/api/config.php';

  console.log('[Publish] Publicando URL a IONOS:', ionosUrl);

  const postData = JSON.stringify({ backendUrl: tunnelUrlToPublish });

  const urlParts = new URL(ionosUrl);
  const options = {
    hostname: urlParts.hostname,
    port: 443,
    path: urlParts.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('[Publish] ✅ URL publicada correctamente en IONOS');
        console.log('[Publish] Respuesta:', data);
      } else {
        console.log('[Publish] Error HTTP:', res.statusCode, data);
      }
    });
  });

  req.on('error', (error) => {
    console.log('[Publish] Error de conexión:', error.message);
  });

  req.write(postData);
  req.end();
}

// Cerrar cloudflared al salir
function stopCloudflared() {
  if (cloudflaredProcess) {
    console.log('[Cloudflared] Cerrando túnel...');
    if (process.platform === 'win32') {
      exec(`taskkill /F /T /PID ${cloudflaredProcess.pid}`, () => {});
    } else {
      cloudflaredProcess.kill('SIGTERM');
    }
    cloudflaredProcess = null;
  }
}

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

// ===== CONFIGURACIÓN INTERACTIVA AL INICIO =====
async function selectCableInputDevice() {
  console.log('\n[Audio] Buscando dispositivo CABLE Input (VB-Audio)...');

  let devices = [];
  try {
    devices = await loadAudioDevices();
  } catch (err) {
    console.error('\n╔════════════════════════════════════════════════════════════╗');
    console.error('║  ❌ ERROR: No se pudo listar dispositivos de audio         ║');
    console.error('╠════════════════════════════════════════════════════════════╣');
    console.error('║  MPV no está instalado o no se encuentra en el PATH.      ║');
    console.error('║  Instala MPV con: winget install mpv                      ║');
    console.error('╚════════════════════════════════════════════════════════════╝');
    process.exit(1);
  }

  if (devices.length === 0) {
    console.error('\n╔════════════════════════════════════════════════════════════╗');
    console.error('║  ❌ ERROR: MPV no pudo listar dispositivos de audio        ║');
    console.error('╠════════════════════════════════════════════════════════════╣');
    console.error('║  Posibles causas:                                         ║');
    console.error('║    - MPV no está instalado correctamente                  ║');
    console.error('║    - No hay dispositivos de audio en el sistema           ║');
    console.error('║  Solución: ejecuta INSTALL.bat o winget install mpv       ║');
    console.error('╚════════════════════════════════════════════════════════════╝');
    process.exit(1);
  }

  // Buscar primero "cable input" (match exacto), luego cualquier "cable"
  const cableDevice = devices.find(d => d.name.toLowerCase().includes('cable input'))
                   || devices.find(d => d.name.toLowerCase().includes('cable'));

  if (!cableDevice) {
    console.error('\n╔════════════════════════════════════════════════════════════╗');
    console.error('║  ❌ ERROR: CABLE Input (VB-Audio) no encontrado            ║');
    console.error('╠════════════════════════════════════════════════════════════╣');
    console.error('║  Dispositivos de audio detectados:                        ║');
    devices.forEach(d => {
      const name = d.name.substring(0, 50).padEnd(50);
      console.error(`║    · ${name} ║`);
    });
    console.error('╠════════════════════════════════════════════════════════════╣');
    console.error('║  VB-Audio Virtual Cable no está instalado.                ║');
    console.error('║  Descarga e instala desde: https://vb-audio.com/Cable/   ║');
    console.error('║  Tras instalarlo, reinicia el PC y vuelve a iniciar.     ║');
    console.error('╚════════════════════════════════════════════════════════════╝');
    process.exit(1);
  }

  savedAudioDevice = cableDevice.id;
  serverConfig.audioDevice = cableDevice.id;
  saveServerConfig();
  saveState();

  console.log(`[Audio] ✅ Dispositivo seleccionado: ${cableDevice.name}`);
  return cableDevice.id;
}

// Iniciar servidor (HTTP + WebSocket en el mismo puerto)
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     🎵 Discord DJ Web Controller - Servidor Iniciado 🎵    ║
╠════════════════════════════════════════════════════════════╣
║  Servidor HTTP+WS:  http://localhost:${PORT}                  ║
║  Cola restaurada:   ${String(queue.length).padEnd(2)} canciones                      ║
╚════════════════════════════════════════════════════════════╝
  `);

  // 1. Seleccionar CABLE Input automáticamente
  await selectCableInputDevice();

  // 2. Iniciar cloudflared
  console.log('\n[Startup] Iniciando túnel de Cloudflare...');
  const url = await startCloudflared();

  if (url) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  ✅ TODO LISTO                                             ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  URL Pública: ${url.padEnd(43)}║
║  Audio:       ${(savedAudioDevice || 'Por defecto').substring(0, 43).padEnd(43)}║
║                                                            ║
║  Comparte la URL o accede desde tu web                    ║
║  Presiona Ctrl+C para detener                             ║
╚════════════════════════════════════════════════════════════╝
    `);
  } else {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  ⚠️  TÚNEL NO DISPONIBLE                                   ║
╠════════════════════════════════════════════════════════════╣
║  Cloudflared no está instalado o falló al iniciar.        ║
║  Instala con: winget install Cloudflare.cloudflared       ║
║  El servidor funciona localmente en localhost:${PORT}        ║
╚════════════════════════════════════════════════════════════╝
    `);
  }
});

// Manejo de cierre graceful
process.on('SIGINT', () => {
  console.log('\nCerrando servidor...');
  stopCurrentPlayback();
  stopCloudflared();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nCerrando servidor...');
  stopCurrentPlayback();
  stopCloudflared();
  process.exit(0);
});
