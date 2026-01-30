// ============================================
// Discord DJ Controller - Frontend
// ============================================

// Estado de la aplicación
let ws = null;
let reconnectTimer = null;
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
    audioDevice: document.getElementById('audioDevice'),
    playBtn: document.getElementById('playBtn'),
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
    totalTime: document.getElementById('totalTime')
};

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeWebSocket();
    loadAudioDevices();
    attachEventListeners();
    restoreState();
});

// ============================================
// WEBSOCKET
// ============================================

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    
    ws = new WebSocket(`${protocol}//${host}${port.replace('3000', '3001')}`);
    
    ws.onopen = () => {
        console.log('WebSocket conectado');
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
        
        reconnectTimer = setTimeout(() => {
            console.log('Intentando reconectar WebSocket...');
            initializeWebSocket();
        }, 3000);
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
    
    if (song) {
        currentStatus = song;
        updateNowPlaying(song);
        updateProgress(song);
    }
    
    // Actualizar selector de dispositivo
    if (audioDevice && elements.audioDevice) {
        elements.audioDevice.value = audioDevice;
    }
    
    // Actualizar cola
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
    if (queue.length === 0) {
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
    
    // Mostrar cola
    elements.queueContainer.innerHTML = queue.map((song, index) => `
        <div class="queue-item">
            <div class="queue-item-number">${index + 1}</div>
            <div class="queue-item-info">
                <div class="queue-item-title">${escapeHtml(song.title || 'Desconocido')}</div>
                <div class="queue-item-duration">${formatTime(song.duration || 0)}</div>
            </div>
            <button class="queue-item-remove" onclick="removeFromQueue(${index})" title="Eliminar">✕</button>
        </div>
    `).join('');
    
    if (elements.skipBtn) elements.skipBtn.disabled = false;
    if (elements.clearQueueBtn) elements.clearQueueBtn.disabled = false;
}

function updateButtonStates() {
    const isPlaying = currentStatus.status === 'playing';
    
    if (elements.playBtn) elements.playBtn.disabled = false;
    if (elements.stopBtn) elements.stopBtn.disabled = !isPlaying;
}

function restoreState() {
    fetch('/api/status')
        .then(res => res.json())
        .then(data => {
            if (data) {
                updateStatus(data);
            }
        })
        .catch(error => console.error('Error restaurando estado:', error));
}

// ============================================
// CARGA DE DISPOSITIVOS DE AUDIO
// ============================================

async function loadAudioDevices() {
    try {
        const response = await fetch('/api/audio-devices');
        const data = await response.json();
        const devices = data.devices || [];
        
        if (!elements.audioDevice) return;
        
        // Limpiar opciones anteriores
        elements.audioDevice.innerHTML = '';
        
        if (devices.length === 0) {
            elements.audioDevice.innerHTML = '<option value="">No se encontraron dispositivos</option>';
            showNotification('Advertencia', 'No se detectaron dispositivos de audio. Verifica la instalación de MPV.', 'info');
            return;
        }
        
        // Opción por defecto
        elements.audioDevice.innerHTML = '<option value="">Selecciona un dispositivo...</option>';
        
        // Agregar dispositivos
        devices.forEach(device => {
            const isCable = device.name.toLowerCase().includes('cable');
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = (isCable ? '⭐ ' : '') + device.name;
            option.selected = isCable; // Preseleccionar CABLE si existe
            elements.audioDevice.appendChild(option);
        });
        
        showNotification('Éxito', `Se encontraron ${devices.length} dispositivo(s) de audio`, 'success');
        
    } catch (error) {
        console.error('Error cargando dispositivos de audio:', error);
        showNotification('Error', 'No se pudieron cargar los dispositivos de audio', 'error');
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
            loadAudioDevices().finally(() => {
                elements.refreshBtn.disabled = false;
            });
        });
    }
    
    // Enter en input de URL
    if (elements.urlInput) {
        elements.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                playMedia();
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
    
    elements.playBtn.disabled = true;
    showNotification('Procesando...', 'Iniciando reproducción', 'info');
    
    try {
        const response = await fetch('/api/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, audioDevice })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Error desconocido');
        }
        
        showNotification('Éxito', data.message || 'Reproducción iniciada', 'success');
        elements.urlInput.value = '';
        
    } catch (error) {
        console.error('Error reproduciendo:', error);
        showNotification('Error', error.message, 'error');
    } finally {
        elements.playBtn.disabled = false;
    }
}

async function stopMedia() {
    elements.stopBtn.disabled = true;
    
    try {
        const response = await fetch('/api/stop', { method: 'POST' });
        const data = await response.json();
        
        showNotification('Éxito', 'Reproducción detenida', 'success');
        
    } catch (error) {
        console.error('Error deteniendo:', error);
        showNotification('Error', 'No se pudo detener la reproducción', 'error');
    } finally {
        elements.stopBtn.disabled = false;
    }
}

async function skipMedia() {
    elements.skipBtn.disabled = true;
    
    try {
        const response = await fetch('/api/skip', { method: 'POST' });
        const data = await response.json();
        
        showNotification('Éxito', 'Saltando a siguiente canción', 'success');
        
    } catch (error) {
        console.error('Error saltando:', error);
        showNotification('Error', error.message || 'No se pudo saltar', 'error');
    } finally {
        elements.skipBtn.disabled = false;
    }
}

async function removeFromQueue(index) {
    try {
        const response = await fetch(`/api/queue/${index}`, { method: 'DELETE' });
        const data = await response.json();
        
        showNotification('Éxito', 'Canción eliminada de la cola', 'success');
        
    } catch (error) {
        console.error('Error eliminando:', error);
        showNotification('Error', 'No se pudo eliminar la canción', 'error');
    }
}

async function clearQueue() {
    if (!confirm('¿Estás seguro de que quieres limpiar toda la cola?')) {
        return;
    }
    
    elements.clearQueueBtn.disabled = true;
    
    try {
        const response = await fetch('/api/queue/clear', { method: 'POST' });
        const data = await response.json();
        
        showNotification('Éxito', 'Cola limpiada', 'success');
        
    } catch (error) {
        console.error('Error limpiando cola:', error);
        showNotification('Error', 'No se pudo limpiar la cola', 'error');
    } finally {
        elements.clearQueueBtn.disabled = false;
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
