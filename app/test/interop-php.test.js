// Interoperabilidad puerta (PHP) <-> backend (Node).
//
// Un pase lo FIRMA PHP y lo VERIFICA JavaScript. Si los dos lados no codifican
// el base64url o el HMAC exactamente igual, nada funciona y el fallo solo se ve
// en producción. Aquí se replica el algoritmo de api/pase.php byte a byte y se
// comprueba que pase.js lo acepta.
//
// Equivalencias con webspace-gate/session.php:
//   kc_b64url($d)          = base64(d) con +/ -> -_ y sin '='
//   kc_firmar($d, $s)      = kc_b64url(hash_hmac('sha256', $d, $s, true))
//   pase                   = kc_b64url(json) . '.' . kc_firmar(carga, secreto)

const crypto = require('crypto');
const p = require('../pase.js');

let fallos = 0;
const ok = (c, m) => { console.log((c ? 'PASA  ' : 'FALLA ') + m); if (!c) fallos++; };

const SECRETO = 'a3f1c9e07b5d2846a3f1c9e07b5d2846';
const APP = 'djdiscord';

/** kc_b64url() de session.php */
function kcB64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** kc_firmar() de session.php */
function kcFirmar(datos, secreto) {
  return kcB64url(crypto.createHmac('sha256', secreto).update(datos, 'utf8').digest());
}

/** Reproduce lo que hace api/pase.php */
function paseComoPhp(claims, secreto = SECRETO) {
  // json_encode con JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  const json = JSON.stringify(claims);
  const carga = kcB64url(Buffer.from(json, 'utf8'));
  return carga + '.' + kcFirmar(carga, secreto);
}

const exp = Math.floor(Date.now() / 1000) + 120;

// --- Caso normal ---
let c = p.verificar(paseComoPhp({
  sub: '6f1b3d2a-1111-4c8e-9f00-abcdef123456',
  usuario: 'doramas',
  roles: ['user'],
  app: APP,
  exp,
}), SECRETO, APP);
ok(c !== null, 'el backend acepta un pase firmado como lo firma PHP');
ok(c && c.usuario === 'doramas', 'llega el usuario intacto');

// --- Acentos y ñ: json_encode con JSON_UNESCAPED_UNICODE emite UTF-8 crudo ---
c = p.verificar(paseComoPhp({
  sub: 'x-1', usuario: 'añoño', roles: ['user', 'admin'], app: APP, exp,
}), SECRETO, APP);
ok(c !== null && c.usuario === 'añoño', 'sobrevive un usuario con ñ y acentos (UTF-8)');

// --- El relleno '=' que PHP recorta no debe estropear la decodificación ---
const largos = ['a', 'ab', 'abc', 'abcd'];
let todosOk = true;
for (const n of largos) {
  const r = p.verificar(paseComoPhp({ sub: n, usuario: n, roles: [], app: APP, exp }), SECRETO, APP);
  if (!r || r.sub !== n) todosOk = false;
}
ok(todosOk, 'funciona con cargas de longitudes que generan distinto relleno base64');

// --- Secreto distinto en cada lado: el fallo más probable al desplegar ---
ok(p.verificar(paseComoPhp({ sub: 'x', usuario: 'x', roles: [], app: APP, exp }, 'OTRO'), SECRETO, APP) === null,
   'si la puerta y el backend NO comparten secreto, se rechaza');

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
