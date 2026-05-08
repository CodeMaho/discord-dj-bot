// ============================================
// Discord DJ Controller - Frontend
// ============================================

// ============================================
// CONFIGURACIÓN DEL BACKEND
// ============================================

let backendUrl = '';
let configLoaded = false;

// Cargar URL del backend desde el API PHP en IONOS
async function loadBackendUrlFromHosting() {
    try {
        // El API PHP está en el mismo servidor que el frontend (IONOS)
        const response = await fetch('/api/config.php', {
            method: 'GET',
            cache: 'no-cache'  // Evitar caché
        });
        console.log('[Config] Respuesta PHP status:', response.status);

        if (response.ok) {
            const text = await response.text();
            console.log('[Config] Respuesta PHP raw:', text);

            try {
                const data = JSON.parse(text);
                if (data.backendUrl) {
                    console.log('[Config] URL cargada desde IONOS:', data.backendUrl);
                    return data.backendUrl;
                } else {
                    console.log('[Config] PHP respondió pero sin backendUrl configurada');
                }
            } catch (parseError) {
                console.error('[Config] Error parseando JSON:', parseError, 'Raw:', text);
            }
        } else {
            console.log('[Config] PHP respondió con error:', response.status);
        }
    } catch (error) {
        console.error('[Config] API PHP no disponible:', error.message);
    }
    return null;
}

// Guardar URL del backend en IONOS (via PHP)
async function saveBackendUrlToHosting(url) {
    try {
        const response = await fetch('/api/config.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backendUrl: url })
        });
        if (response.ok) {
            const data = await response.json();
            console.log('[Config] URL guardada en IONOS:', data);
            return true;
        }
    } catch (error) {
        console.error('[Config] Error guardando en IONOS:', error);
    }
    return false;
}

// Intentar cargar desde archivo JSON estático (fallback si PHP no funciona)
async function loadBackendUrlFromJson() {
    try {
        const response = await fetch('/api/backend-url.json', { cache: 'no-cache' });
        if (response.ok) {
            const data = await response.json();
            if (data.backendUrl) {
                console.log('[Config] URL cargada desde JSON estático:', data.backendUrl);
                return data.backendUrl;
            }
        }
    } catch (error) {
        console.log('[Config] JSON estático no disponible');
    }
    return null;
}

// Obtener URL inicial (fallback si PHP no está disponible)
function getInitialBackendUrl() {
    // Prioridad 1: config.js (archivo estático)
    if (typeof DJ_CONFIG !== 'undefined' && DJ_CONFIG.BACKEND_URL) {
        console.log('[Config] Usando URL de config.js:', DJ_CONFIG.BACKEND_URL);
        return DJ_CONFIG.BACKEND_URL;
    }
    // Prioridad 2: localStorage (desarrollo local)
    const stored = localStorage.getItem('backendUrl');
    if (stored) {
        console.log('[Config] Usando URL de localStorage:', stored);
        return stored;
    }
    // Prioridad 3: mismo origen (modo local)
    console.log('[Config] Usando origen local');
    return '';
}

// Devuelve true si el cliente está accediendo desde la misma máquina que el servidor
function isLocalAccess() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1';
}

function getBackendUrl() {
    // En acceso local siempre usar el origen de la página (evita intentar resolver el túnel)
    if (isLocalAccess()) return window.location.origin;

    if (backendUrl) {
        let url = backendUrl.replace(/\/$/, ''); // Quitar trailing slash
        // Asegurar que tenga protocolo
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        return url;
    }
    return window.location.origin;
}

