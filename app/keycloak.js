// Configuración de la identidad centralizada.
//
// Este servidor NO habla con Keycloak ni con el broker, y NO conoce ninguna
// contraseña: el login y el registro ocurren en la web (la puerta del webspace,
// que valida contra Keycloak). Aquí solo se guarda el secreto compartido con esa
// puerta para verificar los pases que emite (ver pase.js).
//
// Efecto secundario deseado: el `client_secret` de la app en Keycloak ya no vive
// en este PC. Si esta máquina se ve comprometida, no se llevan las credenciales
// de la app, solo la capacidad de validar pases de una puerta que además exige
// sesión propia.
//
// Configuración, por orden de prioridad:
//   1. Variables de entorno KC_CLIENT_ID / KC_PASE_SECRET / KC_API_URL
//   2. app/config/keycloak.json  (NO se versiona: lleva el secreto)
//
// Sin secreto de pase, habilitado() devuelve false y el servidor sigue
// arrancando: avisa por consola y no acepta sesiones, en vez de caerse.

const fs = require('fs');
const path = require('path');

const KC_CONFIG_FILE = path.join(__dirname, 'config', 'keycloak.json');

let cfg = {
  apiUrl: 'https://api.mingod.es',
  clientId: 'djdiscord',
  // Debe ser EXACTAMENTE el mismo que 'pase_secret' en el config.php de la puerta.
  paseSecret: '',
};

/**
 * Carga la configuración. `fichero` existe para poder probar el caso "sin
 * configurar" sin depender de que el keycloak.json real esté o no en disco.
 */
function cargarConfig(fichero = KC_CONFIG_FILE) {
  cfg = { apiUrl: 'https://api.mingod.es', clientId: 'djdiscord', paseSecret: '' };
  try {
    if (fichero && fs.existsSync(fichero)) {
      Object.assign(cfg, JSON.parse(fs.readFileSync(fichero, 'utf8')));
    }
  } catch (e) {
    console.log('[Keycloak] config/keycloak.json ilegible:', e.message);
  }
  if (process.env.KC_API_URL) cfg.apiUrl = process.env.KC_API_URL;
  if (process.env.KC_CLIENT_ID) cfg.clientId = process.env.KC_CLIENT_ID;
  if (process.env.KC_PASE_SECRET) cfg.paseSecret = process.env.KC_PASE_SECRET;

  cfg.apiUrl = String(cfg.apiUrl || '').replace(/\/$/, '');
  return cfg;
}

/** ¿Puede este servidor aceptar sesiones? */
function habilitado() {
  return Boolean(cfg.clientId && cfg.paseSecret);
}

/** Secreto compartido con la puerta, para verificar sus pases. */
function paseSecret() {
  return cfg.paseSecret;
}

/** Datos no sensibles, para logs y comprobaciones. */
function configPublica() {
  return { apiUrl: cfg.apiUrl, clientId: cfg.clientId };
}

module.exports = { cargarConfig, habilitado, paseSecret, configPublica };
