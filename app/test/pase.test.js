const crypto = require('crypto');
const p = require('../pase.js');

let fallos = 0;
const ok = (c, m) => { console.log((c ? 'PASA  ' : 'FALLA ') + m); if (!c) fallos++; };

const SECRETO = 'secreto-compartido-de-prueba';
const APP = 'djdiscord';

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Fabrica un pase como lo haría api/pase.php. */
function firmar(claims, secreto = SECRETO) {
  const carga = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  const firma = b64url(crypto.createHmac('sha256', secreto).update(carga).digest());
  return carga + '.' + firma;
}

const futuro = () => Math.floor(Date.now() / 1000) + 120;
const base = () => ({ sub: 'abc-123', usuario: 'doramas', roles: ['user'], app: APP, exp: futuro() });

// --- Camino bueno ---
let c = p.verificar(firmar(base()), SECRETO, APP);
ok(c !== null, 'acepta un pase bien firmado y vigente');
ok(c && c.sub === 'abc-123', 'devuelve el sub');
ok(c && c.usuario === 'doramas', 'devuelve el usuario');
ok(c && Array.isArray(c.roles) && c.roles[0] === 'user', 'devuelve los roles');

// --- Firma ---
ok(p.verificar(firmar(base(), 'otro-secreto'), SECRETO, APP) === null,
   'RECHAZA un pase firmado con otro secreto');

const manipulado = firmar(base());
const [carga, firma] = manipulado.split('.');
const otraCarga = b64url(Buffer.from(JSON.stringify({ ...base(), sub: 'INTRUSO' }), 'utf8'));
ok(p.verificar(otraCarga + '.' + firma, SECRETO, APP) === null,
   'RECHAZA si se cambia el contenido conservando la firma');
ok(p.verificar(carga + '.' + b64url(Buffer.from('firma-falsa')), SECRETO, APP) === null,
   'RECHAZA una firma inventada');

// --- Caducidad ---
ok(p.verificar(firmar({ ...base(), exp: Math.floor(Date.now() / 1000) - 1 }), SECRETO, APP) === null,
   'RECHAZA un pase caducado');
ok(p.verificar(firmar({ ...base(), exp: undefined }), SECRETO, APP) === null,
   'RECHAZA un pase sin exp');
ok(p.verificar(firmar({ ...base(), exp: 'pronto' }), SECRETO, APP) === null,
   'RECHAZA un exp que no es numero');

// --- App ---
ok(p.verificar(firmar({ ...base(), app: 'munckin' }), SECRETO, APP) === null,
   'RECHAZA un pase emitido para OTRA app');
ok(p.verificar(firmar({ ...base(), app: 'munckin' }), SECRETO, null) !== null,
   'sin app esperada, no comprueba la app');

// --- Identidad ---
ok(p.verificar(firmar({ ...base(), sub: undefined }), SECRETO, APP) === null,
   'RECHAZA un pase sin sub');

// --- Entradas malformadas ---
for (const malo of ['', 'sinpunto', 'a.b.c', '.', 'a.', '.b', null, undefined, 42, {}]) {
  ok(p.verificar(malo, SECRETO, APP) === null, 'RECHAZA entrada malformada: ' + JSON.stringify(malo));
}
ok(p.verificar(firmar(base()), '', APP) === null, 'sin secreto configurado no valida nada');
ok(p.verificar('YWJj.ZGVm', SECRETO, APP) === null, 'RECHAZA carga que no es JSON');

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
