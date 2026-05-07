// ============================================
// Discord DJ — Sistema de Autenticación
// ============================================

(function () {
    const TOKEN_KEY = 'djToken';

    // Comprueba que una URL de backend está activa (responde en < 4s).
    async function probeBackend(url) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4000);
            const r = await _fetch(url + '/api/auth/location', { signal: ctrl.signal, cache: 'no-cache' });
            clearTimeout(timer);
            return r.ok || r.status === 401 || r.status === 403;
        } catch (_) { return false; }
    }

    // Recoge todos los candidatos y devuelve el primero que responda.
    async function resolveApiBase() {
        const seen = new Set();
        const candidates = [];

        function add(url) {
            if (!url) return;
            url = url.replace(/\/$/, '');
            if (!url.startsWith('http')) url = 'https://' + url;
            if (!seen.has(url)) { seen.add(url); candidates.push(url); }
        }

        // 1. Variable ya cargada en esta sesión
        if (typeof getBackendUrl === 'function') add(getBackendUrl());
        // 2. localStorage / DJ_CONFIG (sincróno, no depende de tryConnect)
        if (typeof getInitialBackendUrl === 'function') add(getInitialBackendUrl());
        // 3. PHP de IONOS (fuente de verdad del túnel actual)
        try {
            const r = await _fetch(window.location.origin + '/api/config.php', { cache: 'no-cache' });
            if (r.ok) { const d = await r.json(); add(d.backendUrl); }
        } catch (_) {}
        // 4. JSON estático
        try {
            const r = await _fetch(window.location.origin + '/api/backend-url.json', { cache: 'no-cache' });
            if (r.ok) { const d = await r.json(); add(d.backendUrl); }
        } catch (_) {}

        // Probar cada candidato y devolver el primero que responda
        for (const url of candidates) {
            if (url === window.location.origin) continue; // el local se prueba al final
            if (await probeBackend(url)) return url;
        }

        // Fallback: mismo origen (acceso local)
        return window.location.origin;
    }

    // ── Fetch override: añade Authorization a todas las llamadas al backend ──
    const _fetch = window.fetch.bind(window);
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
    // Se ejecuta después de que config.js haya definido getWebSocketUrl()
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

    // ── Helpers ──────────────────────────────────────────────────────────────
    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
    function clearToken() { localStorage.removeItem(TOKEN_KEY); }

    function showView(view) {
        document.getElementById('auth-login-form').style.display  = view === 'login'    ? '' : 'none';
        document.getElementById('auth-register-form').style.display = view === 'register' ? '' : 'none';
        document.getElementById('auth-tab-login').classList.toggle('active', view === 'login');
        document.getElementById('auth-tab-register').classList.toggle('active', view === 'register');
        clearErrors();
    }

    function clearErrors() {
        document.getElementById('auth-login-error').style.display    = 'none';
        document.getElementById('auth-register-error').style.display = 'none';
    }

    function showError(formId, msg) {
        const el = document.getElementById(formId + '-error');
        el.textContent = msg;
        el.style.display = 'block';
    }

    function setLoading(btnId, loading) {
        const btn = document.getElementById(btnId);
        btn.disabled = loading;
        btn.textContent = loading ? 'Por favor espera...' : (btnId === 'auth-login-btn' ? 'Iniciar Sesión' : 'Registrarse');
    }

    // ── Arrancar la app después de autenticarse ──────────────────────────────
    function launchApp(username, locationLabel) {
        window.djAuthenticated = true;

        // Actualizar UI de usuario en el header
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) {
            userDisplay.innerHTML = '<span class="user-icon">👤</span>' + escapeHtml(username)
                + ' <span class="user-location">📍 ' + escapeHtml(locationLabel) + '</span>';
        }
        const userInfo = document.getElementById('user-info');
        if (userInfo) userInfo.style.display = 'flex';

        // Ocultar overlay
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.add('hidden');

        // Inicializar la app si DOMContentLoaded ya disparó
        if (typeof window.djPendingInit === 'function') {
            window.djPendingInit();
            window.djPendingInit = null;
        }
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ── Login ────────────────────────────────────────────────────────────────
    async function doLogin() {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        if (!username || !password) { showError('auth-login', 'Completa todos los campos'); return; }

        setLoading('auth-login-btn', true);
        try {
            const res = await _fetch((await resolveApiBase()) + '/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                setToken(data.token);
                launchApp(data.username, data.locationLabel);
            } else {
                showError('auth-login', data.error || 'Error al iniciar sesión');
            }
        } catch (e) {
            showError('auth-login', 'Error de conexión con el servidor');
        } finally {
            setLoading('auth-login-btn', false);
        }
    }

    // ── Registro ─────────────────────────────────────────────────────────────
    async function doRegister() {
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        if (!username || !password) { showError('auth-register', 'Completa todos los campos'); return; }
        if (password.length < 6) { showError('auth-register', 'La contraseña debe tener al menos 6 caracteres'); return; }

        setLoading('auth-register-btn', true);
        try {
            const res = await _fetch((await resolveApiBase()) + '/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                // Tras registrarse, hacer login automático
                document.getElementById('auth-username').value = username;
                document.getElementById('auth-password').value = password;
                showView('login');
                showError('auth-login', '');
                const loginEl = document.getElementById('auth-login-error');
                loginEl.style.color = '#57F287';
                loginEl.textContent = 'Registro exitoso. Inicia sesión.';
                loginEl.style.display = 'block';
            } else {
                showError('auth-register', data.error || 'Error al registrarse');
            }
        } catch (e) {
            showError('auth-register', 'Error de conexión con el servidor');
        } finally {
            setLoading('auth-register-btn', false);
        }
    }

    // ── Logout ───────────────────────────────────────────────────────────────
    async function doLogout() {
        const token = getToken();
        if (token) {
            _fetch((await resolveApiBase()) + '/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            }).catch(() => {});
        }
        clearToken();
        location.reload();
    }

    // ── Verificar token existente ─────────────────────────────────────────────
    async function checkExistingToken() {
        const token = getToken();
        if (!token) return false;
        try {
            const res = await _fetch((await resolveApiBase()) + '/api/auth/me', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (res.ok) {
                const data = await res.json();
                launchApp(data.username, data.locationLabel);
                return true;
            }
        } catch (e) {}
        clearToken();
        return false;
    }

    // ── Inicialización del overlay ────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async function () {
        // Cablear botones del header
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

        // Cablear tabs
        document.getElementById('auth-tab-login').addEventListener('click', () => showView('login'));
        document.getElementById('auth-tab-register').addEventListener('click', () => showView('register'));

        // Cablear botones de formulario
        document.getElementById('auth-login-btn').addEventListener('click', doLogin);
        document.getElementById('auth-register-btn').addEventListener('click', doRegister);

        // Enter en inputs
        ['auth-username', 'auth-password'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
        });
        ['reg-username', 'reg-password'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
        });

        // Verificar token guardado — el overlay ya es visible por defecto,
        // launchApp() lo oculta si el token es válido
        await checkExistingToken();
    });
})();