function getWebSocketUrl() {
    const base = getBackendUrl();
    const protocol = base.startsWith('https') ? 'wss:' : 'ws:';
    const host = base.replace(/^https?:\/\//, '');
    return `${protocol}//${host}`;
}

function saveBackendUrlLocal(url) {
    // Asegurar que tenga protocolo antes de guardar
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    backendUrl = url;
    if (url) {
        localStorage.setItem('backendUrl', url);
    } else {
        localStorage.removeItem('backendUrl');
        // Si se borra, volver a usar config.js si existe
        backendUrl = getInitialBackendUrl();
    }
}

// Guardar configuración en el servidor
async function saveConfigToServer(config) {
    try {
        const response = await fetch(`${getBackendUrl()}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await response.json();
        if (data.success) {
            console.log('[Config] Guardado en servidor:', config);
        }
        return data;
    } catch (error) {
        console.error('[Config] Error guardando en servidor:', error);
        return null;
    }
}

// Cargar configuración del servidor
async function loadConfigFromServer() {
    try {
        const response = await fetch(`${getBackendUrl()}/api/config`);
        const config = await response.json();
        console.log('[Config] Cargado del servidor:', config);
        return config;
    } catch (error) {
        console.error('[Config] Error cargando del servidor:', error);
        return null;
    }
}

// ============================================
// ESTADO DE LA APLICACIÓN
// ============================================

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Modo polling HTTP (fallback cuando WebSocket está bloqueado)
let pollingMode     = false;
let wsFailCycles    = 0;      // ciclos completos de 5 reintentos fallidos
let pollingInterval = null;   // setInterval de polling /api/status
let wsRetryTimer    = null;   // setInterval de reintento WS cada 60s
const BASE_RECONNECT_DELAY = 1000;
let progressInterval = null;
let isDraggingQueue = false;    // Bloquear re-renders de la cola durante drag
let queueDragInitialized = false; // Inicializar drag solo una vez
let currentStatus = {
    url: '',
    title: 'Ninguna',
    status: 'stopped',
    duration: 0,
    elapsed: 0
};
let pendingClipFile = null; // Archivo local seleccionado para el clip

// Elementos del DOM
const elements = {
    urlInput: document.getElementById('urlInput'),
    playBtn: document.getElementById('playBtn'),
    addQueueBtn: document.getElementById('addQueueBtn'),
    createPlaylistBtn: document.getElementById('createPlaylistBtn'),
    stopBtn: document.getElementById('stopBtn'),
    clearBtn: document.getElementById('clearBtn'),
    currentSong: document.getElementById('currentSong'),
    statusText: document.getElementById('statusText'),
    statusIndicator: document.querySelector('.status-indicator'),
    connectionStatus: document.getElementById('connectionStatus'),
    queueCount: document.getElementById('queueCount'),
    queueContainer: document.getElementById('queueContainer'),
    skipBtn: document.getElementById('skipBtn'),
    clearQueueBtn: document.getElementById('clearQueueBtn'),
    progressFill: document.getElementById('progressFill'),
    currentTime: document.getElementById('currentTime'),
    totalTime: document.getElementById('totalTime'),
    // Panel de configuración (simplificado)
    backendUrlInput: document.getElementById('backendUrlInput'),
    saveBackendBtn: document.getElementById('saveBackendBtn'),
    currentBackendUrl: document.getElementById('currentBackendUrl'),
    settingsToggle: document.getElementById('settingsToggle'),
    settingsPanel: document.getElementById('settingsPanel'),
    pauseResumeBtn: document.getElementById('pauseResumeBtn'),
    reviveBtn: document.getElementById('reviveBtn'),
    // Clip de Radio
    clipInput: document.getElementById('clipInput'),
    clipBtn: document.getElementById('clipBtn'),
    clipStopBtn: document.getElementById('clipStopBtn'),
    clipStatus: document.getElementById('clipStatus'),
    clipStatusText: document.getElementById('clipStatusText'),
    clipFileInput: document.getElementById('clipFileInput'),
    clipFileLabel: document.getElementById('clipFileLabel'),
    clipFileClearBtn: document.getElementById('clipFileClearBtn'),
    clipMusicVolumeSlider: document.getElementById('clipMusicVolumeSlider'),
    clipMusicVolumeValue: document.getElementById('clipMusicVolumeValue'),
    clipVolumeSlider: document.getElementById('clipVolumeSlider'),
    clipVolumeValue: document.getElementById('clipVolumeValue')
};

// ============================================
// INICIALIZACIÓN
// ============================================

// ============================================
// BOUNCING STICKERS — server-driven
// El servidor (StickerServer) es la única autoridad de física, colisiones y vidas.
// El cliente solo renderiza el estado recibido por WebSocket y envía eventos de
// grab/move/release. Todos los clientes ven exactamente lo mismo.
// ============================================

const STICKER_VW = 1920, STICKER_VH = 1080;  // espacio virtual del servidor

const StickersSystem = (() => {
    let overlay   = null;
    let els       = {};        // id → { img, nameEl, wrapper }  (solo permanentes/flotantes)
    let crowdFans = {};        // id → { wrap, img, nameEl }     (usuarios no-permanentes en la arena)
    let grabbedId = null;
    const mouseHistory = [];   // {x, y, t} últimos 80ms

    // ── Overlay ───────────────────────────────────────────────────────────
    function ensureOverlay() {
        overlay = document.getElementById('stickers-overlay');
        if (!overlay) {
            overlay    = document.createElement('div');
            overlay.id = 'stickers-overlay';
            document.body.appendChild(overlay);
        }
    }

    // ── Crear/obtener elemento para un sticker ────────────────────────────
    function getOrCreate(id, url) {
        if (els[id]) return els[id];
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;';

        const nameEl = document.createElement('div');
        nameEl.className = 'sticker-name';

        const img = document.createElement('img');
        img.src       = url.startsWith('/') ? `${getBackendUrl()}${url}` : url;
        img.className = 'sticker';
        img.draggable = false;

        wrapper.appendChild(nameEl);
        wrapper.appendChild(img);
        overlay.appendChild(wrapper);

        img.addEventListener('mousedown', (e) => {
            e.preventDefault();
            grabbedId = id;
            mouseHistory.length = 0;
            sendToServer({ type: 'grab', id });
        });

        els[id] = { img, nameEl, wrapper, _pauseCanvas: null };
        return els[id];
    }

    // ── Fans en la arena (stickers no-permanentes) ───────────────────────
    function getCrowdFan(id, s) {
        if (crowdFans[id]) return crowdFans[id];
        const crowdEl = document.querySelector('.crowd');
        if (!crowdEl) return null;

        const wrap = document.createElement('div');
        wrap.className = 'fan-wrap';
        wrap.dataset.fanId = id;

        const nameEl = document.createElement('span');
        nameEl.className = 'fan-name';
        nameEl.textContent = s.username || '?';

        const img = document.createElement('img');
        img.className = 'fan';
        img.src = s.gifUrl.startsWith('/') ? `${getBackendUrl()}${s.gifUrl}` : s.gifUrl;
        img.alt = s.username || '';
        img.draggable = false;

        wrap.appendChild(nameEl);
        wrap.appendChild(img);
        crowdEl.appendChild(wrap);

        crowdFans[id] = { wrap, img, nameEl };
        if (_currentDjUsername && (s.username || '') === _currentDjUsername) wrap.style.display = 'none';
        return crowdFans[id];
    }

    function cleanupCrowdFans(activeIds) {
        Object.keys(crowdFans).forEach(strId => {
            if (!activeIds.has(Number(strId))) {
                crowdFans[strId].wrap.remove();
                delete crowdFans[strId];
            }
        });
    }

    // ── Enviar mensaje al servidor via WebSocket ───────────────────────────
    function sendToServer(data) {
        if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    // ── Eventos globales de ratón ─────────────────────────────────────────
    document.addEventListener('mousemove', (e) => {
        const now = performance.now();
        mouseHistory.push({ x: e.clientX, y: e.clientY, t: now });
        while (mouseHistory.length > 1 && now - mouseHistory[0].t > 80) mouseHistory.shift();
        if (grabbedId !== null) {
            const W = window.innerWidth, H = window.innerHeight;
            sendToServer({
                type: 'move',
                id:   grabbedId,
                cx:   (e.clientX / W) * STICKER_VW,
                cy:   (e.clientY / H) * STICKER_VH,
            });
        }
    });

    document.addEventListener('mouseup', () => {
        if (grabbedId === null) return;
        const id = grabbedId;
        grabbedId = null;
        const W = window.innerWidth, H = window.innerHeight;
        let vx = 0, vy = 0;
        if (mouseHistory.length >= 2) {
            const a  = mouseHistory[0];
            const b  = mouseHistory[mouseHistory.length - 1];
            const dt = (b.t - a.t) / 1000;
            if (dt > 0.005) {
                const maxSpd = 1600;
                vx = Math.max(-maxSpd, Math.min(maxSpd, ((b.x - a.x) / dt) * (STICKER_VW / W)));
                vy = Math.max(-maxSpd, Math.min(maxSpd, ((b.y - a.y) / dt) * (STICKER_VH / H)));
            }
        }
        sendToServer({ type: 'release', id, vx, vy });
    });

    // ── Loop de interpolación a 60fps ─────────────────────────────────────
    // El servidor emite estado a ~5fps con posición + velocidad.
    // El cliente extrapola linealmente a 60fps para movimiento perfectamente suave.
    let stickersData = {};  // id → { ...campos, vx, vy, serverTime }
    let renderRafId  = null;
    const MAX_LIVES  = 5;

    function applyToDOM(s, cx, cy) {
        const entry = getOrCreate(s.id, s.gifUrl);
        const { img, nameEl, wrapper } = entry;
        const W         = window.innerWidth;
        const H         = window.innerHeight;
        const scaleX    = W / STICKER_VW;
        const scaleY    = H / STICKER_VH;
        const sizeScale = Math.min(scaleX, scaleY);
        const pxSize    = s.size * sizeScale;
        const pxCx      = cx * scaleX;
        const pxCy      = cy * scaleY;

        wrapper.style.transform = `translate(${(pxCx - pxSize / 2).toFixed(1)}px,${(pxCy - pxSize / 2).toFixed(1)}px)`;
        img.style.width         = pxSize + 'px';
        img.style.height        = pxSize + 'px';
        img.style.cursor        = s.grabbed ? 'grabbing' : 'grab';
        img.style.pointerEvents = 'auto';

        if (s.invincible) img.classList.add('invincible');
        else              img.classList.remove('invincible');

        // Nombre del usuario encima del GIF
        nameEl.textContent  = s.username || '';
        nameEl.style.width  = pxSize + 'px';

        // Sincronizar tamaño del canvas de pausa si existe
        if (entry._pauseCanvas) {
            entry._pauseCanvas.style.width  = pxSize + 'px';
            entry._pauseCanvas.style.height = pxSize + 'px';
            entry._pauseCanvas.style.cursor = img.style.cursor;
        }
    }

    function startRenderLoop() {
        if (renderRafId) return;
        function frame(now) {
            renderRafId = requestAnimationFrame(frame);
            if (!overlay) return;
            const activeIds = new Set();
            Object.values(stickersData).forEach(s => {
                activeIds.add(s.id);
                if (s.permanent) {
                    // Stickers permanentes (zorotwerk): flotan con física
                    let cx = s.cx, cy = s.cy;
                    if (!s.grabbed) {
                        const dt = Math.min((now - s.serverTime) / 1000, 0.25);
                        cx = s.cx + (s.vx || 0) * dt;
                        cy = s.cy + (s.vy || 0) * dt;
                        const r = s.size / 2;
                        cx = Math.max(r, Math.min(STICKER_VW - r, cx));
                        cy = Math.max(r, Math.min(STICKER_VH - r, cy));
                    }
                    applyToDOM(s, cx, cy);
                } else {
                    // Usuarios normales: aparecen como fans en la arena
                    getCrowdFan(s.id, s);
                }
            });
            // Limpiar stickers flotantes eliminados
            Object.keys(els).forEach(strId => {
                if (!activeIds.has(Number(strId))) { els[strId].wrapper.remove(); delete els[strId]; }
            });
            // Limpiar fans de la arena eliminados
            cleanupCrowdFans(activeIds);
        }
        renderRafId = requestAnimationFrame(frame);
    }

    function stopRenderLoop() {
        if (renderRafId) { cancelAnimationFrame(renderRafId); renderRafId = null; }
    }

    // ── render() para física local (usa posiciones ya calculadas) ─────────
    function render(stickers) {
        if (!overlay) return;
        const activeIds = new Set();
        stickers.forEach(s => {
            activeIds.add(s.id);
            if (s.permanent) {
                applyToDOM(s, s.cx, s.cy);
            } else {
                getCrowdFan(s.id, s);
            }
        });
        Object.keys(els).forEach(strId => {
            if (!activeIds.has(Number(strId))) { els[strId].wrapper.remove(); delete els[strId]; }
        });
        cleanupCrowdFans(activeIds);
    }

    // ── Gravedad local (fallback cuando el servidor está desconectado) ────
    let lastStickersState  = [];
    let localPhysicsActive = false;
    let localRafId         = null;
    let localLastTime      = 0;
    const LOCAL_GRAVITY    = 1400;

    function startLocalPhysics() {
        if (localPhysicsActive || !lastStickersState.length) return;
        stopRenderLoop();  // parar interpolación del servidor
        localPhysicsActive = true;
        const local = lastStickersState.map(s => ({ ...s, grabbed: false }));
        localLastTime = performance.now();

        function tick(now) {
            if (!localPhysicsActive) return;
            const dt = Math.min((now - localLastTime) / 1000, 0.05);
            localLastTime = now;
            local.forEach(s => {
                s.vy = (s.vy || 0) + LOCAL_GRAVITY * dt;
                s.vx = (s.vx || 0) * 0.97;
                s.cx += s.vx * dt;
                s.cy += (s.vy || 0) * dt;
                const r = s.size / 2;
                if (s.cx - r < 0)          { s.cx = r;              s.vx =  Math.abs(s.vx) * 0.35; }
                if (s.cx + r > STICKER_VW) { s.cx = STICKER_VW - r; s.vx = -Math.abs(s.vx) * 0.35; }
                if (s.cy + r > STICKER_VH) { s.cy = STICKER_VH - r; s.vy = -Math.abs(s.vy) * 0.1; s.vx *= 0.8; }
            });
            render(local);
            localRafId = requestAnimationFrame(tick);
        }
        localRafId = requestAnimationFrame(tick);
    }

    function stopLocalPhysics() {
        if (!localPhysicsActive) return;
        localPhysicsActive = false;
        if (localRafId) { cancelAnimationFrame(localRafId); localRafId = null; }
        startRenderLoop();  // retomar interpolación del servidor
    }

    // ── API pública ───────────────────────────────────────────────────────
    function init() { ensureOverlay(); }

    function onServerState(stickers) {
        lastStickersState = stickers;
        if (localPhysicsActive) return;
        if (!overlay) ensureOverlay();
        const now = performance.now();
        const activeIds = new Set(stickers.map(s => s.id));
        stickers.forEach(s => { stickersData[s.id] = { ...s, serverTime: now }; });
        Object.keys(stickersData).forEach(strId => {
            if (!activeIds.has(Number(strId))) delete stickersData[strId];
        });
        startRenderLoop();  // no-op si ya está corriendo
    }

    // ── Efecto glow en el beat ────────────────────────────────────────────
    // El beat llega por WebSocket. En vez de mover los stickers (tirones),
    // se aplica un drop-shadow CSS que se desvanece en ~400ms.
    function onExternalBeat(intensity = 1.0) {
        const strength = Math.min(intensity, 3.0);
        const blurPx   = Math.round(12 + strength * 16);   // 12–60 px
        const spread   = Math.round(3  + strength * 5);    // 3–18 px
        Object.entries(stickersData).forEach(([strId, s]) => {
            const entry = els[strId];
            if (!entry) return;
            const hue   = s.hue || 0;
            const alpha = Math.min(0.70 + strength * 0.10, 1.0);
            // Glow instantáneo en el beat, fade-out suave después
            entry.img.style.transition = 'none';
            entry.img.style.filter = `drop-shadow(0 0 ${blurPx}px hsla(${hue},100%,70%,${alpha})) drop-shadow(0 0 ${spread}px hsla(${hue},100%,95%,1.0))`;
            clearTimeout(entry.img._glowTimer);
            entry.img._glowTimer = setTimeout(() => {
                entry.img.style.transition = 'filter 0.5s ease-out';
                entry.img.style.filter = '';
            }, 80);
        });
    }

    let _playing = false;

    function _freezeGif(entry) {
        const { img } = entry;
        if (entry._pauseCanvas || !img.complete || !img.naturalWidth) return;
        try {
            const w = parseInt(img.style.width)  || img.naturalWidth;
            const h = parseInt(img.style.height) || img.naturalHeight;
            const canvas = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            canvas.style.width        = img.style.width;
            canvas.style.height       = img.style.height;
            canvas.style.cursor       = img.style.cursor;
            canvas.style.pointerEvents = img.style.pointerEvents;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            img.insertAdjacentElement('afterend', canvas);
            img.style.display = 'none';
            entry._pauseCanvas = canvas;
        } catch (_) {}
    }

    function _resumeGif(entry, s) {
        if (!entry._pauseCanvas) return;
        entry._pauseCanvas.remove();
        entry._pauseCanvas = null;
        entry.img.style.display = '';
        const src = s.gifUrl.startsWith('/') ? `${getBackendUrl()}${s.gifUrl}` : s.gifUrl;
        entry.img.src = src;
    }

    function setPlaying(val) {
        _playing = val;
        Object.entries(stickersData).forEach(([strId, s]) => {
            if (!s.permanent) return;
            const entry = els[Number(strId)];
            if (!entry) return;
            val ? _resumeGif(entry, s) : _freezeGif(entry);
        });
    }

    let _currentDjUsername = null;

    function setDjUsername(username) {
        _currentDjUsername = username || null;
        Object.values(crowdFans).forEach(fan => {
            const fanUsername = fan.nameEl?.textContent || '';
            fan.wrap.style.display = (_currentDjUsername && fanUsername === _currentDjUsername) ? 'none' : '';
        });
    }

    return { init, onServerState, onExternalBeat, setPlaying, setDjUsername, sendToServer, startLocalPhysics, stopLocalPhysics };
})();

// ============================================
// WAVEFORM RENDERER
// Visualiza en canvas la amplitud PCM enviada por el servidor vía WebSocket.
// Corre a 60fps con interpolación suave; cuando no hay música baja a cero.
// ============================================
const WaveformRenderer = (() => {
    const BARS = 64;
    let canvas = null, ctx = null;
    let current  = new Float32Array(BARS).fill(0);  // valores que se dibujan
    let target   = new Float32Array(BARS).fill(0);  // valores objetivo
    let rafId    = null;
    let playing  = false;

    function init() {
        canvas = document.getElementById('waveformCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        // Diferir resize hasta que el layout esté calculado
        requestAnimationFrame(() => { resize(); startLoop(); });
        window.addEventListener('resize', resize);
    }

    function resize() {
        if (!canvas) return;
        canvas.width  = canvas.clientWidth  || 560;
        canvas.height = canvas.clientHeight || 56;
    }

    // Recibe array de 64 enteros [0-255] del servidor
    function onData(bars) {
        const inv = 1 / 255;
        for (let i = 0; i < Math.min(bars.length, BARS); i++) {
            target[i] = bars[i] * inv;
        }
    }

    function setPlaying(val) {
        playing = val;
        if (!val) target.fill(0);
    }

    function startLoop() {
        if (rafId) return;
        function frame() {
            rafId = requestAnimationFrame(frame);
            // Attack rápido (0.25) para que reaccione bien; decay más lento (0.15)
            const lerpUp   = 0.25;
            const lerpDown = 0.15;
            for (let i = 0; i < BARS; i++) {
                const diff = target[i] - current[i];
                current[i] += diff * (diff > 0 ? lerpUp : lerpDown);
            }
            draw();
        }
        rafId = requestAnimationFrame(frame);
    }

    function draw() {
        if (!ctx || !canvas) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const barW  = W / BARS;
        const gap   = Math.max(1, barW * 0.2);
        const bW    = Math.max(1, barW - gap);
        const half  = H / 2;
        const maxAmp = half * 0.92;   // amplitud máxima = 92% del semialtura

        // Gradiente vertical: azul Discord arriba/abajo, verde Discord en centro
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0,   'rgba(88,101,242,0.80)');
        grad.addColorStop(0.5, 'rgba(87,242,135,0.95)');
        grad.addColorStop(1,   'rgba(88,101,242,0.80)');
        ctx.fillStyle = grad;

        for (let i = 0; i < BARS; i++) {
            const v    = current[i];
            const barH = Math.max(2, v * maxAmp * 2);  // simétrico: sube y baja desde centro
            const x    = i * barW + gap / 2;
            const y    = half - barH / 2;
            ctx.fillRect(x, y, bW, barH);
        }
    }

    return { init, onData, setPlaying };
})();

async function initApp() {
    console.log('[Init] Iniciando...');
    initBackendSettings();
    attachEventListeners();
    await tryConnect();
    StickersSystem.init();
    WaveformRenderer.init();
    setInterval(async () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log('[AutoRetry] Reintentando cargar configuración...');
            await tryConnect();
        }
    }, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.djAuthenticated) {
        initApp();
    } else {
        window.djPendingInit = initApp;
    }
});

async function tryConnect() {
    // Si se accede desde localhost, no intentar cargar el túnel remoto: siempre usar origen local
    if (isLocalAccess()) {
        backendUrl = '';
        configLoaded = true;
        console.log('[Init] Acceso local detectado — usando origen local');
    } else {
        // 1. Intentar cargar URL del backend desde IONOS
        let hostedUrl = await loadBackendUrlFromHosting();

        if (!hostedUrl) {
            console.log('[Init] PHP no disponible, intentando JSON estático...');
            hostedUrl = await loadBackendUrlFromJson();
        }

        if (hostedUrl) {
            backendUrl = hostedUrl;
            console.log('[Init] URL del backend:', backendUrl);
        } else {
            backendUrl = getInitialBackendUrl();
            console.log('[Init] Usando fallback:', backendUrl || '(origen local)');
        }
        configLoaded = true;
    }

    updateBackendUrlDisplay();

    // 2. Restaurar estado del reproductor
    await restoreState();

    // 3. Conectar WebSocket
    initializeWebSocket();
}

// ============================================
// CONFIGURACIÓN DEL BACKEND UI
// ============================================

function initBackendSettings() {
    // Mostrar URL actual
    updateBackendUrlDisplay();

    // Cargar URL guardada en el input
    if (elements.backendUrlInput && backendUrl) {
        elements.backendUrlInput.value = backendUrl;
    }

    // Toggle del panel de configuración
    if (elements.settingsToggle) {
        elements.settingsToggle.addEventListener('click', () => {
            if (elements.settingsPanel) {
                elements.settingsPanel.classList.toggle('hidden');
                elements.settingsToggle.textContent =
                    elements.settingsPanel.classList.contains('hidden') ? '⚙️' : '✕';
            }
        });
    }

    // Guardar URL del backend
    if (elements.saveBackendBtn) {
        elements.saveBackendBtn.addEventListener('click', async () => {
            const newUrl = elements.backendUrlInput?.value.trim() || '';

            // Guardar en IONOS (PHP) para que todos los usuarios lo vean
            showNotification('Guardando', 'Guardando configuración...', 'info');

            const saved = await saveBackendUrlToHosting(newUrl);
            if (saved) {
                showNotification('Guardado', 'URL guardada. Todos los usuarios usarán esta URL.', 'success');
            } else {
                // Fallback a localStorage si PHP no está disponible
                saveBackendUrlLocal(newUrl);
                showNotification('Guardado', 'URL guardada localmente (PHP no disponible).', 'info');
            }

            // Actualizar variable local
            backendUrl = newUrl;
            updateBackendUrlDisplay();

            // Reconectar WebSocket con nueva URL
            if (ws) {
                ws.close();
            }
            reconnectAttempts = 0;
            setTimeout(() => initializeWebSocket(), 500);
        });
    }

    // Resetear URL del backend (usar servidor local)
    if (elements.resetBackendBtn) {
        elements.resetBackendBtn.addEventListener('click', async () => {
            // Limpiar en IONOS
            await saveBackendUrlToHosting('');
            saveBackendUrlLocal('');

            backendUrl = '';
            if (elements.backendUrlInput) {
                elements.backendUrlInput.value = '';
            }
            updateBackendUrlDisplay();
            showNotification('Reseteado', 'Usando servidor local. Reconectando...', 'info');

            // Reconectar WebSocket
            if (ws) {
                ws.close();
            }
            reconnectAttempts = 0;
            setTimeout(() => initializeWebSocket(), 500);
        });
    }
}

function updateBackendUrlDisplay() {
    if (elements.currentBackendUrl) {
        const url = getBackendUrl();
        elements.currentBackendUrl.textContent = url || '(no configurado)';
        elements.currentBackendUrl.title = url || 'No hay URL configurada';

        // Indicador visual de estado
        if (url && url !== window.location.origin) {
            elements.currentBackendUrl.style.color = '#4ade80'; // Verde - configurado
        } else {
            elements.currentBackendUrl.style.color = '#fbbf24'; // Amarillo - local/no configurado
        }
    }
}

// Manejar actualización de configuración desde el servidor
function handleConfigUpdate(config) {
    if (!config) return;

    // En acceso local ignorar el tunnel URL que manda el servidor
    if (isLocalAccess()) return;

    // Actualizar URL del backend si viene del servidor
    if (config.backendUrl && config.backendUrl !== backendUrl) {
        console.log('[Config] URL actualizada:', config.backendUrl);
        if (elements.backendUrlInput) {
            elements.backendUrlInput.value = config.backendUrl;
        }
    }
}

// ============================================
// WEBSOCKET
// ============================================

function initializeWebSocket() {
    // No reconectar si ya hay conexión activa
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('[WebSocket] Ya conectado');
        return;
    }

    // Cerrar conexión anterior si existe
    if (ws) {
        ws.close();
    }

    const wsUrl = getWebSocketUrl();
    console.log('[WebSocket] Conectando a:', wsUrl);

    updateConnectionStatusConnecting();
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket conectado');
        reconnectAttempts = 0;
        wsFailCycles      = 0;
        stopPollingFallback();              // salir de modo HTTP si estábamos en él
        updateConnectionStatus(true);
        showNotification('Conectado', 'Conexión WebSocket establecida', 'success');
        StickersSystem.stopLocalPhysics();  // el servidor vuelve a tomar el control

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'status' && data.data) {
                // Log detallado para debugging
                const song = data.data.currentSong;
                console.log(`[WS Update] Status: ${song?.status}, Elapsed: ${song?.elapsed}s, Queue: ${data.data.queueLength} items`);

                updateStatus(data.data);
            }

            if (data.type === 'config' && data.data) {
                console.log('[WS Config] Recibida configuración:', data.data);
                handleConfigUpdate(data.data);
            }

            if (data.type === 'beat') {
                StickersSystem.onExternalBeat(data.intensity);
            }

            if (data.type === 'waveform') {
                WaveformRenderer.onData(data.bars);
            }

            if (data.type === 'stickers') {
                StickersSystem.onServerState(data.stickers);
            }

            if (data.type === 'survivor') {
                // El render ya maneja el flag survivor en onServerState
                console.log('[Stickers] ¡Último superviviente!', data.id);
            }

            if (data.type === 'clip') {
                updateClipStatus(data.status, data.title);
            }
        } catch (error) {
            console.error('Error procesando mensaje WebSocket:', error);
        }
    };
    
    ws.onerror = (error) => {
        const url = ws.url || wsUrl;
        console.error(`[WebSocket] Fallo de conexión a: ${url}`);
        console.error('[WebSocket] Causas comunes: túnel Cloudflare caído/cambiado, red del cliente bloqueando WSS, o servidor apagado.');
        console.error('[WebSocket] Detalle:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket desconectado');
        updateConnectionStatus(false);
        StickersSystem.startLocalPhysics();  // stickers caen al suelo
        
        // Exponential backoff con máximo de intentos
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1); // 1s, 2s, 4s, 8s, 16s
            console.log(`Reconectando en ${delay}ms (intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            
            reconnectTimer = setTimeout(() => {
                console.log('Intentando reconectar WebSocket...');
                initializeWebSocket();
            }, delay);
        } else {
            // Si ya estamos en modo polling, el wsRetryTimer se encarga; no hacer nada más
            if (pollingMode) return;

            wsFailCycles++;
            console.error(`[WS] Ciclo de fallos ${wsFailCycles}/2 — todos los reintentos agotados`);

            if (wsFailCycles >= 2) {
                // 10 intentos fallidos en total → WebSocket bloqueado, activar polling HTTP
                startPollingFallback();
            } else {
                // Primer ciclo fallido: puede ser URL caducada del túnel, reintentar con URL fresca
                showNotification('Reconectando', 'Buscando servidor actualizado...', 'info');
                setTimeout(async () => {
                    reconnectAttempts = 0;
                    await tryConnect();
                }, 5000);
            }
        }
    };
}

function updateConnectionStatus(connected) {
    if (!elements.connectionStatus) return;

    const statusText = elements.connectionStatus.querySelector('.status-text');

    if (connected) {
        elements.connectionStatus.classList.add('connected');
        elements.connectionStatus.classList.remove('disconnected', 'connecting', 'polling', 'offline');
        if (statusText) statusText.textContent = 'Conectado';
    } else {
        elements.connectionStatus.classList.remove('connected', 'polling', 'offline');
        elements.connectionStatus.classList.add('disconnected');
        if (statusText) statusText.textContent = 'Desconectado';
    }
}

function updateConnectionStatusConnecting() {
    if (!elements.connectionStatus) return;

    elements.connectionStatus.classList.remove('connected', 'disconnected', 'polling');
    elements.connectionStatus.classList.add('connecting');
    const statusText = elements.connectionStatus.querySelector('.status-text');
    if (statusText) statusText.textContent = 'Conectando...';
}

function updateConnectionStatusPolling() {
    if (!elements.connectionStatus) return;
    const statusText = elements.connectionStatus.querySelector('.status-text');
    elements.connectionStatus.classList.remove('connected', 'disconnected', 'connecting', 'offline');
    elements.connectionStatus.classList.add('polling');
    if (statusText) statusText.textContent = 'Solo HTTP';
}

function updateConnectionStatusOffline() {
    if (!elements.connectionStatus) return;
    const statusText = elements.connectionStatus.querySelector('.status-text');
    elements.connectionStatus.classList.remove('connected', 'disconnected', 'connecting', 'polling');
    elements.connectionStatus.classList.add('offline');
    if (statusText) statusText.textContent = 'Servidor offline';
}

// Probar si el servidor corre localmente (mismo equipo que el host del bot)
// Los Quick Tunnels de Cloudflare a veces no admiten conexiones "hairpin" (loopback)
// desde la propia máquina que ejecuta cloudflared.
async function tryLocalhostFallback() {
    const candidates = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    for (const url of candidates) {
        try {
            const res = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1200) });
            if (res.ok) {
                console.log(`[Fallback] Servidor encontrado en ${url} — usando localhost directamente`);
                backendUrl = url;
                updateBackendUrlDisplay();
                updateConnectionStatusConnecting();
                reconnectAttempts = 0;
                initializeWebSocket();
                return true;
            }
        } catch (_) {}
    }
    return false;
}

