const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const YTDlpWrap = require('yt-dlp-wrap').default;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const STATE_FILE      = path.join(__dirname, 'data',   'player-state.json');
const CONFIG_FILE     = path.join(__dirname, 'config', 'server-config.json');
const TUNNEL_URL_FILE = path.join(__dirname, 'data',   'tunnel-url.txt');
const USERS_FILE      = path.join(__dirname, 'data',   'users.json');

// ===== SISTEMA DE AUTENTICACIÓN =====

let users = [];
const sessions = new Map(); // token → { userId, username, locationLabel, expiresAt }

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (e) { users = []; }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.log('[Auth] Error guardando usuarios:', e.message);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  try {
    const test = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch { return false; }
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getClientIp(req) {
  return (req.headers['cf-connecting-ip']
    || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || '127.0.0.1').replace(/^::ffff:/, '');
}

function getIpLocation(ip) {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return Promise.resolve({ country: 'Local', countryCode: 'LOCAL', region: 'LOCAL', city: 'Local', isLocal: true });
  }
  return new Promise((resolve) => {
    const ipReq = http.get(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,query`,
      (ipRes) => {
        let data = '';
        ipRes.on('data', c => data += c);
        ipRes.on('end', () => {
          try {
            const p = JSON.parse(data);
            if (p.status === 'success') {
              resolve({ country: p.country, countryCode: p.countryCode, region: p.region, regionName: p.regionName, city: p.city });
            } else {
              resolve(null);
            }
          } catch { resolve(null); }
        });
      }
    );
    ipReq.on('error', () => resolve(null));
    ipReq.setTimeout(5000, () => { ipReq.destroy(); resolve(null); });
  });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Sesión inválida' });
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Sesión expirada' });
  }
  req.user = session;
  next();
}

loadUsers();

// Variable global para la URL del túnel
let tunnelUrl = '';

// Configuración del servidor (compartida con todos los clientes)
let serverConfig = {
  backendUrl: '',      // URL pública del backend (túnel de Cloudflare)
  audioDevice: '',     // Dispositivo de audio seleccionado
  ionosApiUrl: '',     // URL del API en IONOS para publicar automáticamente
  ytdlpBrowser: 'chrome' // Navegador para pasar cookies a yt-dlp (chrome, firefox, edge, brave, opera, chromium)
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
app.use(express.static(path.join(__dirname, 'public')));
// /stickers servido desde public/stickers (ya cubierto por express.static)

// Single instance de YTDlpWrap (evitar memory leaks)
// Configurar para usar Node.js como runtime de JavaScript (requerido por YouTube)
const ytDlpWrap = new YTDlpWrap();

// Función helper para obtener info del video con argumentos correctos
async function getVideoInfoWithArgs(url) {
  const args = [
    '--js-runtimes', 'node',
    '--no-update',
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
      // Seguir redirecciones (resolviendo URLs relativas)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let location = res.headers.location;
        if (location.startsWith('/')) {
          try { const b = new URL(pageUrl); location = `${b.protocol}//${b.host}${location}`; } catch {}
        }
        return fetchPageHtml(location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout al cargar página'));
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
    '--no-update',
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

// ===== SOPORTE SPOTIFY =====

// Token anónimo de Spotify (válido para contenido público sin credenciales)
function getSpotifyAnonToken() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.accessToken) resolve(json.accessToken);
            else reject(new Error('Token Spotify no disponible'));
          } catch { reject(new Error('Error parseando token Spotify')); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout token Spotify')); });
  });
}

// Llama a la Spotify Web API con un token Bearer
function fetchSpotifyApi(endpoint, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.spotify.com/v1${endpoint}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'Mozilla/5.0' } },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Error parseando respuesta Spotify API')); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout Spotify API')); });
  });
}

// Extrae tipo e ID de una URL de Spotify (soporta /intl-XX/ y ?si=)
function extractSpotifyId(url) {
  const m = url.match(/\/(track|album|playlist)\/([A-Za-z0-9]+)/i);
  return m ? { type: m[1].toLowerCase(), id: m[2] } : null;
}

function isSpotifyUrl(url) {
  return /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/[A-Za-z0-9]+/i.test(url);
}

function getSpotifyType(url) {
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\//i);
  return m ? m[1].toLowerCase() : null;
}

// Devuelve una query de búsqueda "Título Artista" para un track de Spotify.
async function resolveSpotifyTrack(url) {
  // 1. Spotify anonymous API (más fiable, sin DRM)
  try {
    const extracted = extractSpotifyId(url);
    if (extracted?.id) {
      const token = await getSpotifyAnonToken();
      const data = await fetchSpotifyApi(`/tracks/${extracted.id}`, token);
      if (data?.name) {
        const artist = data.artists?.map(a => a.name).join(', ') || '';
        const q = artist ? `${data.name} ${artist}` : data.name;
        console.log(`[Spotify] API → "${q}"`);
        return q;
      }
    }
  } catch (e) {
    console.log('[Spotify] API anónima track falló:', e.message);
  }

  // 2. yt-dlp
  try {
    const args = ['--dump-json', '--no-download', '--no-update', url];
    const output = await ytDlpWrap.execPromise(args);
    const info = JSON.parse(output.trim().split('\n')[0]);
    if (info?.title) {
      const artist = Array.isArray(info.artists) ? info.artists.join(', ') : (info.artist || '');
      const q = artist ? `${info.title} ${artist}` : info.title;
      console.log(`[Spotify] yt-dlp → "${q}"`);
      return q;
    }
  } catch {}

  // 3. Scraping HTML (og:title como último recurso)
  try {
    const html = await fetchPageHtml(url);
    const ldMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        if (ld.name) {
          const byArtist = Array.isArray(ld.byArtist) ? ld.byArtist.map(a => a.name).join(', ') : (ld.byArtist?.name || '');
          return byArtist ? `${ld.name} ${byArtist}` : ld.name;
        }
      } catch {}
    }
    const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1]
                 || html.match(/content="([^"]+)"\s+property="og:title"/i)?.[1];
    if (ogTitle) { console.log(`[Spotify] og:title → "${ogTitle}"`); return ogTitle; }
  } catch (e) {
    console.log('[Spotify] Scraping HTML falló:', e.message);
  }

  throw new Error('No se pudo obtener información de la pista de Spotify');
}

// Devuelve array de queries "Título Artista" para un álbum/playlist de Spotify.
async function resolveSpotifyCollection(url) {
  console.log('[Spotify] Obteniendo colección:', url);
  const extracted = extractSpotifyId(url);

  // 1. Spotify anonymous API (método principal)
  if (extracted) {
    try {
      const token = await getSpotifyAnonToken();
      const { type, id } = extracted;
      const queries = [];

      if (type === 'playlist') {
        let offset = 0;
        while (queries.length < MAX_QUEUE) {
          const data = await fetchSpotifyApi(
            `/playlists/${id}/tracks?fields=items(track(name,artists(name))),next&limit=50&offset=${offset}`,
            token
          );
          for (const item of (data.items || [])) {
            const track = item?.track;
            if (!track?.name) continue;
            const artist = track.artists?.map(a => a.name).join(', ') || '';
            queries.push(artist ? `${track.name} ${artist}` : track.name);
            if (queries.length >= MAX_QUEUE) break;
          }
          if (!data.next || queries.length >= MAX_QUEUE) break;
          offset += 50;
        }
      } else if (type === 'album') {
        const [tracksData, albumData] = await Promise.all([
          fetchSpotifyApi(`/albums/${id}/tracks?limit=50`, token),
          fetchSpotifyApi(`/albums/${id}`, token)
        ]);
        const albumArtist = albumData.artists?.map(a => a.name).join(', ') || '';
        for (const item of (tracksData.items || [])) {
          if (!item?.name) continue;
          const artist = item.artists?.map(a => a.name).join(', ') || albumArtist;
          queries.push(artist ? `${item.name} ${artist}` : item.name);
          if (queries.length >= MAX_QUEUE) break;
        }
      }

      if (queries.length > 0) {
        console.log(`[Spotify] API extrajo ${queries.length} pistas`);
        return queries;
      }
    } catch (e) {
      console.log('[Spotify] API anónima colección falló:', e.message);
    }
  }

  // 2. yt-dlp flat-playlist (fallback)
  try {
    const args = ['--dump-json', '--no-download', '--no-update', '--flat-playlist', url];
    const output = await ytDlpWrap.execPromise(args);
    const lines = output.trim().split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      const queries = lines.map(l => {
        try {
          const e = JSON.parse(l);
          if (!e.title) return null;
          const artist = Array.isArray(e.artists) ? e.artists.join(', ') : (e.artist || e.creator || '');
          return artist ? `${e.title} ${artist}` : e.title;
        } catch { return null; }
      }).filter(Boolean);
      if (queries.length > 0) {
        console.log(`[Spotify] yt-dlp extrajo ${queries.length} pistas`);
        return queries;
      }
    }
  } catch (e) {
    console.log('[Spotify] yt-dlp colección falló:', e.message);
  }

  // 3. JSON-LD scraping (último recurso)
  try {
    const html = await fetchPageHtml(url);
    const ldMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (ldMatch) {
      const ld = JSON.parse(ldMatch[1]);
      const tracks = ld.track || ld.tracks || [];
      if (Array.isArray(tracks) && tracks.length > 0) {
        const albumArtist = Array.isArray(ld.byArtist) ? ld.byArtist.map(a => a.name).join(', ') : (ld.byArtist?.name || '');
        const queries = tracks.map(t => {
          if (!t.name) return null;
          const artist = Array.isArray(t.byArtist) ? t.byArtist.map(a => a.name).join(', ') : (t.byArtist?.name || albumArtist);
          return artist ? `${t.name} ${artist}` : t.name;
        }).filter(Boolean);
        if (queries.length > 0) {
          console.log(`[Spotify] JSON-LD extrajo ${queries.length} pistas`);
          return queries;
        }
      }
    }
  } catch {}

  throw new Error('No se pudieron obtener las pistas de Spotify. Comparte canciones individuales o usa una lista pública.');
}

