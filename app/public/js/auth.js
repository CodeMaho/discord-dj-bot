// ============================================
// Discord DJ — Identidad (Keycloak, vía la puerta)
// ============================================
//
// Ya NO hay formularios de login ni de registro aquí. De eso se encarga la
// puerta del webspace (login.php / registro.php), que valida contra Keycloak.
// Cuando esta página se carga, el usuario YA está identificado: la puerta no
// habría servido el fichero si no.
//
// Lo único que queda es enganchar esa identidad con el backend, que vive en
// otro origen (el túnel) y no puede leer la cookie de la puerta:
//
//   1. GET /api/perfil.php  -> quién soy. Funciona SIEMPRE, esté o no el
//      backend encendido. Por eso puedes entrar antes de arrancarlo.
//   2. Cuando se detecta el backend, GET /api/pase.php pide a la puerta un pase
//      firmado y se canjea en POST <backend>/api/auth/sesion por una sesión.
//   3. Si el backend no está, se reintenta en segundo plano hasta que aparezca.

(function () {
    const TOKEN_KEY = 'djToken';
    const REINTENTO_MS = 5000;

    let usuario = null;      // { id, username, nombre, roles }
    let enlazando = false;

    // ── Fetch original, sin la cabecera de sesión ───────────────────────────
    const _fetch = window.fetch.bind(window);

    // ── Fetch override: añade Authorization a las llamadas al backend ───────
    window.fetch = function (url, opts) {
        opts = opts || {};
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
            opts = Object.assign({}, opts, {
                headers: Object.assign({}, opts.headers || {}, { 'Authorization': 'Bearer ' + token })
            });
        }
        return _fetch(url, opts);
    };

    // ── WebSocket URL override: añade ?token= ───────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        if (typeof window.getWebSocketUrl === 'function') {
            const _origWsUrl = window.getWebSocketUrl;
            window.getWebSocketUrl = function () {
                const base = _origWsUrl();
                const token = localStorage.getItem(TOKEN_KEY);
                return token ? base + '?token=' + token : base;
            };
        }
    }, { once: true });

    // ── Helpers ─────────────────────────────────────────────────────────────
    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
    function clearToken() { localStorage.removeItem(TOKEN_KEY); }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function estado(titulo, detalle, mostrarReintento) {
        const el = document.getElementById('auth-estado');
        if (!el) return;
        el.innerHTML = '<div class="auth-estado-titulo">' + escapeHtml(titulo) + '</div>'
            + '<div class="auth-estado-detalle">' + escapeHtml(detalle) + '</div>'
            + (mostrarReintento ? '<button class="btn btn-primary auth-submit" id="auth-reintentar">Reintentar ahora</button>' : '');
        const btn = document.getElementById('auth-reintentar');
        if (btn) btn.addEventListener('click', () => enlazarConBackend(true));
    }

    // ── Comprobar si un backend responde ────────────────────────────────────
    async function probeBackend(url) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4000);
            const r = await _fetch(url + '/api/ping', { signal: ctrl.signal, cache: 'no-cache' });
            clearTimeout(timer);
            return r.ok;
        } catch (_) { return false; }
    }

    // Recoge los candidatos de URL de backend y devuelve el primero que responda.
    async function resolveApiBase() {
        const seen = new Set();
        const candidates = [];

        function add(url) {
            if (!url) return;
            url = url.replace(/\/$/, '');
            if (!url.startsWith('http')) url = 'https://' + url;
            if (!seen.has(url)) { seen.add(url); candidates.push(url); }
        }

        if (typeof getBackendUrl === 'function') add(getBackendUrl());
        if (typeof getInitialBackendUrl === 'function') add(getInitialBackendUrl());
        try {
            const r = await _fetch(window.location.origin + '/api/config.php', { cache: 'no-cache' });
            if (r.ok) { const d = await r.json(); add(d.backendUrl); }
        } catch (_) {}
        try {
            const r = await _fetch(window.location.origin + '/api/backend-url.json', { cache: 'no-cache' });
            if (r.ok) { const d = await r.json(); add(d.backendUrl); }
        } catch (_) {}

        for (const url of candidates) {
            if (url === window.location.origin) continue;
            if (await probeBackend(url)) return url;
        }
        return null;
    }

    // ── Quién soy (según la puerta) ─────────────────────────────────────────
    async function cargarIdentidad() {
        const r = await _fetch('/api/perfil.php', { cache: 'no-store' });
        if (r.status === 401 || r.status === 409) {
            // La sesión de la puerta caducó: volver a ella.
            location.href = '/login.php?volver=' + encodeURIComponent(location.pathname);
            return null;
        }
        if (!r.ok) throw new Error('No se pudo leer el perfil');
        return await r.json();
    }

    // ── Canjear el pase de la puerta por una sesión del backend ─────────────
    async function enlazarConBackend(forzar) {
        if (enlazando) return false;
        enlazando = true;
        try {
            if (!forzar && getToken() && await sesionValida()) {
                arrancarApp();
                return true;
            }

            estado('Buscando el reproductor…', 'Comprobando si el backend está encendido.', false);
            const base = await resolveApiBase();
            if (!base) {
                estado('El reproductor no está encendido',
                       'Ya estás identificado como ' + (usuario ? usuario.username : '') +
                       '. En cuanto arranque, esto se conecta solo.', true);
                return false;
            }

            const rp = await _fetch('/api/pase.php', { cache: 'no-store' });
            if (!rp.ok) {
                estado('No se pudo obtener el pase',
                       'La puerta respondió ' + rp.status + '. Prueba a recargar la página.', true);
                return false;
            }
            const { pase } = await rp.json();

            const rs = await _fetch(base + '/api/auth/sesion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pase })
            });
            const d = await rs.json().catch(() => ({}));

            if (!rs.ok || !d.token) {
                estado('El reproductor rechazó la sesión',
                       d.error || ('Respondió ' + rs.status + '.'), true);
                return false;
            }

            setToken(d.token);
            arrancarApp(d.locationLabel);
            return true;
        } catch (e) {
            estado('Error de conexión', String(e && e.message ? e.message : e), true);
            return false;
        } finally {
            enlazando = false;
        }
    }

    async function sesionValida() {
        try {
            const base = await resolveApiBase();
            if (!base) return false;
            const r = await _fetch(base + '/api/auth/me', {
                headers: { 'Authorization': 'Bearer ' + getToken() }
            });
            if (!r.ok) return false;
            const d = await r.json();
            window.djLocationLabel = d.locationLabel;
            return true;
        } catch (_) { return false; }
    }

    // ── Arrancar la app ─────────────────────────────────────────────────────
    function arrancarApp(locationLabel) {
        window.djAuthenticated = true;

        const userDisplay = document.getElementById('user-display');
        if (userDisplay && usuario) {
            const donde = locationLabel || window.djLocationLabel;
            userDisplay.innerHTML = '<span class="user-icon">👤</span>' + escapeHtml(usuario.username)
                + (donde ? ' <span class="user-location">📍 ' + escapeHtml(donde) + '</span>' : '');
        }
        const userInfo = document.getElementById('user-info');
        if (userInfo) userInfo.style.display = 'flex';

        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.add('hidden');

        if (typeof window.djPendingInit === 'function') {
            window.djPendingInit();
            window.djPendingInit = null;
        }
    }

    // ── Salir: se cierra la sesión de la puerta, no una propia ──────────────
    function doLogout() {
        clearToken();
        location.href = '/logout.php';
    }

    // ── Inicio ──────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async function () {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

        estado('Identificando…', 'Leyendo tu sesión.', false);

        try {
            usuario = await cargarIdentidad();
        } catch (e) {
            estado('No se pudo leer tu identidad', String(e.message || e), true);
            return;
        }
        if (!usuario) return; // ya se redirigió al login

        const ok = await enlazarConBackend(false);

        // Si el backend no estaba, seguir intentándolo sin molestar al usuario.
        if (!ok) {
            const reloj = setInterval(async () => {
                if (window.djAuthenticated) { clearInterval(reloj); return; }
                if (await enlazarConBackend(true)) clearInterval(reloj);
            }, REINTENTO_MS);
        }
    });
})();