// Intentar obtener URL fresca del backend desde IONOS y, si cambió, reconectar.
// Si IONOS no ayuda, intentar localhost (caso: el cliente ES el servidor).
async function tryRefreshAndReconnect() {
    console.log('[Polling] URL posiblemente caducada — buscando URL actualizada...');

    // 1. Intentar primero localhost (detección de "soy el servidor")
    const isLocal = await tryLocalhostFallback();
    if (isLocal) return true;

    // 2. Si no somos el servidor, buscar URL actualizada en IONOS
    const freshUrl = await loadBackendUrlFromHosting() || await loadBackendUrlFromJson();
    if (freshUrl && freshUrl !== backendUrl) {
        console.log('[Polling] Nueva URL detectada:', freshUrl);
        backendUrl = freshUrl;
        updateBackendUrlDisplay();
        reconnectAttempts = MAX_RECONNECT_ATTEMPTS - 1;
        initializeWebSocket();
        return true;
    }
    return false;
}

// Activar modo polling: WebSocket bloqueado, actualizamos estado por HTTP
async function startPollingFallback() {
    if (pollingMode) return;
    pollingMode = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    updateConnectionStatusPolling();
    showNotification('Modo HTTP', 'WebSocket bloqueado — controles funcionan, sin stickers en tiempo real', 'info');
    console.log('[Polling] Modo HTTP activado');

    let consecutiveErrors  = 0;
    let currentPollMs      = 3000;  // comienza rápido, se ralentiza si el servidor está offline

    async function doPoll() {
        if (!pollingMode) return;
        try {
            const res = await fetch(`${getBackendUrl()}/api/status`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data) updateStatus(data);
            // Éxito: resetear errores y volver a intervalo rápido
            if (consecutiveErrors > 0) {
                consecutiveErrors = 0;
                currentPollMs = 3000;
                updateConnectionStatusPolling();
                console.log('[Polling] Servidor accesible vía HTTP');
            }
        } catch (e) {
            consecutiveErrors++;
            console.warn(`[Polling] Error HTTP consecutivo #${consecutiveErrors}: ${e.message}`);

            if (consecutiveErrors === 3) {
                // Puede que el túnel haya cambiado URL; intentar refrescar
                const refreshed = await tryRefreshAndReconnect();
                if (!refreshed) {
                    // URL igual o PHP sin respuesta → servidor offline
                    updateConnectionStatusOffline();
                    currentPollMs = 30000;  // sondear cada 30s para no generar spam
                    console.warn('[Polling] Servidor parece offline — reduciendo frecuencia a 30s');
                }
            }
        }
        // Reprogramar siguiendo el intervalo actual
        if (pollingMode) pollingInterval = setTimeout(doPoll, currentPollMs);
    }

    // Primera llamada inmediata
    pollingInterval = setTimeout(doPoll, 0);

    // Intentar WebSocket + URL fresca cada 60s en segundo plano
    wsRetryTimer = setInterval(async () => {
        if (!pollingMode) return;
        console.log('[Polling] Reintentando WebSocket en segundo plano...');
        await tryRefreshAndReconnect();   // usar URL actualizada si existe
        reconnectAttempts = MAX_RECONNECT_ATTEMPTS - 1;  // solo 1 intento WS
        initializeWebSocket();
    }, 60000);
}

