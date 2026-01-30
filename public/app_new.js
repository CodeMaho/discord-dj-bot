// ============================================
// Discord DJ Controller - Frontend
// ============================================

// ============================================
// CONFIGURACIÓN DEL BACKEND
// ============================================

// Usar configuración del archivo config.js (si existe) o localStorage como fallback
function getConfiguredBackendUrl() {
    // Prioridad: config.js > localStorage > vacío
    if (typeof DJ_CONFIG !== 'undefined' && DJ_CONFIG.BACKEND_URL) {
        return DJ_CONFIG.BACKEND_URL;
    }
    return localStorage.getItem('backendUrl') || '';
}

let backendUrl = getConfiguredBackendUrl();

function getBackendUrl() {
    if (backendUrl) {
        return backendUrl.replace(/\/$/, ''); // Quitar trailing slash
    }
    // Si no hay URL configurada, usar la misma del frontend
    return window.location.origin;
}

function getWebSocketUrl() {
    const base = getBackendUrl();
    const protocol = base.startsWith('https') ? 'wss:' : 'ws:';
    const host = base.replace(/^https?:\/\//, '');
    return `${protocol}//${host}`;
}

function saveBackendUrl(url) {
    backendUrl = url;
    if (url) {
        localStorage.setItem('backendUrl', url);
    } else {
        localStorage.removeItem('backendUrl');
    }
}

function shouldShowSettings() {
    // Mostrar settings si está habilitado en config.js o si no hay config.js
    if (typeof DJ_CONFIG !== 'undefined') {
        return DJ_CONFIG.SHOW_SETTINGS === true;
    }
    return true; // Por defecto mostrar (modo desarrollo/local)
}

// ============================================
// ESTADO DE LA APLICACIÓN
// ============================================

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000; // 1 segundo
let progressInterval = null;
let savedAudioDevice = ''; // Dispositivo guardado del servidor
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
    audioDevice: document.getElementById('audioDevice'),
    playBtn: document.getElementById('playBtn'),
    addQueueBtn: document.getElementById('addQueueBtn'),
    stopBtn: document.getElementById('stopBtn'),
    clearBtn: document.getElementById('clearBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
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
    // Configuración del backend
    backendUrlInput: document.getElementById('backendUrlInput'),
    saveBackendBtn: document.getElementById('saveBackendBtn'),
    resetBackendBtn: document.getElementById('resetBackendBtn'),
    currentBackendUrl: document.getElementById('currentBackendUrl'),
    settingsToggle: document.getElementById('settingsToggle'),
    settingsPanel: document.getElementById('settingsPanel')
};

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar UI de configuración del backend
    initBackendSettings();
    attachEventListeners();
    // Primero restaurar estado para obtener el dispositivo guardado
    await restoreState();
    // Luego cargar dispositivos (usará el dispositivo guardado)
    await loadAudioDevices();
    // Finalmente conectar WebSocket
    initializeWebSocket();
});

// ============================================
// CONFIGURACIÓN DEL BACKEND UI
// ============================================

