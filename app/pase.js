// Verificación de los "pases" que emite la puerta del webspace (api/pase.php).
//
// Un pase es la forma que tiene este backend de fiarse de una identidad que ya
// validó Keycloak, sin poder leer la cookie de la puerta (vive en otro origen).
// Aquí NO se comprueban contraseñas: solo una firma HMAC con un secreto que
// comparten la puerta y este servidor.
//
// Formato:  base64url(json).base64url(hmac_sha256(json, secreto))
// Contenido: { sub, usuario, roles, app, exp }
//
// Está en su propio módulo para poder probarlo sin arrancar el servidor: es
// código de seguridad y un fallo aquí dejaría entrar a cualquiera.

const crypto = require('crypto');

function b64urlDecode(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Comprueba un pase y devuelve sus claims, o null si no es válido.
 *
 * Rechaza: formato incorrecto, firma que no cuadra, caducado, sin `sub`, o de
 * una app distinta a la esperada.
 */
function verificar(pase, secreto, appEsperada) {
  if (typeof pase !== 'string' || !secreto) return null;

  const partes = pase.split('.');
  if (partes.length !== 2) return null;

  const [carga, firma] = partes;
  if (!carga || !firma) return null;

  const esperada = b64url(crypto.createHmac('sha256', secreto).update(carga).digest());

  // Comparación en tiempo constante. timingSafeEqual exige igual longitud.
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let claims;
  try {
    claims = JSON.parse(b64urlDecode(carga).toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  if (!claims.sub) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
  if (appEsperada && claims.app !== appEsperada) return null;

  return claims;
}

module.exports = { verificar };