function stopPollingFallback() {
    if (!pollingMode) return;
    pollingMode  = false;
    wsFailCycles = 0;
    // pollingInterval es ahora un setTimeout, no setInterval
    if (pollingInterval) { clearTimeout(pollingInterval); pollingInterval = null; }
    if (wsRetryTimer)    { clearInterval(wsRetryTimer);   wsRetryTimer    = null; }
    console.log('[Polling] WebSocket restaurado — desactivando polling HTTP');
}

// ============================================
// MANEJO DE ESTADO
// ============================================

function updateStatus(data) {
    if (!data) return;

    const { currentSong: song, queue = [] } = data;

    // Log cambios de estado
    if (song && song.status !== currentStatus?.status) {
        console.log(`[Status] ${currentStatus?.status} → ${song.status}`);
    }

    if (song) {
        currentStatus = song;
        updateNowPlaying(song);
        updateProgress(song);
    }

    updateQueueDisplay(queue);
}

// Extraer URL de miniatura de YouTube
function extractThumbnailUrl(url) {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/);
    if (m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
    return null;
}

function updateNowPlaying(song) {
    if (!song) return;

    // Miniatura de la canción como fondo del panel now-playing
    const nowPlayingEl = document.querySelector('.now-playing');
    if (nowPlayingEl) {
        const thumbUrl  = extractThumbnailUrl(song.url);
        const isActive  = song.status === 'playing' || song.status === 'paused';
        if (thumbUrl && isActive) {
            nowPlayingEl.style.setProperty('--thumb-url', `url('${thumbUrl}')`);
            nowPlayingEl.classList.add('has-thumbnail');
        } else {
            nowPlayingEl.style.removeProperty('--thumb-url');
            nowPlayingEl.classList.remove('has-thumbnail');
        }
    }

    // Actualizar título
    if (elements.currentSong) {
        elements.currentSong.textContent = song.title || 'Ninguna canción';
    }

    // Mostrar quién añadió la canción
    let nowPlayingUser = document.getElementById('nowPlayingUser');
    if (!nowPlayingUser) {
        nowPlayingUser = document.createElement('div');
        nowPlayingUser.id = 'nowPlayingUser';
        nowPlayingUser.className = 'now-playing-user';
        elements.currentSong.insertAdjacentElement('afterend', nowPlayingUser);
    }
    if (song.addedBy && (song.status === 'playing' || song.status === 'paused')) {
        const loc = song.addedLocation ? ' · 📍 ' + escapeHtml(song.addedLocation) : '';
        nowPlayingUser.innerHTML = '👤 ' + escapeHtml(song.addedBy) + loc;
        nowPlayingUser.style.display = '';
    } else {
        nowPlayingUser.style.display = 'none';
    }
    
    // Actualizar estado
    if (elements.statusText) {
        const statusMap = {
            'playing': '▶️ Reproduciendo',
            'paused':  '⏸ Pausado',
            'stopped': '⏹️ Detenido',
            'error':   '❌ Error'
        };
        elements.statusText.textContent = statusMap[song.status] || 'Desconocido';
    }

    // Actualizar indicador visual
    if (elements.statusIndicator) {
        elements.statusIndicator.classList.remove('playing', 'stopped');
        elements.statusIndicator.classList.add(song.status === 'playing' ? 'playing' : 'stopped');
    }

    // Botón pause/resume: visible cuando hay canción activa (playing o paused)
    if (elements.pauseResumeBtn) {
        const active = song.status === 'playing' || song.status === 'paused';
        elements.pauseResumeBtn.style.display = active ? 'flex' : 'none';
        elements.pauseResumeBtn.textContent   = song.status === 'paused' ? '▶' : '⏸';
        elements.pauseResumeBtn.title         = song.status === 'paused' ? 'Reanudar' : 'Pausar';
    }

    // Sincronizar stickers y waveform con estado de reproducción
    const isPlaying = song.status === 'playing';
    StickersSystem.setPlaying(isPlaying);
    WaveformRenderer.setPlaying(isPlaying);

    // DJ Spotlight: mostrar el sticker del DJ en lugar de brookLogo cuando hay canción activa
    const djSpotlight = document.getElementById('dj-spotlight-img');
    const djTurntable = document.getElementById('dj-turntable-img');
    const djAvatar    = document.querySelector('.dj-avatar');
    const decks       = document.querySelector('.decks');
    const isActive    = song.status === 'playing' || song.status === 'paused';

    if (djSpotlight && djTurntable && djAvatar) {
        if (isActive && song.addedByGif) {
            const gifSrc = song.addedByGif.startsWith('/') ? `${getBackendUrl()}${song.addedByGif}` : song.addedByGif;
            if (djSpotlight.src !== gifSrc) djSpotlight.src = gifSrc;
            djSpotlight.style.display = '';
            djTurntable.style.display = '';
            djAvatar.style.display    = 'none';
            if (decks) decks.style.display = 'none';
        } else {
            djSpotlight.style.display = 'none';
            djTurntable.style.display = 'none';
            djAvatar.style.display    = '';
            if (decks) decks.style.display = '';
        }
    }

    // Ocultar el fan del DJ activo en el crowd
    StickersSystem.setDjUsername(isActive && song.addedBy ? song.addedBy : null);

    // Actualizar estado de botones
    updateButtonStates();
}

