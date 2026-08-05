const kc = require('../keycloak.js');
let fallos = 0;
const ok = (c, m) => { console.log((c ? 'PASA  ' : 'FALLA ') + m); if (!c) fallos++; };

// 1. Sin secreto de pase -> deshabilitado (el servidor no debe caerse).
// Se apunta a un fichero inexistente para no depender del keycloak.json real.
const SIN_CONFIG = require('path').join(__dirname, 'no-existe.json');
delete process.env.KC_PASE_SECRET;
kc.cargarConfig(SIN_CONFIG);
ok(kc.habilitado() === false, 'sin paseSecret -> habilitado() = false');
ok(kc.paseSecret() === '', 'paseSecret() vacio');

// 2. Las variables de entorno tienen prioridad
process.env.KC_PASE_SECRET = 'secreto-de-prueba';
process.env.KC_CLIENT_ID = 'djdiscord';
kc.cargarConfig(SIN_CONFIG);
ok(kc.habilitado() === true, 'con KC_PASE_SECRET -> habilitado() = true');
ok(kc.paseSecret() === 'secreto-de-prueba', 'paseSecret() devuelve el valor');
ok(kc.configPublica().clientId === 'djdiscord', 'configPublica() expone clientId');
ok(!('paseSecret' in kc.configPublica()), 'configPublica() NO expone el secreto');

// 3. Este servidor ya no maneja credenciales de Keycloak: el login vive en la web
ok(typeof kc.login === 'undefined', 'no expone login()');
ok(typeof kc.register === 'undefined', 'no expone register()');
ok(!('clientSecret' in kc.configPublica()), 'no expone client_secret');

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