function initBackendSettings() {
    // Ocultar botón de configuración si no está habilitado
    if (!shouldShowSettings()) {
        if (elements.settingsToggle) {
            elements.settingsToggle.style.display = 'none';
        }
        if (elements.settingsPanel) {
            elements.settingsPanel.style.display = 'none';
        }
        console.log('[Config] Panel de configuración oculto (SHOW_SETTINGS=false)');
        return;
    }

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
        elements.saveBackendBtn.addEventListener('click', () => {
            const newUrl = elements.backendUrlInput?.value.trim() || '';
            saveBackendUrl(newUrl);
            updateBackendUrlDisplay();
            showNotification('Guardado', 'URL del backend actualizada. Reconectando...', 'success');

            // Reconectar WebSocket con nueva URL
            if (ws) {
                ws.close();
            }
            reconnectAttempts = 0;
            setTimeout(() => initializeWebSocket(), 500);
        });
    }

    // Resetear URL del backend
    if (elements.resetBackendBtn) {
        elements.resetBackendBtn.addEventListener('click', () => {
            saveBackendUrl('');
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
        elements.currentBackendUrl.textContent = url;
        elements.currentBackendUrl.title = url;
    }
}

// ============================================
// WEBSOCKET
// ============================================

function initializeWebSocket() {
    const wsUrl = getWebSocketUrl();
    console.log('[WebSocket] Conectando a:', wsUrl);

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
    
    if (connected) {
        elements.connectionStatus.classList.add('connected');
        elements.connectionStatus.classList.remove('disconnected');
        const statusText = elements.connectionStatus.querySelector('.status-text');
        if (statusText) statusText.textContent = 'Conectado';
    } else {
        elements.connectionStatus.classList.remove('connected');
        elements.connectionStatus.classList.add('disconnected');
        const statusText = elements.connectionStatus.querySelector('.status-text');
        if (statusText) statusText.textContent = 'Desconectado';
    }
}

// ============================================
// MANEJO DE ESTADO
// ============================================

function updateStatus(data) {
    if (!data) return;

    const { currentSong: song, queue = [], audioDevice } = data;

    // Log cambios de estado importantes
    if (song && song.status !== currentStatus?.status) {
        console.log(`[Status Change] ${currentStatus?.status} → ${song.status}`);
    }

    if (song) {
        currentStatus = song;
        updateNowPlaying(song);
        updateProgress(song);
    }

    // Guardar y actualizar selector de dispositivo desde el servidor
    if (audioDevice) {
        savedAudioDevice = audioDevice;
        selectAudioDevice(audioDevice);
    }

    // Actualizar cola
    updateQueueDisplay(queue);
}

// Seleccionar dispositivo de audio en el dropdown
function selectAudioDevice(deviceId) {
    if (!elements.audioDevice || !deviceId) return;

    // Buscar la opción que coincide
    const options = elements.audioDevice.options;
    for (let i = 0; i < options.length; i++) {
        if (options[i].value === deviceId) {
            elements.audioDevice.selectedIndex = i;
            console.log('[AudioDevice] Seleccionado:', deviceId);
            return true;
        }
    }
    console.log('[AudioDevice] No encontrado en lista:', deviceId);
    return false;
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

    // URL input siempre habilitado para poder añadir canciones
    if (elements.urlInput) elements.urlInput.disabled = false;

    // Botón Play siempre habilitado (si reproduce algo, detiene lo actual y empieza lo nuevo)
    if (elements.playBtn) elements.playBtn.disabled = false;

    // Botón Añadir a Cola siempre habilitado
    if (elements.addQueueBtn) elements.addQueueBtn.disabled = false;

    // Refresh siempre habilitado
    if (elements.refreshBtn) elements.refreshBtn.disabled = false;

    if (isPlaying) {
        // Dispositivo deshabilitado mientras reproduce (no tiene sentido cambiarlo)
        if (elements.audioDevice) elements.audioDevice.disabled = true;

        // Skip disponible solo si hay cola
        if (elements.skipBtn) elements.skipBtn.disabled = !hasQueue;

        // Stop disponible
        if (elements.stopBtn) elements.stopBtn.disabled = false;

        // Clear queue disponible si hay cola
        if (elements.clearQueueBtn) elements.clearQueueBtn.disabled = !hasQueue;

    } else {
        // Si NO está reproduciendo
        if (elements.audioDevice) elements.audioDevice.disabled = false;
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
            // Guardar dispositivo antes de updateStatus para que loadAudioDevices lo use
            if (data.audioDevice) {
                savedAudioDevice = data.audioDevice;
                console.log('[RestoreState] Dispositivo guardado:', savedAudioDevice);
            }
            updateStatus(data);
        }
    } catch (error) {
        console.error('Error restaurando estado:', error);
    }
}

// ============================================
// CARGA DE DISPOSITIVOS DE AUDIO
// ============================================