function updateProgress(song) {
    if (!song || !elements.progressFill) return;
    
    const elapsed = song.elapsed || 0;
    const duration = song.duration || 0;
    const percent = duration > 0 ? (elapsed / duration) * 100 : 0;
    
    elements.progressFill.style.width = percent + '%';
    
    // Actualizar tiempos
    if (elements.currentTime) {
        elements.currentTime.textContent = formatTime(elapsed);
    }
    if (elements.totalTime) {
        elements.totalTime.textContent = formatTime(duration);
    }
}

function updateQueueDisplay(queue = []) {
    if (!elements.queueContainer) return;
    // No re-renderizar mientras el usuario está arrastrando (evita destruir el drag en curso)
    if (isDraggingQueue) return;
    
    // Actualizar contador
    if (elements.queueCount) {
        const count = queue.length;
        elements.queueCount.textContent = count === 0 
            ? 'Cola vacía' 
            : `${count} canción${count === 1 ? '' : 'es'}`;
    }
    
    // Si cola vacía
    if (!queue || queue.length === 0) {
        elements.queueContainer.innerHTML = `
            <div class="empty-queue">
                <span class="empty-icon">📭</span>
                <p>Cola vacía</p>
                <small>Agrega canciones o playlists para comenzar</small>
            </div>
        `;
        if (elements.skipBtn) elements.skipBtn.disabled = true;
        if (elements.clearQueueBtn) elements.clearQueueBtn.disabled = true;
        return;
    }
    
    // Mostrar cola - validar cada canción
    elements.queueContainer.innerHTML = queue.map((song, index) => {
        if (!song || typeof song !== 'object') return '';
        const title = song.title && typeof song.title === 'string' ? song.title : 'Desconocido';
        const duration = typeof song.duration === 'number' ? song.duration : 0;
        return `
            <div class="queue-item" data-index="${index}">
                <div class="queue-drag-handle" title="Arrastra para reordenar">⠿</div>
                <div class="queue-item-number">${index + 1}</div>
                <div class="queue-item-info" onclick="playFromQueue(${index})" title="Clic para reproducir ahora">
                    <div class="queue-item-title">${escapeHtml(title)}</div>
                    <div class="queue-item-meta">
                        ${duration > 0 ? `<span class="queue-item-duration">${formatTime(duration)}</span>` : ''}
                        ${song.addedBy ? `<span class="queue-item-user">👤 ${escapeHtml(song.addedBy)}${song.addedLocation ? ' · 📍 ' + escapeHtml(song.addedLocation) : ''}</span>` : ''}
                    </div>
                </div>
                <button class="queue-item-remove" onclick="removeFromQueue(${index})" title="Eliminar">✕</button>
            </div>
        `;
    }).join('');

    if (elements.skipBtn) elements.skipBtn.disabled = false;
    if (elements.clearQueueBtn) elements.clearQueueBtn.disabled = false;

    // Inicializar drag solo la primera vez (usa event delegation sobre el container)
    if (!queueDragInitialized) initQueueDragDrop();
}

