const p = require('../perfiles.js');
let fallos = 0;
const ok = (c, m) => { console.log((c ? 'PASA  ' : 'FALLA ') + m); if (!c) fallos++; };

// --- Adopción de un perfil anterior a Keycloak ---
const antiguos = () => ([{
  id: 'viejo1', username: 'DjMingod', passwordHash: 'ab', passwordSalt: 'cd',
  locationLabel: 'Las Palmas, Spain', allowedCountry: 'ES', stickerGif: '/stickers/fiesta.gif'
}]);

let users = antiguos();
let r = p.buscarPerfil(users, 'sub-1', 'djmingod');   // Keycloak normaliza a minúsculas
ok(r.adoptado === true, 'adopta el perfil antiguo aunque cambien las mayúsculas');
ok(r.perfil.kcSub === 'sub-1', 'enlaza el kcSub');
ok(r.perfil.stickerGif === '/stickers/fiesta.gif', 'CONSERVA el sticker');
ok(r.perfil.allowedCountry === 'ES', 'CONSERVA el país autorizado');
ok(!('passwordHash' in r.perfil) && !('passwordSalt' in r.perfil), 'borra los restos de contraseña');
ok(users.length === 1, 'no duplica: sigue habiendo 1 perfil');

// Segunda llamada: ya está enlazado, no vuelve a adoptar
r = p.buscarPerfil(users, 'sub-1', 'djmingod');
ok(r.adoptado === false && r.perfil.id === 'viejo1', 'segunda vez lo encuentra por kcSub, sin re-adoptar');

// Un sub distinto con el mismo nombre NO roba el perfil ya enlazado
r = p.buscarPerfil(users, 'sub-OTRO', 'djmingod');
ok(r.perfil === null, 'no secuestra un perfil que ya pertenece a otro sub');

// Usuario desconocido
ok(p.buscarPerfil(antiguos(), 'sub-x', 'nadie').perfil === null, 'usuario sin perfil -> null');
ok(p.buscarPerfil(antiguos(), 'sub-x', '').perfil === null, 'username vacío no adopta a ciegas');

// --- Perfil nuevo ---
const nuevo = p.nuevoPerfil('sub-9', 'nuevo', '1.2.3.4', { city: 'Madrid', country: 'Spain', countryCode: 'ES', region: 'MD' });
ok(nuevo.locationLabel === 'Madrid, Spain', 'etiqueta de ubicación compuesta');
ok(nuevo.allowedCountry === 'ES', 'fija el país autorizado');
ok(p.nuevoPerfil('s', 'u', '127.0.0.1', { isLocal: true }).locationLabel === 'Local', 'ubicación local');
ok(p.nuevoPerfil('s', 'u', '1.2.3.4', null).allowedCountry === 'UNKNOWN', 'sin geo -> UNKNOWN');

// --- Geo-restricción ---
const es = { allowedCountry: 'ES' };
ok(p.ubicacionDenegada(es, { countryCode: 'FR', country: 'France' }) === 'France', 'deniega desde otro país');
ok(p.ubicacionDenegada(es, { countryCode: 'ES', country: 'Spain' }) === null, 'permite desde el país registrado');
ok(p.ubicacionDenegada(es, { isLocal: true }) === null, 'permite en local');
ok(p.ubicacionDenegada(es, null) === null, 'geo no disponible -> no bloquea');
ok(p.ubicacionDenegada({ allowedCountry: 'UNKNOWN' }, { countryCode: 'FR' }) === null, 'UNKNOWN no restringe');
ok(p.ubicacionDenegada({ allowedCountry: 'LOCAL' }, { countryCode: 'FR' }) === null, 'LOCAL no restringe');

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