async function loadAudioDevices(refresh = false) {
    console.log('[Load-Devices] 🔊 Iniciando carga de dispositivos...');

    try {
        const url = refresh
            ? `${getBackendUrl()}/api/audio-devices?refresh=true`
            : `${getBackendUrl()}/api/audio-devices`;
        const response = await fetch(url);
        console.log('[Load-Devices] ✅ Response recibida, status:', response.status);
        
        const data = await response.json();
        const devices = data.devices || [];
        console.log('[Load-Devices] 📊 Recibidos:', devices.length, 'dispositivo(s)');
        
        if (!elements.audioDevice) {
            console.warn('[Load-Devices] ⚠️ Elemento audioDevice no encontrado en DOM');
            return;
        }
        
        // Limpiar opciones anteriores
        elements.audioDevice.innerHTML = '';
        
        if (devices.length === 0) {
            console.warn('[Load-Devices] ⚠️ No se encontraron dispositivos');
            elements.audioDevice.innerHTML = '<option value="">No se encontraron dispositivos</option>';
            showNotification('Advertencia', 'No se detectaron dispositivos de audio. Verifica la instalación de MPV.', 'info');
            return;
        }
        
        // Opción por defecto
        elements.audioDevice.innerHTML = '<option value="">Selecciona un dispositivo...</option>';
        
        // Agregar dispositivos
        let cableDeviceId = null;
        devices.forEach((device, idx) => {
            const isCable = device.name.toLowerCase().includes('cable');
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = (isCable ? '⭐ ' : '') + device.name;

            // Recordar el primer dispositivo CABLE
            if (isCable && !cableDeviceId) {
                cableDeviceId = device.id;
            }

            elements.audioDevice.appendChild(option);
            console.log(`  [${idx + 1}] ${option.textContent}`);
        });

        // Seleccionar dispositivo: prioridad servidor > CABLE > ninguno
        if (savedAudioDevice && selectAudioDevice(savedAudioDevice)) {
            console.log('[Load-Devices] Dispositivo del servidor seleccionado');
        } else if (cableDeviceId && selectAudioDevice(cableDeviceId)) {
            console.log('[Load-Devices] CABLE seleccionado por defecto');
        }
        
        console.log('[Load-Devices] ✅ Dispositivos cargados exitosamente');
        showNotification('✅ Éxito', `Se encontraron ${devices.length} dispositivo(s) de audio`, 'success');
        
    } catch (error) {
        console.error('[Load-Devices] ❌ Error:', error.message);
        console.error('[Load-Devices] Stack:', error.stack);
        showNotification('❌ Error', 'No se pudieron cargar los dispositivos de audio', 'error');
        if (elements.audioDevice) {
            elements.audioDevice.innerHTML = '<option value="">Error cargando dispositivos</option>';
        }
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
    
    // Botón Recargar Dispositivos
    if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', () => {
            elements.refreshBtn.disabled = true;
            loadAudioDevices(true).finally(() => {
                elements.refreshBtn.disabled = false;
            });
        });
    }
    
    // Enter en input de URL (usar keydown en lugar de deprecated keypress)
    if (elements.urlInput) {
        elements.urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                playMedia();
            }
        });
    }

    // Guardar dispositivo de audio en el servidor cuando se cambie
    if (elements.audioDevice) {
        elements.audioDevice.addEventListener('change', async (e) => {
            const audioDevice = e.target.value;
            if (audioDevice) {
                try {
                    await fetch(`${getBackendUrl()}/api/audio-device`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ audioDevice })
                    });
                    console.log('[AudioDevice] Guardado en servidor:', audioDevice);
                } catch (error) {
                    console.error('[AudioDevice] Error guardando:', error);
                }
            }
        });
    }
}

// ============================================
// FUNCIONES DE CONTROL
// ============================================

async function playMedia() {
    if (!elements.urlInput || !elements.audioDevice) {
        showNotification('Error', 'Elementos faltantes en la interfaz', 'error');
        return;
    }
    
    const url = elements.urlInput.value.trim();
    const audioDevice = elements.audioDevice.value;
    
    if (!url) {
        showNotification('Error', 'Por favor, pega una URL de YouTube', 'error');
        return;
    }
    
    if (!audioDevice) {
        showNotification('Error', 'Por favor, selecciona un dispositivo de audio', 'error');
        return;
    }
    
    // Mostrar estado de carga
    console.log('[Play] Iniciando carga...');
    if (elements.statusText) {
        elements.statusText.innerHTML = '⏳ Cargando canción...';
        elements.statusText.style.color = '#ffa500';  // Orange
    }

    // Solo deshabilitar botón Play temporalmente para evitar doble click
    if (elements.playBtn) elements.playBtn.disabled = true;
    
    try {
        console.log('[Play] Enviando request a servidor...');
        const response = await fetch(`${getBackendUrl()}/api/play`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, audioDevice })
        });
        
        // Verificar si respuesta es JSON válida ANTES de parsear
        if (!response.headers.get('content-type')?.includes('application/json')) {
            throw new Error('Respuesta inválida del servidor');
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Error desconocido');
        }
        
        console.log('[Play] ✅ Respuesta exitosa del servidor');
        showNotification('✅ Reproduciendo', data.song?.title || data.message || 'Canción iniciada', 'success');
        if (elements.urlInput) elements.urlInput.value = '';
        
    } catch (error) {
        console.error('[Play Error]', error);
        showNotification('❌ Error', error.message || 'Error desconocido', 'error');
        if (elements.statusText) elements.statusText.style.color = '';

    } finally {
        // Rehabilitar botón Play
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