function initQueueDragDrop() {
    const container = elements.queueContainer;
    if (!container) return;
    queueDragInitialized = true;

    let dragSrcIndex = null;
    let dropTargetIndex = null;
    let dragGhost = null;
    let ghostOffsetX = 0;
    let ghostOffsetY = 0;

    function getItems() {
        return Array.from(container.querySelectorAll('.queue-item[data-index]'));
    }

    // Devuelve el data-index del item que está bajo la coordenada Y del cursor
    function getItemIndexAtY(y) {
        for (const item of getItems()) {
            const rect = item.getBoundingClientRect();
            if (y >= rect.top && y <= rect.bottom) {
                return parseInt(item.dataset.index);
            }
        }
        return null;
    }

    // Resalta el item destino (solo si cambió)
    function setDropTarget(idx) {
        if (idx === dropTargetIndex) return;
        getItems().forEach(item => item.classList.remove('drag-over'));
        dropTargetIndex = idx;
        if (idx !== null && idx !== dragSrcIndex) {
            const el = container.querySelector(`[data-index="${idx}"]`);
            if (el) el.classList.add('drag-over');
        }
    }

    function onMouseMove(e) {
        // Mover el elemento fantasma con el cursor
        if (dragGhost) {
            dragGhost.style.top  = (e.clientY - ghostOffsetY) + 'px';
            dragGhost.style.left = (e.clientX - ghostOffsetX) + 'px';
        }
        setDropTarget(getItemIndexAtY(e.clientY));
    }

    function onMouseUp() {
        const from = dragSrcIndex;
        const to   = dropTargetIndex;
        cleanup();
        if (from !== null && to !== null && from !== to) {
            reorderQueue(from, to);
        }
    }

    function cleanup() {
        isDraggingQueue = false;
        getItems().forEach(item => item.classList.remove('dragging', 'drag-over'));
        container.classList.remove('is-dragging');
        if (dragGhost) { dragGhost.remove(); dragGhost = null; }
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
        dragSrcIndex = null;
        dropTargetIndex = null;
    }

    // Event delegation: escuchar mousedown en el container, filtrar por handle
    container.addEventListener('mousedown', e => {
        const handle = e.target.closest('.queue-drag-handle');
        if (!handle) return;
        const item = handle.closest('.queue-item[data-index]');
        if (!item) return;

        e.preventDefault(); // Evitar selección de texto

        isDraggingQueue = true;
        dragSrcIndex = parseInt(item.dataset.index);
        dropTargetIndex = dragSrcIndex;

        const rect = item.getBoundingClientRect();
        ghostOffsetX = e.clientX - rect.left;
        ghostOffsetY = e.clientY - rect.top;

        // Crear elemento fantasma que sigue al cursor
        dragGhost = item.cloneNode(true);
        Object.assign(dragGhost.style, {
            position:       'fixed',
            top:            (e.clientY - ghostOffsetY) + 'px',
            left:           (e.clientX - ghostOffsetX) + 'px',
            width:          rect.width + 'px',
            margin:         '0',
            zIndex:         '9999',
            pointerEvents:  'none',
            opacity:        '0.88',
            transform:      'scale(1.03) rotate(0.8deg)',
            boxShadow:      '0 12px 32px rgba(0,0,0,0.55)',
            borderLeftColor: '#FEE75C',
            transition:     'none',
        });
        document.body.appendChild(dragGhost);

        item.classList.add('dragging');
        container.classList.add('is-dragging');

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup',   onMouseUp);
    });
}

async function reorderQueue(from, to) {
    try {
        const response = await fetch(`${getBackendUrl()}/api/queue/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to })
        });

        if (!response.ok) {
            // Intentar parsear el error como JSON; si no es JSON (ej: HTML de Express/proxy), usar mensaje genérico
            let errorMsg = `Error ${response.status} al reordenar la cola`;
            try {
                const data = await response.json();
                errorMsg = data.error || errorMsg;
            } catch { /* respuesta no es JSON */ }
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error('[Reorder] Error:', error);
        showNotification('Error', error.message || 'No se pudo reordenar la cola', 'error');
    }
}

function updateButtonStates() {
    const status   = currentStatus?.status;
    const isPlaying = status === 'playing';
    const isPaused  = status === 'paused';
    const hasQueue = (currentStatus?.queue?.length || 0) > 0;

    if (elements.urlInput) elements.urlInput.disabled = false;
    if (elements.playBtn) elements.playBtn.disabled = false;
    if (elements.addQueueBtn) elements.addQueueBtn.disabled = false;

    // STOP: detiene la canción; habilitado cuando está reproduciendo O pausado
    if (elements.stopBtn) {
        elements.stopBtn.disabled = !(isPlaying || isPaused);
        const icon = elements.stopBtn.querySelector('.btn-icon');
        if (icon) icon.textContent = '■';
    }

    if (isPlaying || isPaused) {
        if (elements.skipBtn) elements.skipBtn.disabled = !hasQueue;
        if (elements.clearQueueBtn) elements.clearQueueBtn.disabled = !hasQueue;
    } else {
        if (elements.skipBtn) elements.skipBtn.disabled = true;
        if (elements.clearQueueBtn) elements.clearQueueBtn.disabled = !hasQueue;
    }
}

async function restoreState() {
    try {
        const res = await fetch(`${getBackendUrl()}/api/status`);
        const data = await res.json();
        if (data) {
            updateStatus(data);
        }
    } catch (error) {
        console.error('[RestoreState] Error:', error.message);
    }
}


// ============================================
// EVENT LISTENERS
// ============================================

function attachEventListeners() {
    // Botón Reproducir
    if (elements.playBtn) {
        elements.playBtn.addEventListener('click', playMedia);
    }

    // Botón Añadir a Cola
    if (elements.addQueueBtn) {
        elements.addQueueBtn.addEventListener('click', addToQueue);
    }

    // Botón Detener
    if (elements.stopBtn) {
        elements.stopBtn.addEventListener('click', stopMedia);
    }
    
    // Botón Saltar
    if (elements.skipBtn) {
        elements.skipBtn.addEventListener('click', skipMedia);
    }
    
    // Botón Limpiar Cola
    if (elements.clearQueueBtn) {
        elements.clearQueueBtn.addEventListener('click', clearQueue);
    }
    
    // Botón Crear Playlist
    if (elements.createPlaylistBtn) {
        elements.createPlaylistBtn.addEventListener('click', createPlaylist);
    }

    // Botón Limpiar Entrada
    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', () => {
            if (elements.urlInput) elements.urlInput.value = '';
        });
    }

    // Enter → reproducir | Shift+Enter → añadir a cola
    if (elements.urlInput) {
        elements.urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    addToQueue();
                } else {
                    playMedia();
                }
            }
        });
    }

    // Botón pause/resume del now-playing
    if (elements.pauseResumeBtn) {
        elements.pauseResumeBtn.addEventListener('click', pauseResumeMedia);
    }

    // Botón revivir stickers (calavera)
    if (elements.reviveBtn) {
        elements.reviveBtn.addEventListener('click', () => {
            StickersSystem.sendToServer({ type: 'revive' });
        });
    }

    // Clip de Radio — botones y teclado
    if (elements.clipBtn) {
        elements.clipBtn.addEventListener('click', playClip);
    }
    if (elements.clipStopBtn) {
        elements.clipStopBtn.addEventListener('click', stopClip);
    }
    if (elements.clipInput) {
        elements.clipInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); playClip(); }
        });
    }

    // Clip de Radio — archivo local
    if (elements.clipFileInput) {
        elements.clipFileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) {
                pendingClipFile = file;
                const displayName = file.name.length > 28 ? file.name.slice(0, 25) + '...' : file.name;
                if (elements.clipFileLabel) elements.clipFileLabel.textContent = displayName;
                if (elements.clipFileClearBtn) elements.clipFileClearBtn.style.display = '';
                if (elements.clipInput) elements.clipInput.value = ''; // limpiar URL si hay archivo
            }
        });
    }
    if (elements.clipFileClearBtn) {
        elements.clipFileClearBtn.addEventListener('click', clearClipFile);
    }

    // Clip de Radio — sliders de volumen
    if (elements.clipMusicVolumeSlider) {
        elements.clipMusicVolumeSlider.addEventListener('input', () => {
            if (elements.clipMusicVolumeValue)
                elements.clipMusicVolumeValue.textContent = elements.clipMusicVolumeSlider.value + '%';
        });
    }
    if (elements.clipVolumeSlider) {
        elements.clipVolumeSlider.addEventListener('input', () => {
            if (elements.clipVolumeValue)
                elements.clipVolumeValue.textContent = elements.clipVolumeSlider.value + '%';
        });
    }

    // Historial: cargar al cambiar a esa pestaña
    document.querySelectorAll('.qp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'history') loadHistory();
        });
    });

    // YouTube Search
    const ytBtn   = document.getElementById('ytSearchBtn');
    const ytInput = document.getElementById('ytSearchInput');
    if (ytBtn)   ytBtn.addEventListener('click', doYouTubeSearch);
    if (ytInput) ytInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doYouTubeSearch(); } });

    // Sticker Picker
    const stickerBtn = document.getElementById('stickerPickerBtn');
    if (stickerBtn) stickerBtn.addEventListener('click', openStickerPicker);

    // Cerrar sticker picker al hacer clic fuera
    document.addEventListener('click', e => {
        const panel = document.getElementById('stickerPickerPanel');
        if (!panel || panel.classList.contains('hidden')) return;
        if (!panel.contains(e.target) && e.target.id !== 'stickerPickerBtn') {
            panel.classList.add('hidden');
            _stickerPickerOpen = false;
        }
    });
}

// ============================================
// FUNCIONES DE CONTROL
// ============================================

async function playMedia() {
    if (!elements.urlInput) {
        showNotification('Error', 'Elemento faltante en la interfaz', 'error');
        return;
    }

    const url = elements.urlInput.value.trim();

    if (!url) {
        // Sin URL: reanudar si hay una canción pausada
        if (currentStatus?.status === 'paused') {
            return pauseResumeMedia();
        }
        showNotification('Error', 'Escribe una URL o el nombre de una canción', 'error');
        return;
    }

    // Mostrar estado de carga
    console.log('[Play] Iniciando carga...');
    if (elements.statusText) {
        elements.statusText.innerHTML = '⏳ Cargando canción...';
        elements.statusText.style.color = '#ffa500';
    }

    if (elements.playBtn) elements.playBtn.disabled = true;

    try {
        console.log('[Play] Enviando request a servidor...');
        const response = await fetch(`${getBackendUrl()}/api/play`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })  // Sin audioDevice - el servidor lo maneja
        });

        if (!response.headers.get('content-type')?.includes('application/json')) {
            throw new Error('Respuesta inválida del servidor');
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.details || data.error || 'Error desconocido');
        }

        console.log('[Play] ✅ Respuesta exitosa');
        showNotification('✅ Reproduciendo', data.song?.title || data.message || 'Canción iniciada', 'success');
        if (elements.urlInput) elements.urlInput.value = '';

    } catch (error) {
        console.error('[Play Error]', error);
        showNotification('❌ Error', error.message || 'Error desconocido', 'error');
        if (elements.statusText) elements.statusText.style.color = '';

    } finally {
        if (elements.playBtn) elements.playBtn.disabled = false;
    }
}

async function addToQueue() {
    if (!elements.urlInput) {
        showNotification('Error', 'Elemento faltante en la interfaz', 'error');
        return;
    }

    const url = elements.urlInput.value.trim();

    if (!url) {
        showNotification('Error', 'Escribe una URL o el nombre de una canción', 'error');
        return;
    }

    // Deshabilitar botón mientras se procesa
    if (elements.addQueueBtn) elements.addQueueBtn.disabled = true;

    try {
        console.log('[AddQueue] Añadiendo a la cola...');
        const response = await fetch(`${getBackendUrl()}/api/queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.details || data.error || 'Error desconocido');
        }

        showNotification('Añadido', data.message, 'success');
        if (elements.urlInput) elements.urlInput.value = '';

    } catch (error) {
        console.error('[AddQueue Error]', error);
        showNotification('Error', error.message || 'No se pudo añadir a la cola', 'error');
    } finally {
        if (elements.addQueueBtn) elements.addQueueBtn.disabled = false;
    }
}

