// Perfil local del usuario (users.json). Ya NO guarda credenciales: solo la
// ubicación autorizada, el sticker y la fecha de alta. La identidad es `kcSub`,
// el claim `sub` de Keycloak, que es estable aunque el usuario se renombre.
//
// Está en su propio módulo para poder probar la adopción de perfiles antiguos
// sin arrancar el servidor: es la parte donde un fallo silencioso duplicaría
// cuentas y haría perder el sticker y el país autorizado de gente real.

const crypto = require('crypto');

/**
 * Busca el perfil de un usuario de Keycloak.
 *
 * Si no lo encuentra por `kcSub`, adopta un registro antiguo con el mismo nombre
 * (comparando sin distinguir mayúsculas) y lo enlaza al `sub`, quitándole los
 * restos de contraseña. Así una cuenta anterior a Keycloak conserva su sticker y
 * su geo-restricción la primera vez que entra con el login centralizado.
 *
 * Devuelve { perfil, adoptado } — `adoptado` indica si hay que guardar a disco.
 */
function buscarPerfil(users, sub, username) {
  const porSub = users.find(u => u.kcSub === sub);
  if (porSub) return { perfil: porSub, adoptado: false };

  const nombre = String(username || '').toLowerCase();
  if (nombre === '') return { perfil: null, adoptado: false };

  const antiguo = users.find(u => !u.kcSub && String(u.username || '').toLowerCase() === nombre);
  if (!antiguo) return { perfil: null, adoptado: false };

  antiguo.kcSub = sub;
  antiguo.username = username;
  delete antiguo.passwordHash;
  delete antiguo.passwordSalt;
  return { perfil: antiguo, adoptado: true };
}

/** Construye el perfil de un usuario nuevo, fijando su ubicación autorizada. */
function nuevoPerfil(sub, username, ip, location) {
  const locationLabel = location?.isLocal
    ? 'Local'
    : [location?.city, location?.country].filter(Boolean).join(', ') || 'Desconocido';

  return {
    id: crypto.randomBytes(16).toString('hex'),
    kcSub: sub,
    username,
    locationLabel,
    allowedCountry: location?.countryCode || 'UNKNOWN',
    allowedRegion: location?.region || '',
    locationData: location,
    registeredIp: ip,
    createdAt: new Date().toISOString()
  };
}

/**
 * ¿Se le deniega el acceso desde esta ubicación?
 * Devuelve el país detectado si hay que denegar, o null si puede pasar.
 */
function ubicacionDenegada(perfil, location) {
  if (perfil.allowedCountry === 'LOCAL' || perfil.allowedCountry === 'UNKNOWN') return null;
  if (!location || location.isLocal) return null;
  if (location.countryCode === perfil.allowedCountry) return null;
  return location.country || location.countryCode || 'desconocido';
}

module.exports = { buscarPerfil, nuevoPerfil, ubicacionDenegada };