// Busca en YouTube N queries de forma concurrente (lotes de 5).
// Devuelve array de { url, title, duration }.
async function batchSearchYouTube(queries, maxResults = MAX_QUEUE) {
  const limited = queries.slice(0, maxResults);
  const CONCURRENT = 5;
  const results = [];
  for (let i = 0; i < limited.length; i += CONCURRENT) {
    const batch = limited.slice(i, i + CONCURRENT);
    const batchResults = await Promise.all(
      batch.map(async q => {
        try {
          const { info, playUrl } = await searchYouTube(q);
          return { url: playUrl, title: info.title, duration: info.duration || 0 };
        } catch { return null; }
      })
    );
    results.push(...batchResults.filter(Boolean));
  }
  return results;
}

// ===== FIN SOPORTE SPOTIFY =====

// Detecta si el input es una URL válida o texto libre
function isUrl(input) {
  return /^https?:\/\//i.test(input) || /^www\./i.test(input);
}

// Busca en YouTube el resultado más relevante para una consulta de texto
async function searchYouTube(query) {
  console.log(`[YT Search] Buscando: "${query}"`);
  const args = [
    '--js-runtimes', 'node',
    '--no-update',
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
// - Spotify track:      busca en YouTube tras extraer título+artista
// - Spotify album/list: devuelve info.entries (YouTube search x pista)
// - Suno URL:           bypasa yt-dlp, playUrl = CDN MP3 directo
// - YouTube URL:        usa yt-dlp, playUrl = url original
// - Texto libre:        busca en YouTube el resultado más relevante
async function resolveTrackInfo(input) {
  if (isSpotifyUrl(input)) {
    const type = getSpotifyType(input);
    if (type === 'track') {
      const query = await resolveSpotifyTrack(input);
      console.log(`[Spotify] Buscando en YouTube: "${query}"`);
      return await searchYouTube(query);
    }
    if (type === 'album' || type === 'playlist') {
      const queries = await resolveSpotifyCollection(input);
      const limit = Math.min(queries.length, MAX_QUEUE);
      console.log(`[Spotify] Buscando ${limit} pistas en YouTube...`);
      const entries = await batchSearchYouTube(queries, limit);
      if (entries.length === 0) throw new Error('No se encontraron resultados en YouTube para las pistas de Spotify');
      return { info: { entries, _type: 'playlist' }, playUrl: null };
    }
  }
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
const MAX_QUEUE = 50; // Límite máximo de canciones en cola
let currentSong = {
  url: '',
  title: 'Ninguna',
  status: 'stopped',
  index: -1,
  duration: 0,
  startedAt: null,
  addedBy: null,
  addedLocation: null,
  addedByGif: null
};
let savedAudioDevice = '';
let activeConnections = 0;
let manualStop = false; // Flag para diferenciar stop manual vs finalización natural
let isStartingPlayback = false; // Lock para evitar reproducciones simultáneas
let cachedAudioDevices = []; // Cache de dispositivos de audio
let currentClipProcess = null;   // Proceso MPV del clip de radio
let currentClipDuckVolume = 40; // Volumen de ducking activo (para restaurar correctamente)
let currentClipLocalPath = null; // Ruta del archivo subido activo (se borra al terminar)
let historyLog = []; // Últimas 25 canciones reproducidas: { title, url, addedBy, addedLocation, playedAt }

// Función para cargar dispositivos de audio (usado al inicio y para refrescar)
function loadAudioDevices() {
  return new Promise((resolve) => {
    console.log('[Audio-Devices] Cargando dispositivos...');
    const mpvProcess = spawn('mpv', ['--audio-device=help']);

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

// ── Beat Analyzer ─────────────────────────────────────────────────────────
// Analiza el audio en tiempo real (vía ffmpeg) y emite eventos beat y waveform.
//
// SINCRONIZACIÓN DE WAVEFORM:
//   ffmpeg usa -re → procesa a velocidad 1x (no se adelanta).
//   Aun así, ffmpeg arranca unos segundos ANTES de que MPV empiece a sonar
//   (tiempo de buffering de MPV + latencia de yt-dlp).
//   Para compensarlo se usa una cola de frames con timestamp de posición:
//     · Un observador IPC mantiene currentSong.mpvActualPos actualizado en
//       tiempo real (observe_property time-pos).
//     · El dispatcher (setInterval 50 ms) solo emite los frames cuya posición
//       ≤ posición actual de MPV, alineando el waveform con el audio real.
const BeatAnalyzer = (() => {
  let proc           = null;
  let ytdlpProc      = null;
  let audioBuf       = Buffer.alloc(0);
  let avgEnergy      = 0;
  let lastBeat       = 0;
  let active         = false;
  let wChunkCount    = 0;
  let decodedSamples = 0;          // muestras decodificadas por ffmpeg
  const waveformQueue = [];        // { pos (s), bars[] } pendientes de emitir
  let dispatchId      = null;      // ID del setInterval del dispatcher
  let mpvObsClient    = null;      // conexión IPC persistente a MPV
  let mpvObsBuf       = '';

  const SAMPLE_RATE   = 11025;
  const CHUNK_SAMPLES = 512;
  const CHUNK_BYTES   = CHUNK_SAMPLES * 2;
  const THRESHOLD     = 1.15;
  const COOLDOWN_MS   = 120;
  const WAVEFORM_BARS = 64;

  // ── Observador de posición MPV ────────────────────────────────────────
  // Abre una conexión IPC persistente y suscribe observe_property time-pos.
  // MPV envía actualizaciones automáticas cada vez que avanza la posición.
  function startMpvObserver() {
    if (mpvObsClient) return;
    const pipe = process.platform === 'win32' ? '\\\\.\\pipe\\mpvdj' : '/tmp/mpvdj.sock';
    mpvObsClient = net.createConnection(pipe);
    mpvObsBuf = '';
    mpvObsClient.on('connect', () => {
      mpvObsClient.write(
        JSON.stringify({ command: ['observe_property', 99, 'time-pos'] }) + '\n'
      );
      console.log('[BeatAnalyzer] Observador IPC conectado a MPV');
    });
    mpvObsClient.on('data', d => {
      mpvObsBuf += d.toString();
      const lines = mpvObsBuf.split('\n');
      mpvObsBuf = lines.pop();  // conservar línea incompleta
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (
            ev.event === 'property-change' &&
            ev.name  === 'time-pos' &&
            typeof ev.data === 'number'
          ) {
            currentSong.mpvActualPos = ev.data;
          }
        } catch (_) {}
      }
    });
    mpvObsClient.on('error', () => { mpvObsClient = null; });
    mpvObsClient.on('close', () => { mpvObsClient = null; });
  }

  function stopMpvObserver() {
    if (mpvObsClient) { try { mpvObsClient.destroy(); } catch (_) {} mpvObsClient = null; }
    mpvObsBuf = '';
    delete currentSong.mpvActualPos;
  }

  // ── Dispatcher de waveform ────────────────────────────────────────────
  // Corre cada 50 ms y emite todos los frames cuya posición ≤ posición real de MPV.
  // Si el observador IPC no ha conectado aún, usa el reloj de pared como fallback.
  function startDispatcher() {
    if (dispatchId) return;
    dispatchId = setInterval(() => {
      if (currentSong.status !== 'playing' || !wss) return;

      const mpvPos = typeof currentSong.mpvActualPos === 'number'
        ? currentSong.mpvActualPos
        : Math.max(0, (Date.now() - (currentSong.startedAt || Date.now())) / 1000);

      // Emitir todos los frames listos (+50 ms de tolerancia)
      while (waveformQueue.length && waveformQueue[0].pos <= mpvPos + 0.05) {
        const { bars } = waveformQueue.shift();
        const msg = JSON.stringify({ type: 'waveform', bars });
        wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
      }

      // Limitar cola a 1 hora para no crecer indefinidamente
      const cap = 60 * 60 * 10;
      if (waveformQueue.length > cap) waveformQueue.splice(0, waveformQueue.length - cap);
    }, 50);
  }

  function stopDispatcher() {
    if (dispatchId) { clearInterval(dispatchId); dispatchId = null; }
  }

  // ── Beat ──────────────────────────────────────────────────────────────
  function broadcastBeat(intensity) {
    if (currentSong.status !== 'playing') return;
    const msg = JSON.stringify({ type: 'beat', intensity });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
    if (typeof StickerServer !== 'undefined') StickerServer.onBeat(intensity);
  }

  // ── Barras de amplitud ────────────────────────────────────────────────
  function computeWaveformBars(chunk) {
    const samplesPerBar = Math.floor(CHUNK_SAMPLES / WAVEFORM_BARS); // 8
    const bars = new Array(WAVEFORM_BARS);
    for (let b = 0; b < WAVEFORM_BARS; b++) {
      let rms = 0;
      const off = b * samplesPerBar * 2;
      for (let i = 0; i < samplesPerBar; i++) {
        const s = chunk.readInt16LE(off + i * 2) / 32768;
        rms += s * s;
      }
      bars[b] = Math.round(Math.min(Math.sqrt(rms / samplesPerBar) * 4.5, 1.0) * 255);
    }
    return bars;
  }

  // ── Procesado PCM ─────────────────────────────────────────────────────
  function processPCM(buf) {
    audioBuf = Buffer.concat([audioBuf, buf]);
    while (audioBuf.length >= CHUNK_BYTES) {
      const chunk = audioBuf.slice(0, CHUNK_BYTES);
      audioBuf    = audioBuf.slice(CHUNK_BYTES);

      // Beat detection
      let energy = 0;
      for (let i = 0; i < CHUNK_BYTES - 1; i += 2) {
        const s = chunk.readInt16LE(i) / 32768;
        energy += s * s;
      }
      energy = Math.sqrt(energy / CHUNK_SAMPLES);
      const now = Date.now();
      if (energy > avgEnergy * THRESHOLD && energy > 0.008 && now - lastBeat > COOLDOWN_MS) {
        lastBeat = now;
        broadcastBeat(Math.min(energy / (avgEnergy || 0.001), 3.0));
      }
      avgEnergy = avgEnergy * 0.90 + energy * 0.10;

      // Waveform: encolar frame cada 2 chunks (~10 fps)
      decodedSamples += CHUNK_SAMPLES;
      if (++wChunkCount % 2 === 0) {
        waveformQueue.push({
          pos:  decodedSamples / SAMPLE_RATE,  // posición en segundos
          bars: computeWaveformBars(chunk),
        });
      }
    }
  }

  function start(url) {
    stop();
    active         = true;
    avgEnergy      = 0;
    lastBeat       = 0;
    audioBuf       = Buffer.alloc(0);
    wChunkCount    = 0;
    decodedSamples = 0;
    waveformQueue.length = 0;

    startDispatcher();
    // Esperar 1 s a que MPV cree el IPC pipe antes de conectar el observador
    setTimeout(startMpvObserver, 1000);

    // Pipe yt-dlp → ffmpeg: más fiable que obtener la URL CDN por separado.
    // yt-dlp descarga el audio y ffmpeg lo convierte a PCM en tiempo real.
    const ytdlpArgs = [
      url,
      '--no-update',
      '-o', '-',
      '-f', 'bestaudio',
      '--no-playlist',
      '-q'
    ];
    if (serverConfig.ytdlpBrowser) {
      ytdlpArgs.push('--cookies-from-browser', serverConfig.ytdlpBrowser);
    }
    ytdlpProc = spawn('yt-dlp', ytdlpArgs);

    proc = spawn('ffmpeg', [
      '-fflags', '+genpts+discardcorrupt',  // regenerar timestamps y descartar paquetes con DTS desordenado
      '-i', 'pipe:0',
      '-vn',
      '-af', 'aresample=async=1000',        // compensar huecos de audio causados por paquetes descartados
      '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1',
      'pipe:1',
      '-loglevel', 'error'
    ]);

    ytdlpProc.stdout.pipe(proc.stdin);

    ytdlpProc.on('error', err => {
      if (err.code === 'ENOENT') console.log('[BeatAnalyzer] yt-dlp no encontrado');
      else console.error('[BeatAnalyzer] yt-dlp error:', err.message);
    });
    ytdlpProc.on('exit', (code) => {
      ytdlpProc = null;
      if (code !== null && code !== 0) console.log('[BeatAnalyzer] yt-dlp salió con código:', code);
    });

    proc.stdout.on('data', processPCM);
    proc.stderr.on('data', d => {
      const msg = d.toString().trim();
      if (msg) console.error('[BeatAnalyzer ffmpeg]', msg);
    });
    proc.on('error', err => {
      if (err.code === 'ENOENT') {
        console.log('[BeatAnalyzer] ffmpeg no encontrado — instala con: winget install Gyan.FFmpeg');
      } else {
        console.error('[BeatAnalyzer]', err.message);
      }
    });
    proc.on('exit', (code) => {
      proc = null;
      if (code !== null && code !== 0) console.log('[BeatAnalyzer] ffmpeg salió con código:', code);
    });

    console.log('[BeatAnalyzer] Análisis de audio iniciado (yt-dlp → ffmpeg pipe)');
  }

  function stop() {
    active         = false;
    wChunkCount    = 0;
    decodedSamples = 0;
    waveformQueue.length = 0;
    stopDispatcher();
    stopMpvObserver();
    if (ytdlpProc) { try { ytdlpProc.kill(); } catch (_) {} ytdlpProc = null; }
    if (proc) { try { proc.kill(); } catch (_) {} proc = null; }
    audioBuf = Buffer.alloc(0);
  }

  return { start, stop };
})();

// ── Sticker Server ────────────────────────────────────────────────────────────
// Motor de física autorizado para los stickers. Todos los clientes reciben el
// mismo estado sincronizado. La física y las colisiones corren en el servidor.
// Coordenadas en espacio virtual 1920×1080 px (los clientes escalan al renderizar).
// Cada sticker representa un usuario logeado: 1 usuario = 1 GIF con su nombre.
const StickerServer = (() => {
  const VIRTUAL_W     = 1920;
  const VIRTUAL_H     = 1080;
  const BASE_SIZE     = 90;
  const FRICTION      = 0.985;
  const BOUNCE_DAMP   = 0.78;
  const MAX_SPEED     = 1600;
  const IDLE_SPEED    = 40;
  const PLAY_SPEED    = 100;
  const MAX_LIVES     = 5;
  const INVINCIBLE_MS = 5000;
  const TICK_MS       = 50;
  const BCAST_EVERY   = 4;
  const GRAVITY       = 1400;

  let stickers      = [];
  let gifUrls       = [];
  let intervalId    = null;
  let playing       = false;
  let nextId        = 0;
  let tickCount     = 0;
  let nextClientId  = 0;
  // userId → stickerId (sólo usuarios con sticker vivo)
  const userStickers = new Map();

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function loadGifs() {
    try {
      const dir   = path.join(__dirname, 'public', 'stickers');
      const files = fs.readdirSync(dir).filter(f => /\.gif$/i.test(f));
      gifUrls = files.map(f => `/stickers/${encodeURIComponent(f)}`);
    } catch (_) { gifUrls = []; }
  }

  function makeSticker(url, username, permanent = false) {
    const angle = rnd(0, Math.PI * 2);
    return {
      id:               nextId++,
      gifUrl:           url,
      username:         username || '',
      cx:               rnd(BASE_SIZE, VIRTUAL_W - BASE_SIZE),
      cy:               rnd(BASE_SIZE / 2, VIRTUAL_H / 2),  // spawnear en la mitad superior
      vx:               Math.cos(angle) * IDLE_SPEED,
      vy:               Math.sin(angle) * IDLE_SPEED,
      size:             BASE_SIZE * rnd(0.85, 1.2),
      hue:              Math.floor(rnd(0, 360)),
      lives:            MAX_LIVES,
      invincibleUntil:  0,
      pulse:            0,
      grabbedBy:        null,
      permanent,
    };
  }

  function broadcast(msg) {
    const raw = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(raw); });
  }

  function toWireSticker(s) {
    const now = Date.now();
    return {
      id:         s.id,
      gifUrl:     s.gifUrl,
      username:   s.username,
      cx:         s.cx,
      cy:         s.cy,
      vx:         s.vx,
      vy:         s.vy,
      size:       s.size,
      hue:        s.hue,
      lives:      s.lives,
      maxLives:   MAX_LIVES,
      grabbed:    s.grabbedBy !== null,
      invincible: now < s.invincibleUntil,
      permanent:  s.permanent || false,
    };
  }

  function broadcastState() {
    broadcast({ type: 'stickers', stickers: stickers.map(toWireSticker) });
  }

  // Añadir sticker para un usuario que acaba de conectarse
  function spawnForUser(session) {
    if (!gifUrls.length || userStickers.has(session.userId)) return;
    const user = users.find(u => u.id === session.userId);
    const savedGif = user?.stickerGif;
    const gifUrl = (savedGif && gifUrls.includes(savedGif)) ? savedGif : pick(gifUrls);
    // Guardar el GIF asignado aleatoriamente para uso futuro (DJ spotlight, disconnected users)
    if (user && !user.stickerGif) {
      user.stickerGif = gifUrl;
      saveUsers();
    }
    const s = makeSticker(gifUrl, session.username);
    stickers.push(s);
    userStickers.set(session.userId, s.id);
  }

  // Actualizar GIF de sticker en tiempo real cuando el usuario cambia su sticker
  function updateUserSticker(userId, gifUrl) {
    const stickerId = userStickers.get(userId);
    if (stickerId === undefined) return;
    const s = stickers.find(s => s.id === stickerId);
    if (s) { s.gifUrl = gifUrl; broadcastState(); }
  }

  // Obtener el GIF actual del sticker de un usuario (por userId)
  function getUserGif(userId) {
    const stickerId = userStickers.get(userId);
    if (stickerId !== undefined) {
      const s = stickers.find(s => s.id === stickerId);
      if (s) return s.gifUrl;
    }
    return null;
  }

  function addUserSticker(session) {
    spawnForUser(session);
    broadcastState();
  }

  function removeUserSticker(userId) {
    const sid = userStickers.get(userId);
    if (sid === undefined) return;
    stickers = stickers.filter(s => s.id !== sid);
    userStickers.delete(userId);
    broadcastState();
  }

  function checkCollisions() {
    const now = Date.now();
    for (let i = 0; i < stickers.length; i++) {
      for (let j = i + 1; j < stickers.length; j++) {
        const a = stickers[i], b = stickers[j];
        if (a.grabbedBy !== null || b.grabbedBy !== null) continue;
        if (now < a.invincibleUntil || now < b.invincibleUntil) continue;

        const dx   = b.cx - a.cx, dy = b.cy - a.cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const minD = (a.size + b.size) / 2;

        if (dist < minD) {
          a.invincibleUntil = now + INVINCIBLE_MS;
          b.invincibleUntil = now + INVINCIBLE_MS;
          a.pulse = 1.8; b.pulse = 1.8;

          const nx = dx / dist, ny = dy / dist;
          const dv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (dv > 0) {
            a.vx -= dv * nx; a.vy -= dv * ny;
            b.vx += dv * nx; b.vy += dv * ny;
          }
          const overlap = (minD - dist) / 2;
          a.cx -= overlap * nx; a.cy -= overlap * ny;
          b.cx += overlap * nx; b.cy += overlap * ny;
        }
      }
    }
  }

  function tick() {
    const dt = TICK_MS / 1000;
    const now = Date.now();
    tickCount++;

    if (playing) checkCollisions();

    // Eliminar muertos y sincronizar el mapa userId→stickerId
    const countBefore = stickers.length;
    stickers = stickers.filter(s => s.permanent || s.lives > 0);
    if (stickers.length < countBefore) {
      const aliveIds = new Set(stickers.map(s => s.id));
      for (const [uid, sid] of userStickers.entries()) {
        if (!aliveIds.has(sid)) userStickers.delete(uid);
      }
    }

    // Cuando queda 1 → lo hacemos grande y avisamos
    if (stickers.length === 1 && countBefore > 1) {
      stickers[0].size = BASE_SIZE * 2.8;
      broadcast({ type: 'survivor', id: stickers[0].id });
      broadcastState();
      return;
    }

    stickers.forEach(s => {
      if (s.grabbedBy !== null) {
        s.pulse = Math.max(s.pulse * 0.96, 0.3);
        return;
      }

      if (!playing) {
        s.vy += GRAVITY * dt;
        s.vx *= 0.96;
      } else {
        const spd = Math.hypot(s.vx, s.vy);
        if (spd < PLAY_SPEED * 0.25) {
          const dir = rnd(0, Math.PI * 2);
          s.vx += Math.cos(dir) * PLAY_SPEED * 0.35;
          s.vy += Math.sin(dir) * PLAY_SPEED * 0.35;
        }
        s.vx *= FRICTION;
        s.vy *= FRICTION;
      }

      s.cx += s.vx * dt;
      s.cy += s.vy * dt;

      const r = s.size / 2;
      let bounced = false;
      if (s.cx - r < 0)         { s.cx = r;             s.vx =  Math.abs(s.vx) * BOUNCE_DAMP; bounced = true; }
      if (s.cx + r > VIRTUAL_W) { s.cx = VIRTUAL_W - r; s.vx = -Math.abs(s.vx) * BOUNCE_DAMP; bounced = true; }
      if (s.cy - r < 0)         { s.cy = r;             s.vy =  Math.abs(s.vy) * BOUNCE_DAMP; bounced = true; }
      if (s.cy + r > VIRTUAL_H) {
        s.cy = VIRTUAL_H - r;
        if (!playing) {
          s.vy = -Math.abs(s.vy) * 0.12;
          s.vx *= 0.75;
        } else {
          s.vy = -Math.abs(s.vy) * BOUNCE_DAMP;
          bounced = true;
        }
      }

      if (playing && bounced) { s.hue = (s.hue + Math.floor(rnd(50, 130))) % 360; s.pulse = Math.max(s.pulse, 0.5); }
      s.pulse *= Math.pow(0.001, dt);
    });

    if (tickCount % BCAST_EVERY === 0) broadcastState();
  }

  // ── Mensajes de clientes ───────────────────────────────────────────────
  function handleMessage(ws, raw) {
    try {
      const msg = JSON.parse(raw);
      const cid = ws._clientId;
      switch (msg.type) {
        case 'grab': {
          const s = stickers.find(s => s.id === msg.id && !s.grabbedBy);
          if (s) { s.grabbedBy = cid; s.vx = 0; s.vy = 0; }
          break;
        }
        case 'move': {
          const s = stickers.find(s => s.id === msg.id && s.grabbedBy === cid);
          if (s) {
            s.cx = clamp(msg.cx, s.size / 2, VIRTUAL_W - s.size / 2);
            s.cy = clamp(msg.cy, s.size / 2, VIRTUAL_H - s.size / 2);
          }
          break;
        }
        case 'release': {
          const s = stickers.find(s => s.id === msg.id && s.grabbedBy === cid);
          if (s) {
            s.grabbedBy = null;
            s.vx = clamp(msg.vx || 0, -MAX_SPEED, MAX_SPEED);
            s.vy = clamp(msg.vy || 0, -MAX_SPEED, MAX_SPEED);
          }
          break;
        }
        case 'revive': revive(); break;
      }
    } catch (_) {}
  }

  function handleDisconnect(ws) {
    stickers.forEach(s => {
      if (s.grabbedBy === ws._clientId) { s.grabbedBy = null; s.vx = 0; s.vy = 0; }
    });
  }

  function onBeat(intensity = 1.0) {
    // El beat solo produce un resplandor visual en el cliente (vía mensaje 'beat' WS).
    // No se altera la velocidad para evitar tirones en el movimiento.
  }

  function setPlaying(isPlaying) {
    if (isPlaying && !playing) {
      // La música arranca: lanzar stickers hacia arriba desde el suelo
      stickers.forEach(s => {
        if (s.grabbedBy !== null) return;
        const angle = rnd(-Math.PI * 0.95, -Math.PI * 0.05); // cono hacia arriba
        const spd   = rnd(400, 900);
        s.vx = Math.cos(angle) * spd;
        s.vy = Math.sin(angle) * spd;  // negativo = hacia arriba
      });
    }
    playing = isPlaying;
  }

  function revive() {
    const permanents = stickers.filter(s => s.permanent);
    nextId = permanents.length ? Math.max(...permanents.map(s => s.id)) + 1 : 0;
    stickers = [...permanents];
    userStickers.clear();
    // Recrear un sticker por cada usuario autenticado conectado
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.user) {
        spawnForUser(client.user);
      }
    });
    broadcastState();
    console.log(`[StickerServer] Revividos: ${stickers.length} stickers (${permanents.length} permanentes)`);
  }

  function assignClientId(ws) {
    ws._clientId = nextClientId++;
  }

  function sendStateTo(ws) {
    ws.send(JSON.stringify({ type: 'stickers', stickers: stickers.map(toWireSticker) }));
  }

  function init() {
    loadGifs();
    if (!gifUrls.length) { console.warn('[StickerServer] Sin GIFs'); return; }
    stickers = [];
    const zoro = makeSticker('/stickers/zorotwerk.gif', '', true);
    stickers.push(zoro);
    intervalId = setInterval(tick, TICK_MS);
    console.log('[StickerServer] Iniciado con sticker permanente zorotwerk');
  }

  return { init, onBeat, setPlaying, handleMessage, handleDisconnect, assignClientId, sendStateTo, revive, addUserSticker, removeUserSticker, updateUserSticker, getUserGif };
})();

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