async function createPlaylist() {
    if (!elements.urlInput) return;

    const url = elements.urlInput.value.trim();
    if (!url) {
        showNotification('Error', 'Escribe una URL o el nombre de una canción', 'error');
        return;
    }

    if (elements.createPlaylistBtn) elements.createPlaylistBtn.disabled = true;
    if (elements.statusText) {
        elements.statusText.innerHTML = '⏳ Creando playlist...';
        elements.statusText.style.color = '#9b59b6';
    }

    try {
        const response = await fetch(`${getBackendUrl()}/api/play-with-mix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.details || data.error || 'Error desconocido');
        }

        showNotification('🎲 Playlist creada', data.message, 'success');
        if (elements.urlInput) elements.urlInput.value = '';

    } catch (error) {
        console.error('[CreatePlaylist Error]', error);
        showNotification('❌ Error', error.message || 'No se pudo crear la playlist', 'error');
        if (elements.statusText) elements.statusText.style.color = '';
    } finally {
        if (elements.createPlaylistBtn) elements.createPlaylistBtn.disabled = false;
    }
}

async function stopMedia() {
    const status = currentStatus?.status;
    if (status === 'playing' || status === 'paused') {
        if (elements.stopBtn) elements.stopBtn.disabled = true;
        try {
            const response = await fetch(`${getBackendUrl()}/api/stop`, { method: 'POST' });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error desconocido');
            }
            showNotification('⏹ Detenido', '', 'success');
        } catch (error) {
            showNotification('❌ Error', error.message || 'No se pudo detener', 'error');
        } finally {
            if (elements.stopBtn) elements.stopBtn.disabled = false;
        }
    }
}

async function pauseResumeMedia() {
    if (!elements.pauseResumeBtn) return;
    elements.pauseResumeBtn.disabled = true;
    try {
        const response = await fetch(`${getBackendUrl()}/api/pause-resume`, { method: 'POST' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error desconocido');
        }
        const data = await response.json();
        const label = data.status === 'paused' ? '⏸ Pausado' : '▶️ Reanudado';
        showNotification(label, '', 'success');
    } catch (error) {
        showNotification('❌ Error', error.message || 'No se pudo pausar/reanudar', 'error');
    } finally {
        if (elements.pauseResumeBtn) elements.pauseResumeBtn.disabled = false;
    }
}

async function skipMedia() {
    if (!elements.skipBtn) return;
    elements.skipBtn.disabled = true;
    
    try {
        const response = await fetch(`${getBackendUrl()}/api/skip`, { method: 'POST' });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error desconocido');
        }
        
        showNotification('Éxito', 'Saltando a siguiente canción', 'success');
        
    } catch (error) {
        console.error('Error saltando:', error);
        showNotification('Error', error.message || 'No se pudo saltar', 'error');
    } finally {
        if (elements.skipBtn) elements.skipBtn.disabled = false;
    }
}

async function playFromQueue(index) {
    try {
        const response = await fetch(`${getBackendUrl()}/api/queue/${index}/play`, { method: 'POST' });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error desconocido');
        }

        const data = await response.json();
        showNotification('▶️ Reproduciendo', data.message, 'success');

    } catch (error) {
        console.error('[PlayFromQueue] Error:', error);
        showNotification('Error', error.message || 'No se pudo reproducir', 'error');
    }
}

async function removeFromQueue(index) {
    try {
        const response = await fetch(`${getBackendUrl()}/api/queue/${index}`, { method: 'DELETE' });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error desconocido');
        }
        
        showNotification('Éxito', 'Canción eliminada de la cola', 'success');
        
    } catch (error) {
        console.error('Error eliminando:', error);
        showNotification('Error', error.message || 'No se pudo eliminar la canción', 'error');
    }
}

async function clearQueue() {
    if (!confirm('¿Estás seguro de que quieres limpiar toda la cola?')) {
        return;
    }
    
    if (!elements.clearQueueBtn) return;
    elements.clearQueueBtn.disabled = true;
    
    try {
        const response = await fetch(`${getBackendUrl()}/api/queue/clear`, { method: 'POST' });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error desconocido');
        }
        
        showNotification('Éxito', 'Cola limpiada', 'success');
        
    } catch (error) {
        console.error('Error limpiando cola:', error);
        showNotification('Error', error.message || 'No se pudo limpiar la cola', 'error');
    } finally {
        if (elements.clearQueueBtn) elements.clearQueueBtn.disabled = false;
    }
}

// ============================================
// CLIP DE RADIO
// ============================================

async function playClip() {
    const url       = elements.clipInput ? elements.clipInput.value.trim() : '';
    const duckVol   = elements.clipMusicVolumeSlider ? parseInt(elements.clipMusicVolumeSlider.value) : 40;
    const clipVol   = elements.clipVolumeSlider       ? parseInt(elements.clipVolumeSlider.value)       : 100;

    if (!url && !pendingClipFile) {
        showNotification('Error', 'Escribe una URL, el nombre de una canción o adjunta un archivo', 'error');
        return;
    }

    if (elements.clipBtn) elements.clipBtn.disabled = true;

    try {
        let playUrl = url;

        // Si hay un archivo local pendiente, subirlo primero
        if (pendingClipFile) {
            showNotification('⏳ Subiendo', `"${pendingClipFile.name}"...`, 'info');
            const uploadResult = await uploadClipFile(pendingClipFile);
            playUrl = uploadResult.path;
        }

        const response = await fetch(`${getBackendUrl()}/api/clip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: playUrl, musicDuckVolume: duckVol, clipVolume: clipVol })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.details || 'Error desconocido');

        showNotification('📻 Clip', data.message || 'Clip iniciado', 'success');
        if (elements.clipInput) elements.clipInput.value = '';
        clearClipFile(); // Limpiar archivo seleccionado tras lanzar el clip

    } catch (error) {
        console.error('[Clip] Error:', error);
        showNotification('❌ Error', error.message || 'No se pudo iniciar el clip', 'error');
    } finally {
        if (elements.clipBtn) elements.clipBtn.disabled = false;
    }
}

