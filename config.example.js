// config.example.js
// Copia este archivo como config.js y personaliza según tus necesidades

module.exports = {
  // Configuración del servidor
  server: {
    port: 3000,           // Puerto HTTP principal
    wsPort: 3001,         // Puerto WebSocket
    host: 'localhost'     // Host del servidor
  },
  
  // Configuración de MPV
  mpv: {
    defaultVolume: 100,   // Volumen por defecto (0-100)
    quality: 'bestaudio', // Calidad de audio: bestaudio, 192k, 128k, etc.
    extraArgs: [
      '--no-video',       // Deshabilitar video
      '--cache=yes',      // Habilitar caché
      '--demuxer-max-bytes=50M', // Tamaño máximo de buffer
      '--demuxer-max-back-bytes=25M' // Buffer hacia atrás
    ]
  },
  
  // Configuración de audio
  audio: {
    // Dispositivo de audio por defecto (vacío = sistema por defecto)
    // Ejemplo: 'wasapi/{00000000-0000-0000-0000-000000000000}'
    defaultDevice: '',
    
    // Auto-seleccionar CABLE Input si está disponible
    autoSelectCable: true
  },
  
  // Configuración de yt-dlp
  ytdlp: {
    // Formato de descarga
    format: 'bestaudio/best',
    
    // Opciones adicionales
    // Ver: https://github.com/yt-dlp/yt-dlp#usage-and-options
    extraOpts: [
      '--no-warnings',
      '--no-playlist'  // Cambiar a '--yes-playlist' para soportar playlists
    ]
  },
  
  // Límites y restricciones
  limits: {
    maxUrlLength: 500,    // Longitud máxima de URL
    maxTitleLength: 100,  // Longitud máxima del título a mostrar
    requestTimeout: 30000 // Timeout para peticiones (ms)
  },
  
  // Características opcionales
  features: {
    enablePlaylist: true,  // Permitir reproducción de playlists
    enableLiveStreams: true, // Permitir streams en vivo
    logRequests: true      // Registrar todas las peticiones
  }
};
