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

function getBackendUrl() {
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
const BASE_RECONNECT_DELAY = 1000;
let progressInterval = null;
let currentStatus = {
    url: '',
    title: 'Ninguna',
    status: 'stopped',
    duration: 0,
    elapsed: 0
};

// Elementos del DOM
const elements = {
    urlInput: document.getElementById('urlInput'),
    playBtn: document.getElementById('playBtn'),
    addQueueBtn: document.getElementById('addQueueBtn'),
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
    settingsPanel: document.getElementById('settingsPanel')
};

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Init] Iniciando...');

    // Inicializar UI primero
    initBackendSettings();
    attachEventListeners();

    // Intentar conectar
    await tryConnect();

    // Reintentar cargar config cada 10 segundos si no está conectado
    setInterval(async () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log('[AutoRetry] Reintentando cargar configuración...');
            await tryConnect();
        }
    }, 10000);
});

async function tryConnect() {
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
        reconnectAttempts = 0; // Reset intentos al conectar
        updateConnectionStatus(true);
        showNotification('Conectado', 'Conexión establecida con el servidor', 'success');
        
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
        } catch (error) {
            console.error('Error procesando mensaje WebSocket:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket desconectado');
        updateConnectionStatus(false);
        
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
            console.error('Máximo de intentos de reconexión alcanzado');
            showNotification('Error', 'No se pudo conectar al servidor', 'error');
        }
    };
}

function updateConnectionStatus(connected) {
    if (!elements.connectionStatus) return;

    const statusText = elements.connectionStatus.querySelector('.status-text');

    if (connected) {
        elements.connectionStatus.classList.add('connected');
        elements.connectionStatus.classList.remove('disconnected', 'connecting');
        if (statusText) statusText.textContent = 'Conectado';
    } else {
        elements.connectionStatus.classList.remove('connected');
        elements.connectionStatus.classList.add('disconnected');
        if (statusText) statusText.textContent = 'Desconectado';
    }
}

function updateConnectionStatusConnecting() {
    if (!elements.connectionStatus) return;

    elements.connectionStatus.classList.remove('connected', 'disconnected');
    elements.connectionStatus.classList.add('connecting');
    const statusText = elements.connectionStatus.querySelector('.status-text');
    if (statusText) statusText.textContent = 'Conectando...';
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

function updateNowPlaying(song) {
    if (!song) return;

    // Actualizar título
    if (elements.currentSong) {
        elements.currentSong.textContent = song.title || 'Ninguna canción';
    }
    
    // Actualizar estado
    if (elements.statusText) {
        const statusMap = {
            'playing': '▶️ Reproduciendo',
            'stopped': '⏹️ Detenido',
            'error': '❌ Error'
        };
        elements.statusText.textContent = statusMap[song.status] || 'Desconocido';
    }
    
    // Actualizar indicador visual
    if (elements.statusIndicator) {
        elements.statusIndicator.classList.remove('playing', 'stopped');
        elements.statusIndicator.classList.add(song.status === 'playing' ? 'playing' : 'stopped');
    }
    
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
        // Validar que song sea un objeto válido
        if (!song || typeof song !== 'object') {
            return '';
        }
        
        const title = song.title && typeof song.title === 'string' ? song.title : 'Desconocido';
        const duration = typeof song.duration === 'number' ? song.duration : 0;
        
        return `
            <div class="queue-item">
                <div class="queue-item-number">${index + 1}</div>
                <div class="queue-item-info">
                    <div class="queue-item-title">${escapeHtml(title)}</div>
                    <div class="queue-item-duration">${formatTime(duration)}</div>
                </div>
                <button class="queue-item-remove" onclick="removeFromQueue(${index})" title="Eliminar">✕</button>
            </div>
        `;
    }).join('');
    
    if (elements.skipBtn) elements.skipBtn.disabled = false;
    if (elements.clearQueueBtn) elements.clearQueueBtn.disabled = false;
}

function updateButtonStates() {
    const isPlaying = currentStatus?.status === 'playing';
    const hasQueue = (currentStatus?.queue?.length || 0) > 0;

    if (elements.urlInput) elements.urlInput.disabled = false;
    if (elements.playBtn) elements.playBtn.disabled = false;
    if (elements.addQueueBtn) elements.addQueueBtn.disabled = false;

    if (isPlaying) {
        if (elements.skipBtn) elements.skipBtn.disabled = !hasQueue;
        if (elements.stopBtn) elements.stopBtn.disabled = false;
        if (elements.clearQueueBtn) elements.clearQueueBtn.disabled = !hasQueue;
    } else {
        if (elements.skipBtn) elements.skipBtn.disabled = true;
        if (elements.stopBtn) elements.stopBtn.disabled = true;
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
    
    // Botón Limpiar Entrada
    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', () => {
            if (elements.urlInput) elements.urlInput.value = '';
        });
    }

    // Enter en input de URL
    if (elements.urlInput) {
        elements.urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                playMedia();
            }
        });
    }
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
        showNotification('Error', 'Por favor, pega una URL de YouTube', 'error');
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
        showNotification('Error', 'Por favor, pega una URL de YouTube', 'error');
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

async function stopMedia() {
    if (!elements.stopBtn) return;
    elements.stopBtn.disabled = true;
    
    try {
        console.log('[Stop] Enviando petición al servidor...');
        const response = await fetch(`${getBackendUrl()}/api/stop`, { method: 'POST' });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error desconocido');
        }
        
        console.log('[Stop] Servidor respondió, esperando confirmación...');
        
        // Esperar a que WebSocket confirme el cambio de estado (máximo 2 segundos)
        let confirmed = false;
        const startTime = Date.now();
        
        while (!confirmed && (Date.now() - startTime < 2000)) {
            if (currentStatus?.status === 'stopped') {
                confirmed = true;
                console.log('[Stop] ✅ Estado confirmado como stopped');
            } else {
                // Esperar 100ms antes de revisar de nuevo
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        if (confirmed) {
            showNotification('✅ Detenido', 'Reproducción pausada', 'success');
        } else {
            console.warn('[Stop] Timeout esperando confirmación, pero petición se envió');
            showNotification('⏹️ Detenido', 'Petición enviada al servidor', 'info');
        }
        
    } catch (error) {
        console.error('[Stop Error]', error);
        showNotification('❌ Error', error.message || 'No se pudo detener la reproducción', 'error');
    } finally {
        if (elements.stopBtn) elements.stopBtn.disabled = false;
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
    if (!seconds || seconds < 0) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