async function uploadClipFile(file) {
    const response = await fetch(`${getBackendUrl()}/api/clip/upload`, {
        method: 'POST',
        headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Filename': encodeURIComponent(file.name)
        },
        body: file
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Error al subir archivo: ${response.status}`);
    }
    return await response.json(); // { success, path, name }
}

function clearClipFile() {
    pendingClipFile = null;
    if (elements.clipFileInput) elements.clipFileInput.value = '';
    if (elements.clipFileLabel) elements.clipFileLabel.textContent = 'Adjuntar archivo';
    if (elements.clipFileClearBtn) elements.clipFileClearBtn.style.display = 'none';
}

async function stopClip() {
    try {
        const response = await fetch(`${getBackendUrl()}/api/clip/stop`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error desconocido');
        showNotification('Éxito', 'Clip detenido', 'success');
    } catch (error) {
        showNotification('Error', error.message || 'No se pudo detener el clip', 'error');
    }
}

function updateClipStatus(status, title) {
    const isPlaying = status === 'playing';
    if (elements.clipStatus) {
        elements.clipStatus.style.display = isPlaying ? 'block' : 'none';
    }
    if (elements.clipStatusText && isPlaying) {
        elements.clipStatusText.textContent = title ? `Clip sonando: ${title}` : 'Clip sonando...';
    }
    if (elements.clipStopBtn) {
        elements.clipStopBtn.style.display = isPlaying ? '' : 'none';
    }
    // Banner en el LCD del reproductor
    const banner = document.getElementById('clipLcdBanner');
    if (banner) {
        if (isPlaying) {
            banner.textContent = '📻 ' + (title || 'Clip sonando...');
            banner.style.display = '';
        } else {
            banner.style.display = 'none';
        }
    }
}

// ============================================
// NOTIFICACIONES
// ============================================

function showNotification(title, message, type = 'info') {
    const notificationDiv = document.getElementById('notifications');
    if (!notificationDiv) return;
    
    const iconMap = {
        'success': '✅',
        'error': '❌',
        'info': 'ℹ️'
    };
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span class="notification-icon">${iconMap[type] || '•'}</span>
        <div class="notification-content">
            <div class="notification-title">${escapeHtml(title)}</div>
            <div class="notification-message">${escapeHtml(message)}</div>
        </div>
    `;
    
    notificationDiv.appendChild(notification);
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// ============================================
// UTILIDADES
// ============================================

function formatTime(seconds) {
    if (!seconds || seconds < 0) return '00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// HISTORIAL
// ============================================

async function loadHistory() {
    const container = document.getElementById('historyContainer');
    if (!container) return;
    container.innerHTML = '<div class="qp-empty"><div class="ic">⏳</div><p>Cargando...</p></div>';
    try {
        const res = await fetch(`${getBackendUrl()}/api/history`);
        const data = await res.json();
        const history = data.history || [];
        if (!history.length) {
            container.innerHTML = '<div class="qp-empty"><div class="ic">📜</div><h3>SIN HISTORIAL</h3><p>Las canciones reproducidas aparecerán aquí</p></div>';
            return;
        }
        container.innerHTML = history.map((entry, i) => {
            const loc = entry.addedLocation ? ` · 📍 ${escapeHtml(entry.addedLocation)}` : '';
            const user = entry.addedBy ? `<div class="hist-meta">👤 ${escapeHtml(entry.addedBy)}${loc}</div>` : '';
            const ago = timeAgo(entry.playedAt);
            const thumb = extractThumbnailUrl(entry.url);
            const thumbHtml = thumb ? `<img class="hist-thumb" src="${thumb}" alt="" loading="lazy">` : '<div class="hist-thumb-empty">🎵</div>';
            return `<div class="hist-item">
                ${thumbHtml}
                <div class="hist-info">
                    <div class="hist-title">${escapeHtml(entry.title)}</div>
                    ${user}
                    <div class="hist-time">${ago}</div>
                </div>
                <div class="hist-actions">
                    <button class="hist-btn" onclick="histPlay(${i})" title="Reproducir">▶</button>
                    <button class="hist-btn" onclick="histQueue(${i})" title="Añadir a cola">+</button>
                </div>
            </div>`;
        }).join('');

        // Guardar referencia al historial para acciones
        window._historyData = history;
    } catch (e) {
        container.innerHTML = '<div class="qp-empty"><div class="ic">❌</div><p>Error cargando historial</p></div>';
    }
}

function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `hace ${d}d`;
    if (h > 0) return `hace ${h}h`;
    if (m > 0) return `hace ${m}m`;
    return 'ahora mismo';
}

async function histPlay(index) {
    const entry = window._historyData?.[index];
    if (!entry) return;
    try {
        const res = await fetch(`${getBackendUrl()}/api/play`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: entry.url })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');
        showNotification('▶️ Reproduciendo', entry.title, 'success');
    } catch (e) {
        showNotification('❌ Error', e.message, 'error');
    }
}

async function histQueue(index) {
    const entry = window._historyData?.[index];
    if (!entry) return;
    try {
        const res = await fetch(`${getBackendUrl()}/api/queue`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: entry.url })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');
        showNotification('✅ Añadido', entry.title, 'success');
    } catch (e) {
        showNotification('❌ Error', e.message, 'error');
    }
}

// ============================================
// BÚSQUEDA YOUTUBE
// ============================================

let _ytSearchResults = [];

async function doYouTubeSearch() {
    const input = document.getElementById('ytSearchInput');
    const resultsEl = document.getElementById('ytSearchResults');
    const btn = document.getElementById('ytSearchBtn');
    if (!input || !resultsEl) return;
    const q = input.value.trim();
    if (!q) return;

    btn.disabled = true;
    resultsEl.innerHTML = '<div class="qp-empty"><div class="ic">⏳</div><p>Buscando...</p></div>';

    try {
        const res = await fetch(`${getBackendUrl()}/api/youtube-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');
        _ytSearchResults = data.results || [];
        if (!_ytSearchResults.length) {
            resultsEl.innerHTML = '<div class="qp-empty"><div class="ic">🔍</div><p>Sin resultados</p></div>';
            return;
        }
        resultsEl.innerHTML = _ytSearchResults.map((r, i) => {
            const dur = r.duration ? `<span class="yt-duration">${formatTime(r.duration)}</span>` : '';
            const ch  = r.channel ? `<span class="yt-channel">${escapeHtml(r.channel)}</span>` : '';
            const thumb = r.thumbnail ? `<img class="yt-thumb" src="${r.thumbnail}" alt="" loading="lazy">` : '<div class="yt-thumb-empty">▶</div>';
            return `<div class="yt-result-item">
                ${thumb}
                <div class="yt-result-info">
                    <div class="yt-result-title">${escapeHtml(r.title)}</div>
                    <div class="yt-result-meta">${ch}${dur}</div>
                </div>
                <div class="yt-result-actions">
                    <button class="hist-btn" onclick="ytPlay(${i})" title="Reproducir ahora">▶</button>
                    <button class="hist-btn" onclick="ytQueue(${i})" title="Añadir a cola">+</button>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        resultsEl.innerHTML = `<div class="qp-empty"><div class="ic">❌</div><p>${escapeHtml(e.message)}</p></div>`;
    } finally {
        btn.disabled = false;
    }
}

async function ytPlay(index) {
    const r = _ytSearchResults[index];
    if (!r) return;
    try {
        const res = await fetch(`${getBackendUrl()}/api/play`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: r.url })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');
        showNotification('▶️ Reproduciendo', r.title, 'success');
    } catch (e) {
        showNotification('❌ Error', e.message, 'error');
    }
}

async function ytQueue(index) {
    const r = _ytSearchResults[index];
    if (!r) return;
    try {
        const res = await fetch(`${getBackendUrl()}/api/queue`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: r.url })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');
        showNotification('✅ Cola', r.title, 'success');
    } catch (e) {
        showNotification('❌ Error', e.message, 'error');
    }
}

// ============================================
// STICKER PICKER
// ============================================

let _stickerPickerOpen = false;

async function openStickerPicker() {
    const panel = document.getElementById('stickerPickerPanel');
    const grid  = document.getElementById('stickerPickerGrid');
    if (!panel || !grid) return;

    if (_stickerPickerOpen) {
        panel.classList.add('hidden');
        _stickerPickerOpen = false;
        return;
    }

    _stickerPickerOpen = true;
    panel.classList.remove('hidden');
    grid.innerHTML = '<div style="padding:12px;color:#aaa;font-size:11px;">Cargando stickers...</div>';

    try {
        const res = await fetch(`${getBackendUrl()}/api/gifs`);
        const data = await res.json();
        const gifs = data.gifs || [];
        grid.innerHTML = gifs.map(url => {
            const src = url.startsWith('/') ? `${getBackendUrl()}${url}` : url;
            return `<div class="sp-item" onclick="selectSticker('${url}')" title="${url.split('/').pop()}">
                <img src="${src}" alt="" loading="lazy">
            </div>`;
        }).join('');
    } catch (e) {
        grid.innerHTML = '<div style="padding:12px;color:#f55;font-size:11px;">Error cargando stickers</div>';
    }
}

async function selectSticker(gifUrl) {
    try {
        const res = await fetch(`${getBackendUrl()}/api/auth/sticker`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stickerGif: gifUrl })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');
        showNotification('🎭 Sticker actualizado', 'Tu sticker ha cambiado', 'success');
        const panel = document.getElementById('stickerPickerPanel');
        if (panel) panel.classList.add('hidden');
        _stickerPickerOpen = false;
    } catch (e) {
        showNotification('❌ Error', e.message, 'error');
    }
}

// Estilos para slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