// Keepalive: ping a todos los clientes cada 30s para mantener vivas las conexiones
// a través de proxies/túneles (Cloudflare tiene timeout de 100s de inactividad)
setInterval(() => {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.ping();
  });
}, 30000);

wss.on('connection', (ws, req) => {
  // Validar token desde query string: ?token=xxx
  const qs = req.url.includes('?') ? req.url.split('?')[1] : '';
  const token = new URLSearchParams(qs).get('token');
  const wsSession = token ? sessions.get(token) : null;
  if (!wsSession || Date.now() > wsSession.expiresAt) {
    ws.send(JSON.stringify({ type: 'auth_error', message: 'No autenticado' }));
    ws.close(4001, 'Unauthorized');
    return;
  }
  ws.user = wsSession;

  activeConnections++;
  StickerServer.assignClientId(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  console.log(`Cliente WebSocket conectado (${activeConnections} activos, id=${ws._clientId}, user=${wsSession.username})`);

  // Enviar estado actual al conectarse
  ws.send(JSON.stringify({
    type: 'status',
    data: { currentSong, queue, queueLength: queue.length, audioDevice: savedAudioDevice }
  }));
  ws.send(JSON.stringify({
    type: 'config',
    data: { backendUrl: serverConfig.backendUrl, audioDevice: serverConfig.audioDevice || savedAudioDevice }
  }));
  // Añadir sticker para este usuario y enviar estado completo
  StickerServer.addUserSticker(wsSession);
  StickerServer.sendStateTo(ws);

  // Mensajes del cliente → StickerServer (grab, move, release, revive)
  ws.on('message', (data) => StickerServer.handleMessage(ws, data));

  ws.on('close', () => {
    activeConnections--;
    StickerServer.handleDisconnect(ws);
    StickerServer.removeUserSticker(wsSession.userId);
    console.log(`Cliente WebSocket desconectado (${activeConnections} activos)`);
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

  BeatAnalyzer.stop();
  StickerServer.setPlaying(false);

  currentSong.status = 'stopped';
  currentSong.title = 'Ninguna';
  currentSong.url = '';
  currentSong.index = -1;

  if (!skipBroadcast) {
    broadcastStatus();
  }
}

// Enviar comando de volumen al MPV principal vía IPC (falla silenciosamente)
function setMpvVolume(vol) {
  const ipcPipe = process.platform === 'win32' ? '\\\\.\\pipe\\mpvdj' : '/tmp/mpvdj.sock';
  const command = JSON.stringify({ command: ['set_property', 'volume', vol] }) + '\n';
  return new Promise((resolve) => {
    try {
      const client = net.createConnection(ipcPipe);
      const timer = setTimeout(() => { try { client.destroy(); } catch (_) {} resolve(); }, 1000);
      client.on('connect', () => { client.write(command); clearTimeout(timer); client.end(); resolve(); });
      client.on('error', () => { clearTimeout(timer); resolve(); });
    } catch (_) { resolve(); }
  });
}

// Borrar archivo de clip subido (solo si está dentro de data/clips/ por seguridad)
function deleteClipFile(filePath) {
  if (!filePath) return;
  const clipsDir = path.join(__dirname, 'data', 'clips');
  if (!filePath.startsWith(clipsDir)) return; // seguridad: nunca borrar fuera de esta carpeta
  fs.unlink(filePath, (err) => {
    if (err) console.warn(`[Clip] No se pudo borrar archivo temporal: ${err.message}`);
    else     console.log(`[Clip] Archivo temporal borrado: ${path.basename(filePath)}`);
  });
}

// Transición suave de volumen (fromVol → toVol en durationMs ms, 10 pasos)
async function fadeVolume(fromVol, toVol, durationMs) {
  const steps = 10;
  const stepMs = Math.round(durationMs / steps);
  const stepSize = (toVol - fromVol) / steps;
  for (let i = 1; i <= steps; i++) {
    await setMpvVolume(Math.max(0, Math.min(100, Math.round(fromVol + stepSize * i))));
    if (i < steps) await new Promise(r => setTimeout(r, stepMs));
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
    await playWithMPV(nextSong.url, audioDevice, nextSong.title, nextSong.addedBy, nextSong.addedLocation);
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
async function playWithMPV(url, audioDevice, title = null, addedBy = null, addedLocation = null) {
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
      currentSong.errorMessage = null;
      currentSong.duration = duration;
      currentSong.startedAt = Date.now();
      currentSong.addedBy = addedBy;
      currentSong.addedLocation = addedLocation;
      // GIF del DJ actual para el spotlight en la interfaz
      const djUser = users.find(u => u.username === addedBy);
      currentSong.addedByGif = (djUser ? (StickerServer.getUserGif(djUser.id) || djUser.stickerGif) : null) || null;
      // Registrar en historial (solo cuando la canción realmente empieza a sonar)
      historyLog.unshift({ title: videoTitle, url, addedBy: addedBy || null, addedLocation: addedLocation || null, playedAt: Date.now() });
      if (historyLog.length > 25) historyLog.pop();
      broadcastStatus();
      BeatAnalyzer.start(url);
      StickerServer.setPlaying(true);
      
      // Ruta del IPC: en Windows se requiere el path completo \\.\pipe\<name>
      const ipcPath = process.platform === 'win32' ? '\\\\.\\pipe\\mpvdj' : '/tmp/mpvdj.sock';

      const mpvArgs = [
        '--no-video',
        '--volume=100',
        '--ytdl-format=bestaudio[acodec=opus]/bestaudio[acodec=mp4a.40.2]/bestaudio',
        '--audio-samplerate=48000',   // Discord usa 48 kHz; evita resampleo de Windows
        '--audio-channels=stereo',    // forzar estéreo
        `--input-ipc-server=${ipcPath}`
      ];

      // Solo agregar dispositivo de audio si es válido
      if (audioDevice && audioDevice.trim()) {
        mpvArgs.push('--audio-device=' + audioDevice);
      }

      // Pasar cookies del navegador a yt-dlp para acceder a videos restringidos
      if (serverConfig.ytdlpBrowser) {
        mpvArgs.push(`--ytdl-raw-options=cookies-from-browser=${serverConfig.ytdlpBrowser}`);
      }

      mpvArgs.push(url);
      
      console.log('===== Iniciando reproducción =====');
      console.log('Título:', videoTitle);
      console.log('Dispositivo:', audioDevice);
      console.log('Argumentos MPV:', mpvArgs);

      const thisProcess = spawn('mpv', mpvArgs);
      currentProcess = thisProcess;
      isStartingPlayback = false; // Liberar lock una vez que el proceso inició

      let mpvErrorMessage = null;

      thisProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.log(`[MPV stdout] ${output}`);
        if (/not available/i.test(output))
          mpvErrorMessage = 'Video no disponible (bloqueado o eliminado)';
        else if (/video unavailable/i.test(output))
          mpvErrorMessage = 'Video no disponible';
        else if (/private video/i.test(output))
          mpvErrorMessage = 'Video privado';
        else if (/age.?restrict/i.test(output))
          mpvErrorMessage = 'Video con restricción de edad';
        else if (/copyright/i.test(output))
          mpvErrorMessage = 'Video bloqueado por derechos de autor';
        else if (/Failed to recognize file format/i.test(output))
          mpvErrorMessage = mpvErrorMessage || 'No se pudo cargar el audio';
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
          const failed = code !== 0 && !manualStop;
          currentSong.status = failed ? 'error' : 'stopped';
          if (failed) currentSong.errorMessage = mpvErrorMessage || 'Error al reproducir';

          if (failed) {
            const failedTitle = currentSong.title || 'Canción desconocida';
            const errMsg = currentSong.errorMessage;
            const hasNext = queue.length > 0;
            const notifMsg = hasNext
              ? `"${failedTitle}" no se puede reproducir. Saltando al siguiente...`
              : `"${failedTitle}" no se puede reproducir.`;
            console.log(`[MPV] Fallo: ${errMsg} — ${notifMsg}`);
            wss.clients.forEach(c => {
              if (c.readyState === WebSocket.OPEN)
                c.send(JSON.stringify({ type: 'song_error', title: failedTitle, message: errMsg, hasNext }));
            });
          }

          if (manualStop) {
            console.log('[MPV] Stop manual detectado - NO auto-play');
            manualStop = false;
            broadcastStatus();
          } else if (failed && queue.length > 0) {
            console.log('[Auto-play] Video fallido, reproduciendo siguiente...');
            playNext(audioDevice).catch(error => {
              console.error('[Auto-play] Error:', error.message);
              broadcastStatus();
            });
          } else if (!failed && queue.length > 0) {
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
      // Fetch duration in background and update once available
      getVideoInfoWithArgs(url)
        .then(info => {
          if (info?.duration && currentSong.url === url) {
            currentSong.duration = info.duration;
            broadcastStatus();
          }
        })
        .catch(() => {});
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

// ===== RUTAS DE AUTENTICACIÓN =====

// Detectar ubicación del cliente (sin auth)
app.get('/api/auth/location', async (req, res) => {
  const ip = getClientIp(req);
  const location = await getIpLocation(ip);
  res.json({ ip, location });
});

// Registro de nuevo usuario
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (users.find(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return res.status(400).json({ error: 'El nombre de usuario ya existe' });
  }

  const ip = getClientIp(req);
  const location = await getIpLocation(ip);
  const locationLabel = location?.isLocal
    ? 'Local'
    : [location?.city, location?.country].filter(Boolean).join(', ') || 'Desconocido';
  const { hash, salt } = hashPassword(password);

  const user = {
    id: crypto.randomBytes(16).toString('hex'),
    username: username.trim(),
    passwordHash: hash,
    passwordSalt: salt,
    locationLabel,
    allowedCountry: location?.countryCode || 'UNKNOWN',
    allowedRegion: location?.region || '',
    locationData: location,
    registeredIp: ip,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  saveUsers();
  console.log(`[Auth] Registro: ${user.username} desde ${ip} (${location?.country || 'desconocido'})`);
  res.json({ success: true });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  const ip = getClientIp(req);
  if (user.allowedCountry !== 'LOCAL' && user.allowedCountry !== 'UNKNOWN') {
    const loc = await getIpLocation(ip);
    if (loc && !loc.isLocal && loc.countryCode !== user.allowedCountry) {
      console.log(`[Auth] Denegado: ${user.username} desde ${ip} (${loc.country}) — esperado: ${user.allowedCountry}`);
      return res.status(403).json({
        error: `Acceso denegado. Tu ubicación actual (${loc.country}) no coincide con la ubicación registrada (${user.locationData?.country || user.allowedCountry}).`
      });
    }
  }

  const token = generateToken();
  sessions.set(token, {
    userId: user.id,
    username: user.username,
    locationLabel: user.locationLabel,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });

  console.log(`[Auth] Login: ${user.username} desde ${ip}`);
  res.json({ success: true, token, username: user.username, locationLabel: user.locationLabel });
});

// Logout
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization']?.slice(7);
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// Info del usuario actual
app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = users.find(u => u.id === req.user.userId);
  res.json({ username: req.user.username, locationLabel: req.user.locationLabel, stickerGif: user?.stickerGif || null });
});

// Actualizar sticker del usuario
app.patch('/api/auth/sticker', requireAuth, (req, res) => {
  const { stickerGif } = req.body;
  if (!stickerGif) return res.status(400).json({ error: 'stickerGif requerido' });
  const user = users.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  user.stickerGif = stickerGif;
  saveUsers();
  StickerServer.updateUserSticker(req.user.userId, stickerGif);
  console.log(`[Auth] Sticker actualizado: ${req.user.username} → ${stickerGif}`);
  res.json({ success: true, stickerGif });
});

// Proteger todas las rutas /api/* a partir de aquí
app.use('/api', requireAuth);

// API Endpoints

// GET: Listar GIFs disponibles en /stickers/
app.get('/api/gifs', (req, res) => {
  const gifDir = path.join(__dirname, 'public', 'stickers');
  try {
    const files = fs.readdirSync(gifDir).filter(f => /\.gif$/i.test(f));
    res.json({ gifs: files.map(f => `/stickers/${encodeURIComponent(f)}`) });
  } catch (e) {
    res.json({ gifs: [] });
  }
});

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

  // Cuando hay algo sonando, la canción se añade a la cola — verificar límite
  if (currentSong.status === 'playing' && queue.length >= MAX_QUEUE) {
    return res.status(429).json({ error: `Cola llena (máximo ${MAX_QUEUE} canciones)` });
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
      
      // Si no hay nada activo (ni playing ni paused), reproducir el primero
      const isActive = currentSong.status === 'playing' || currentSong.status === 'paused';
      if (!isActive) {
        const firstVideo = info.entries[0];

        // Validar que el primer video tiene propiedades necesarias
        if (!firstVideo || !firstVideo.url) {
          return res.status(400).json({
            error: 'Primer video de playlist inválido'
          });
        }

        stopCurrentPlayback(true, true); // skipBroadcast=true, isManualStop=true (evitar auto-play)
        // Esperar a que taskkill termine antes de lanzar nuevo MPV
        await new Promise(resolve => setTimeout(resolve, 450));

        // Insertar el resto al FRENTE de la cola (antes de lo que ya había)
        const restEntries = [];
        for (let i = 1; i < info.entries.length; i++) {
          const entry = info.entries[i];
          if (entry && entry.url) {
            restEntries.push({
              url: entry.url,
              title: entry.title || `Video ${i}`,
              duration: entry.duration || 0,
              addedAt: Date.now(),
              addedBy: req.user?.username || null,
              addedLocation: req.user?.locationLabel || null
            });
          }
        }
        queue.unshift(...restEntries);

        try {
          await playWithMPV(
            firstVideo.url,
            savedAudioDevice,
            firstVideo.title || `Video 1`,
            req.user?.username || null,
            req.user?.locationLabel || null
          );

          res.json({
            success: true,
            message: `Playlist agregada: ${info.entries.length} canciones`,
            queue: queue.length
          });
        } catch (error) {
          console.error('[Playlist Error] Error reproduciendo primer video:', error.message);
          res.status(500).json({
            error: 'Error al reproducir primer video',
            details: error.message
          });
        }
      } else {
        // Hay algo activo (playing o paused): insertar toda la playlist al frente sin interrumpir
        const newEntries = info.entries
          .filter(e => e && e.url)
          .map(e => ({ url: e.url, title: e.title || 'Desconocido', duration: e.duration || 0, addedAt: Date.now(), addedBy: req.user?.username || null, addedLocation: req.user?.locationLabel || null }));
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
      const isActive = currentSong.status === 'playing' || currentSong.status === 'paused';

      if (isActive) {
        // Hay algo activo (playing o paused): encolar sin interrumpir
        queue.unshift({
          url: playUrl,
          title: videoTitle,
          duration: info?.duration || 0,
          addedAt: Date.now(),
          addedBy: req.user?.username || null,
          addedLocation: req.user?.locationLabel || null
        });
        console.log(`[Play] Añadido al frente de la cola: ${videoTitle}`);
        broadcastStatus();
        res.json({
          success: true,
          message: `"${videoTitle}" sonará a continuación`,
          queue: queue.length
        });
      } else {
        // No hay nada activo: reproducir inmediatamente
        stopCurrentPlayback(true, true);
        // Esperar a que taskkill termine antes de lanzar nuevo MPV
        await new Promise(resolve => setTimeout(resolve, 450));

        try {
          console.log(`[Play] Reproduciendo: ${videoTitle}`);
          const mpvStart = Date.now();
          await playWithMPV(playUrl, savedAudioDevice, videoTitle, req.user?.username || null, req.user?.locationLabel || null);
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

// POST: Crear playlist (búsqueda múltiple, playlist de YT, o mix automático por video)
app.post('/api/play-with-mix', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL o búsqueda requerida' });

  if (queue.length >= MAX_QUEUE) {
    return res.status(429).json({ error: `Cola llena (máximo ${MAX_QUEUE} canciones)` });
  }

  try {
    const isPlaying = currentSong.status === 'playing';

    // ── CASO 1: Texto libre → buscar 15 canciones directamente en YouTube ──
    if (!isUrl(url) && !isSunoUrl(url)) {
      console.log(`[Playlist] Texto libre: buscando 15 canciones para "${url}"...`);
      const searchArgs = [
        '--js-runtimes', 'node',
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        `ytsearch15:${url}`
      ];
      const output = await ytDlpWrap.execPromise(searchArgs);
      const lines = output.trim().split('\n').filter(l => l.trim());
      const songEntries = lines
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean)
        .map((e, i) => {
          const entryUrl = e.webpage_url || e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null);
          return entryUrl ? { url: entryUrl, title: e.title || `Canción ${i + 1}`, duration: e.duration || 0, addedAt: Date.now(), addedBy: req.user?.username || null, addedLocation: req.user?.locationLabel || null } : null;
        })
        .filter(Boolean);

      if (songEntries.length === 0) {
        return res.status(400).json({ error: 'No se encontraron resultados para esa búsqueda' });
      }

      if (isPlaying) {
        const allowed = Math.max(0, MAX_QUEUE - queue.length);
        queue.unshift(...songEntries.slice(0, allowed));
        broadcastStatus();
        return res.json({
          success: true,
          message: `${Math.min(songEntries.length, allowed)} canciones añadidas al frente de la cola`,
          mixSize: Math.min(songEntries.length, allowed)
        });
      } else {
        stopCurrentPlayback(true, true);
        const first = songEntries.shift();
        queue.unshift(...songEntries);
        await playWithMPV(first.url, savedAudioDevice, first.title, req.user?.username || null, req.user?.locationLabel || null);
        return res.json({
          success: true,
          message: `Reproduciendo "${first.title}" + ${songEntries.length} canciones en cola`,
          mixSize: songEntries.length + 1
        });
      }
    }

    // ── CASO 2: URL de playlist de YouTube (list= que no sea mix automático RD) ──
    const playlistMatch = url.match(/[?&]list=([^&]+)/);
    if (playlistMatch && !playlistMatch[1].startsWith('RD')) {
      console.log(`[Playlist] URL de playlist detectada (list=${playlistMatch[1]})`);
      const info = await getVideoInfoWithArgs(url);
      const rawEntries = info.entries || [];
      const songEntries = rawEntries
        .filter(e => e && e.url)
        .map(e => ({ url: e.url, title: e.title || 'Desconocido', duration: e.duration || 0, addedAt: Date.now(), addedBy: req.user?.username || null, addedLocation: req.user?.locationLabel || null }));

      if (songEntries.length === 0) {
        return res.status(400).json({ error: 'No se pudieron obtener canciones de la playlist' });
      }

      if (isPlaying) {
        const allowed = Math.max(0, MAX_QUEUE - queue.length);
        queue.unshift(...songEntries.slice(0, allowed));
        broadcastStatus();
        return res.json({
          success: true,
          message: `${Math.min(songEntries.length, allowed)} canciones de la playlist añadidas al frente`,
          mixSize: songEntries.length
        });
      } else {
        stopCurrentPlayback(true, true);
        const first = songEntries.shift();
        queue.unshift(...songEntries);
        await playWithMPV(first.url, savedAudioDevice, first.title, req.user?.username || null, req.user?.locationLabel || null);
        return res.json({
          success: true,
          message: `Reproduciendo playlist: "${first.title}" + ${songEntries.length} más`,
          mixSize: songEntries.length + 1
        });
      }
    }

    // ── CASO 3: URL de video de YouTube / Suno → mix automático RD ──
    console.log('[Mix] Resolviendo input:', url);
    const { info: baseInfo, playUrl: basePlayUrl } = await resolveTrackInfo(url);
    console.log(`[Mix] Base: "${baseInfo.title}" → ${basePlayUrl}`);

    const videoId = extractYouTubeVideoId(basePlayUrl);

    if (!videoId) {
      // No es YouTube (ej: Suno) → sin mix disponible
      console.log('[Mix] No es un vídeo de YouTube, reproduciendo sin mix');
      if (isPlaying) {
        queue.unshift({ url: basePlayUrl, title: baseInfo.title, duration: baseInfo.duration || 0, addedAt: Date.now(), addedBy: req.user?.username || null, addedLocation: req.user?.locationLabel || null });
        broadcastStatus();
        return res.json({
          success: true,
          message: `"${baseInfo.title}" sonará a continuación (mix no disponible)`,
          mixSize: 0
        });
      } else {
        stopCurrentPlayback(true, true);
        await playWithMPV(basePlayUrl, savedAudioDevice, baseInfo.title, req.user?.username || null, req.user?.locationLabel || null);
        return res.json({
          success: true,
          message: `Reproduciendo "${baseInfo.title}" (mix no disponible para esta fuente)`,
          mixSize: 0
        });
      }
    }

    // Obtener el mix automático de YouTube (máx 25 canciones)
    let mixEntries = [];
    try {
      mixEntries = await getYouTubeMix(videoId);
      console.log(`[Mix] ${mixEntries.length} canciones obtenidas del mix`);
    } catch (mixError) {
      console.log('[Mix] No se pudo obtener el mix:', mixError.message);
    }

    if (isPlaying) {
      const mixQueue = mixEntries.map((entry, i) => {
        const entryUrl = entry.webpage_url
          || entry.url
          || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);
        return entryUrl ? { url: entryUrl, title: entry.title || `Canción ${i + 1}`, duration: entry.duration || 0, addedAt: Date.now(), addedBy: req.user?.username || null, addedLocation: req.user?.locationLabel || null } : null;
      }).filter(Boolean);

      if (mixQueue.length === 0) {
        if (queue.length < MAX_QUEUE) {
          queue.unshift({ url: basePlayUrl, title: baseInfo.title, duration: baseInfo.duration || 0, addedAt: Date.now(), addedBy: req.user?.username || null, addedLocation: req.user?.locationLabel || null });
        }
      } else {
        const allowed = Math.max(0, MAX_QUEUE - queue.length);
        queue.unshift(...mixQueue.slice(0, allowed));
      }

      console.log(`[Mix] ${mixQueue.length} canciones añadidas al frente de la cola`);
      broadcastStatus();
      res.json({
        success: true,
        message: `Mix de ${mixQueue.length} canciones añadido al frente de la cola`,
        mixSize: mixQueue.length
      });
    } else {
      stopCurrentPlayback(true, true);

      if (mixEntries.length > 0) {
        const first = mixEntries[0];
        const firstUrl = first.webpage_url
          || first.url
          || (first.id ? `https://www.youtube.com/watch?v=${first.id}` : null);
        const firstTitle = first.title || baseInfo.title;

        if (!firstUrl) throw new Error('Primera entrada del mix sin URL válida');

        const restQueue = [];
        for (let i = 1; i < mixEntries.length; i++) {
          const entry = mixEntries[i];
          const entryUrl = entry.webpage_url
            || entry.url
            || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);
          if (entryUrl) {
            restQueue.push({ url: entryUrl, title: entry.title || `Canción ${i}`, duration: entry.duration || 0, addedAt: Date.now(), addedBy: req.user?.username || null, addedLocation: req.user?.locationLabel || null });
          }
        }
        const allowed = Math.max(0, MAX_QUEUE - queue.length);
        queue.unshift(...restQueue.slice(0, allowed));

        await playWithMPV(firstUrl, savedAudioDevice, firstTitle, req.user?.username || null, req.user?.locationLabel || null);
        res.json({
          success: true,
          message: `Reproduciendo "${firstTitle}" + ${restQueue.length} canciones en cola`,
          mixSize: mixEntries.length
        });
      } else {
        await playWithMPV(basePlayUrl, savedAudioDevice, baseInfo.title, req.user?.username || null, req.user?.locationLabel || null);
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

// POST: Poner clip de radio (suena encima de la música con ducking de volumen)
app.post('/api/clip', async (req, res) => {
  const { url, musicDuckVolume = 40, clipVolume = 100 } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });

  const duckVol = Math.max(0, Math.min(100, Number(musicDuckVolume) || 40));
  const clipVol = Math.max(0, Math.min(200, Number(clipVolume) || 100));
  const isLocal = path.isAbsolute(url); // Archivo local subido previamente

  try {
    let playUrl, clipTitle;

    if (isLocal) {
      // Archivo local: reproducir directamente sin yt-dlp
      playUrl   = url;
      clipTitle = path.basename(url).replace(/^\d+_/, ''); // Quitar prefijo timestamp
      console.log(`[Clip] Archivo local: "${clipTitle}"`);
    } else {
      console.log('[Clip] Resolviendo URL...');
      const { info, playUrl: resolved } = await Promise.race([
        resolveTrackInfo(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: 30s')), 30000))
      ]);
      playUrl   = resolved;
      clipTitle = info?.title || 'Clip';
      console.log(`[Clip] ✅ "${clipTitle}" → ${playUrl}`);
    }

    // Comprobar si ya había un clip activo antes de matar el proceso
    const clipWasActive = currentClipProcess !== null;

    // Matar clip previo (anular referencia primero para que su onClose lo ignore)
    if (currentClipProcess) {
      const old        = currentClipProcess;
      const oldPath    = currentClipLocalPath; // guardar antes de sobreescribir
      currentClipProcess   = null;
      currentClipLocalPath = null;
      try {
        if (process.platform === 'win32' && old.pid) {
          exec(`taskkill /F /T /PID ${old.pid}`, () => {});
        } else {
          old.kill('SIGKILL');
        }
      } catch (_) {}
      deleteClipFile(oldPath); // borrar archivo del clip que fue interrumpido
    }

    // Responder al cliente inmediatamente
    res.json({ success: true, message: `Clip: "${clipTitle}"` });

    // Helper broadcast
    const broadcastClip = (status, title) => {
      const msg = JSON.stringify({ type: 'clip', status, title: title || null });
      wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
    };

    const wasPlaying = currentSong.status === 'playing' || currentSong.status === 'paused';

    // Ducking: bajar volumen si hay música; si ya había clip activo, solo actualizar nivel
    if (wasPlaying && !clipWasActive) {
      console.log(`[Clip] Ducking: bajando volumen a ${duckVol}...`);
      currentClipDuckVolume = duckVol;
      await fadeVolume(100, duckVol, 500);
    } else if (wasPlaying && clipWasActive && duckVol !== currentClipDuckVolume) {
      // Nuevo clip con distinto nivel: ajustar sin fade visible
      await setMpvVolume(duckVol);
      currentClipDuckVolume = duckVol;
    }

    broadcastClip('playing', clipTitle);

    // Registrar ruta para borrarla cuando termine (solo archivos subidos)
    currentClipLocalPath = isLocal ? playUrl : null;

    // Spawn MPV para el clip (máx. 20 segundos, mismo dispositivo de audio)
    const clipArgs = ['--no-video', '--volume-max=200', `--volume=${Math.round(clipVol)}`, '--end=20'];
    if (!isLocal) clipArgs.push('--ytdl-format=bestaudio');
    if (savedAudioDevice && savedAudioDevice.trim()) {
      clipArgs.push('--audio-device=' + savedAudioDevice);
    }
    clipArgs.push(playUrl);

    console.log('[Clip] Iniciando MPV:', clipArgs);
    const clipProc = spawn('mpv', clipArgs);
    currentClipProcess = clipProc;

    const onClipEnd = async () => {
      if (currentClipProcess !== clipProc) return; // Fue reemplazado por otro clip
      currentClipProcess = null;
      console.log('[Clip] Terminado. Restaurando volumen...');
      if (wasPlaying) {
        try { await fadeVolume(currentClipDuckVolume, 100, 1000); } catch (_) {}
      }
      broadcastClip('stopped', null);
      // Borrar el archivo subido una vez terminada la reproducción
      deleteClipFile(currentClipLocalPath);
      currentClipLocalPath = null;
    };

    clipProc.on('close', onClipEnd);
    clipProc.on('error', (err) => {
      console.error('[Clip] Error MPV:', err.message);
      onClipEnd().catch(() => {});
    });

  } catch (error) {
    console.error('[Clip] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al reproducir clip', details: error.message });
    } else {
      setMpvVolume(100).catch(() => {});
    }
  }
});

// POST: Detener clip de radio
app.post('/api/clip/stop', async (req, res) => {
  if (!currentClipProcess) {
    return res.json({ success: true, message: 'No hay clip activo' });
  }

  const proc = currentClipProcess;
  currentClipProcess = null;

  try {
    if (process.platform === 'win32' && proc.pid) {
      exec(`taskkill /F /T /PID ${proc.pid}`, () => {});
    } else {
      proc.kill('SIGKILL');
    }
  } catch (_) {}

  // Restaurar al volumen normal usando el nivel de duck guardado
  if (currentSong.status === 'playing' || currentSong.status === 'paused') {
    await fadeVolume(currentClipDuckVolume, 100, 600);
  }

  // Borrar el archivo subido si era un clip local
  deleteClipFile(currentClipLocalPath);
  currentClipLocalPath = null;

  const msg = JSON.stringify({ type: 'clip', status: 'stopped', title: null });
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });

  res.json({ success: true, message: 'Clip detenido' });
});

// POST: Subir archivo de audio local para usar como clip
app.post('/api/clip/upload', express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
  try {
    const rawName  = req.headers['x-filename']
      ? decodeURIComponent(req.headers['x-filename'])
      : `clip_${Date.now()}.mp3`;
    const safeName = `${Date.now()}_${path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const uploadDir = path.join(__dirname, 'data', 'clips');
    fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, req.body);
    console.log(`[Clip Upload] ✅ ${filePath} (${req.body.length} bytes)`);
    res.json({ success: true, path: filePath, name: rawName });
  } catch (err) {
    console.error('[Clip Upload] Error:', err.message);
    res.status(500).json({ error: 'Error al guardar archivo', details: err.message });
  }
});

// POST: Pausar / reanudar la canción actual en el mismo minuto
app.post('/api/pause-resume', async (req, res) => {
  if (!currentProcess) {
    return res.status(400).json({ error: 'No hay reproducción activa' });
  }

  const isPaused = currentSong.status === 'paused';
  const ipcPipe  = process.platform === 'win32'
    ? '\\\\.\\pipe\\mpvdj'
    : '/tmp/mpvdj.sock';
  const command  = JSON.stringify({ command: ['set_property', 'pause', !isPaused] }) + '\n';

  // Intento único de conexión IPC con timeout configurable
  function tryIPC(timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      const client  = net.createConnection(ipcPipe);
      const timer   = setTimeout(() => { client.destroy(); reject(new Error('timeout')); }, timeoutMs);
      client.on('connect', () => {
        client.write(command);
        clearTimeout(timer);
        client.end();
        resolve();
      });
      client.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
  }

  // Reintentar hasta 3 veces (MPV puede tardar un momento en tener el IPC listo)
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 400)); // esperar 400ms entre intentos
      await tryIPC();
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[pause-resume] Intento ${attempt + 1}/3 fallido: ${e.message}`);
    }
  }

  if (lastErr) {
    return res.status(500).json({ error: 'No se pudo comunicar con MPV: ' + lastErr.message });
  }

  currentSong.status = isPaused ? 'playing' : 'paused';
  if (!isPaused) {
    // Al pausar: guardar momento para compensar el tiempo pausado al reanudar
    currentSong.pausedAt = Date.now();
  } else {
    // Al reanudar: compensar el tiempo pausado en startedAt
    if (currentSong.pausedAt) {
      currentSong.startedAt += Date.now() - currentSong.pausedAt;
      delete currentSong.pausedAt;
    }
  }
  // Sincronizar stickers con el estado de pausa/reanuda
  StickerServer.setPlaying(isPaused); // isPaused=true → reanudando, isPaused=false → pausando

  broadcastStatus();
  res.json({ success: true, status: currentSong.status });
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

  if (queue.length >= MAX_QUEUE) {
    return res.status(429).json({ error: `Cola llena (máximo ${MAX_QUEUE} canciones)` });
  }

  try {
    console.log('[Queue Add] Obteniendo info del video...');
    const { info, playUrl } = await resolveTrackInfo(url);

    if (info.entries && info.entries.length > 1) {
      // Es una playlist (solo YouTube)
      info.entries.forEach(entry => {
        if (entry && entry.url && queue.length < MAX_QUEUE) {
          queue.push({
            url: entry.url,
            title: entry.title || 'Desconocido',
            duration: entry.duration || 0,
            addedAt: Date.now(),
            addedBy: req.user?.username || null,
            addedLocation: req.user?.locationLabel || null
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
        duration: info?.duration || 0,
        addedAt: Date.now(),
        addedBy: req.user?.username || null,
        addedLocation: req.user?.locationLabel || null
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
// POST: Reordenar cola (mover canción de posición `from` a posición `to`)
app.post('/api/queue/reorder', (req, res) => {
  const { from, to } = req.body;

  if (from === undefined || to === undefined) {
    return res.status(400).json({ error: 'Se requieren los campos from y to' });
  }

  const f = parseInt(from);
  const t = parseInt(to);

  if (isNaN(f) || isNaN(t) || f < 0 || f >= queue.length || t < 0 || t >= queue.length) {
    return res.status(400).json({ error: `Índice fuera de rango (cola: ${queue.length} canciones)` });
  }

  if (f === t) return res.json({ success: true, queue });

  const [moved] = queue.splice(f, 1);
  queue.splice(t, 0, moved);

  broadcastStatus();
  res.json({ success: true, queue });
});

// POST: Reproducir canción de la cola directamente (la extrae y la reproduce inmediatamente)
app.post('/api/queue/:index/play', async (req, res) => {
  const index = parseInt(req.params.index);

  if (isNaN(index) || index < 0 || index >= queue.length) {
    return res.status(400).json({ error: 'Índice inválido' });
  }

  const [song] = queue.splice(index, 1);
  stopCurrentPlayback(true, true);
  broadcastStatus();

  // Responder al cliente inmediatamente (sin bloquear)
  res.json({ success: true, message: `Reproduciendo: ${song.title}` });

  // Esperar a que taskkill termine antes de lanzar nuevo MPV
  await new Promise(resolve => setTimeout(resolve, 450));
  playWithMPV(song.url, savedAudioDevice, song.title, song.addedBy, song.addedLocation).catch(err => {
    console.error('[Queue Play] Error:', err.message);
  });
});

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

// GET: Historial de reproducción (últimas 25 canciones que sonaron de verdad)
app.get('/api/history', (req, res) => {
  res.json({ history: historyLog });
});

// GET: Búsqueda en YouTube (primeros 15 resultados)
app.get('/api/youtube-search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Query requerida' });
  try {
    const args = [
      '--js-runtimes', 'node',
      '--no-update',
      '--dump-json',
      '--no-download',
      '--flat-playlist',
      `ytsearch15:${q}`
    ];
    const output = await ytDlpWrap.execPromise(args);
    const lines = output.trim().split('\n').filter(l => l.trim());
    const results = lines.map(l => {
      try {
        const e = JSON.parse(l);
        const id = e.id;
        const url = e.webpage_url || e.url || (id ? `https://www.youtube.com/watch?v=${id}` : null);
        if (!url) return null;
        return {
          title:     e.title || 'Sin título',
          url,
          duration:  e.duration || 0,
          thumbnail: id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null,
          channel:   e.uploader || e.channel || ''
        };
      } catch { return null; }
    }).filter(Boolean);
    res.json({ results });
  } catch (error) {
    console.error('[YT Search]', error.message);
    res.status(500).json({ error: 'Error en búsqueda', details: error.message });
  }
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

// Auto-actualizar yt-dlp en segundo plano al arrancar
function autoUpdateYtDlp() {
  console.log('[yt-dlp] Comprobando actualizaciones...');
  const proc = spawn('yt-dlp', ['-U'], { stdio: 'pipe' });
  let out = '';
  proc.stdout.on('data', d => { out += d.toString(); });
  proc.stderr.on('data', d => { out += d.toString(); });
  proc.on('close', code => {
    const updated = out.includes('Updated') || out.includes('updated');
    const upToDate = out.includes('up to date') || out.includes('up-to-date') || out.includes('al día');
    if (updated) console.log('[yt-dlp] ✅ Actualizado a la última versión');
    else if (upToDate || code === 0) console.log('[yt-dlp] ✅ Ya está actualizado');
    else console.log('[yt-dlp] ⚠️  No se pudo actualizar automáticamente. Ejecuta manualmente: yt-dlp -U');
  });
  proc.on('error', () => {
    console.log('[yt-dlp] ⚠️  yt-dlp no encontrado en PATH para actualizar');
  });
}

// Cargar estado y configuración al iniciar
loadServerConfig();
loadState();
StickerServer.init();

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

  // 1. Actualizar yt-dlp en segundo plano (no bloquea el arranque)
  autoUpdateYtDlp();

  // 2. Seleccionar CABLE Input automáticamente
  await selectCableInputDevice();

  // 3. Iniciar cloudflared
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
