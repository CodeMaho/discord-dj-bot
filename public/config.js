// ============================================
// CONFIGURACIÓN DEL DISCORD DJ CONTROLLER
// ============================================
// Este archivo se configura UNA VEZ y se sube al hosting.
// Los usuarios que accedan a la web usarán esta configuración.

const DJ_CONFIG = {
    // URL del backend (tu PC con el túnel de Cloudflare)
    // Ejemplo: 'https://tu-tunel.trycloudflare.com'
    // Dejar vacío '' para usar el mismo servidor (modo local)
    BACKEND_URL: '',

    // Mostrar panel de configuración (solo para administrador)
    // Poner en false para ocultar el botón de configuración a usuarios
    SHOW_SETTINGS: true
};
