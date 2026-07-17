// lib/scrapers/apeseg.js
// Scraper APESEG — Consulta de SOAT por placa
//
// Flujo descubierto analizando el JS bundle de webapp.apeseg.org.pe:
//   1. POST /consulta-soat/api/login  → Bearer token
//   2. Resolver Turnstile (Cloudflare) → CF-Turnstile-Response token
//   3. GET  /consulta-soat/api/certificados/placa/{PLACA}  → datos SOAT
//   4. POST /consulta-soat/api/logout
//
// Para el Turnstile usamos CapSolver (servicio de resolución de captchas):
//   - Gratis con créditos iniciales
//   - API key en variable de entorno: CAPSOLVER_API_KEY
//   - Precio: ~$0.001 por resolución
//   - Si no hay API key, retorna error gracioso

const axios = require('axios');
const https  = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const API_BASE       = 'https://api.apeseg.org.pe';
const APESEG_EMAIL   = process.env.APESEG_EMAIL    || 'notificaciones@apeseg.org.pe';
const APESEG_PASS    = process.env.APESEG_PASSWORD  || 'G3sepa13579!';
const APESEG_SITEKEY = '0x4AAAAAADyJA_4hEDeVktbR';
const APESEG_WEBAPP  = 'https://webapp.apeseg.org.pe';
const CAPSOLVER_KEY  = process.env.CAPSOLVER_API_KEY || '';

const HEADERS_JSON = {
  'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept':       'application/json, */*',
  'Content-Type': 'application/json',
  'Origin':       APESEG_WEBAPP,
  'Referer':      APESEG_WEBAPP + '/consulta-soat/',
};

// ── Cache de token ────────────────────────────────────────────────────────────
let cachedToken    = null;
let tokenExpiresAt = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const r = await axios.post(
    `${API_BASE}/consulta-soat/api/login`,
    { email: APESEG_EMAIL, password: APESEG_PASS },
    { httpsAgent, headers: HEADERS_JSON, timeout: 15000, validateStatus: s => s < 500 }
  );

  if (!r.data?.access_token) throw new Error(`APESEG login failed: ${JSON.stringify(r.data)}`);

  cachedToken    = r.data.access_token;
  tokenExpiresAt = now + ((r.data.expires_in || 3600) * 1000 - 30000);
  return cachedToken;
}

async function logout(token) {
  try {
    await axios.post(`${API_BASE}/consulta-soat/api/logout`, {},
      { httpsAgent, headers: { ...HEADERS_JSON, Authorization: `Bearer ${token}` }, timeout: 5000 }
    );
  } catch (_) {}
}

// ── Resolver Turnstile con CapSolver ─────────────────────────────────────────
async function resolverTurnstile() {
  if (!CAPSOLVER_KEY) return null;

  try {
    // Crear tarea
    const rCreate = await axios.post('https://api.capsolver.com/createTask', {
      clientKey: CAPSOLVER_KEY,
      task: {
        type: 'AntiTurnstileTaskProxyLess',
        websiteURL: APESEG_WEBAPP + '/consulta-soat/',
        websiteKey: APESEG_SITEKEY,
        metadata: { action: '', cdata: '' },
      }
    }, { timeout: 15000, validateStatus: s => s < 500 });

    if (!rCreate.data?.taskId) {
      console.warn('[CapSolver] No se pudo crear tarea:', JSON.stringify(rCreate.data));
      return null;
    }

    const taskId = rCreate.data.taskId;
    console.log('[CapSolver] Tarea creada:', taskId);

    // Polling del resultado (máximo 60 segundos)
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const rResult = await axios.post('https://api.capsolver.com/getTaskResult', {
        clientKey: CAPSOLVER_KEY,
        taskId,
      }, { timeout: 10000, validateStatus: s => s < 500 });

      if (rResult.data?.status === 'ready') {
        const cfToken = rResult.data?.solution?.token;
        console.log('[CapSolver] Token obtenido:', cfToken?.substring(0, 30) + '...');
        return cfToken;
      }
      if (rResult.data?.status === 'failed') {
        console.warn('[CapSolver] Tarea fallida:', rResult.data?.errorDescription);
        return null;
      }
      // status = 'processing' → continuar esperando
    }

    console.warn('[CapSolver] Timeout esperando token');
    return null;

  } catch (err) {
    console.error('[CapSolver] Error:', err.message);
    return null;
  }
}

// ── Normalizar respuesta ───────────────────────────────────────────────────────
function normalizar(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return { ok: true, soat_vigente: false, mensaje: 'Sin SOAT vigente registrado' };
  }

  const cert = data[0];
  const hoy  = new Date();
  let fechaFin = null;

  try {
    const raw = cert.FechaFin || cert.fechaFin || cert.fecha_fin || cert.FechaVencimiento || '';
    if (raw) {
      if (raw.includes('/')) {
        const [d, m, y] = raw.split('/');
        fechaFin = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
      } else {
        fechaFin = new Date(raw);
      }
    }
  } catch (_) {}

  const soat_vigente = fechaFin ? fechaFin > hoy : false;

  return {
    ok: true,
    soat_vigente,
    aseguradora:       cert.Aseguradora         || cert.aseguradora        || 'N/D',
    num_poliza:        cert.NumPoliza            || cert.num_poliza         || 'N/D',
    fecha_inicio:      cert.FechaInicio          || cert.fechaInicio        || null,
    fecha_vencimiento: fechaFin?.toISOString()   || null,
    placa:             cert.Placa                || cert.placa              || null,
    tipo_uso:          cert.TipoUso              || cert.tipo_uso           || null,
    certificados_total: data.length,
  };
}

// ── Función principal ─────────────────────────────────────────────────────────
async function consultarAPESEG(placa) {
  let token = null;

  try {
    // 1. Obtener Bearer token
    token = await getToken();

    // 2. Obtener token de Turnstile (si hay CapSolver key)
    const cfToken = await resolverTurnstile();

    if (!cfToken && !CAPSOLVER_KEY) {
      console.warn('[APESEG] No hay CAPSOLVER_API_KEY configurada — SOAT no disponible');
      return {
        ok: false, error: true, soat_vigente: null,
        mensaje: 'APESEG requiere configuración adicional (CAPSOLVER_API_KEY)',
      };
    }

    if (!cfToken) {
      console.warn('[APESEG] No se pudo resolver Turnstile');
      return {
        ok: false, error: true, soat_vigente: null,
        mensaje: 'No se pudo completar la verificación de seguridad APESEG',
      };
    }

    // 3. Consultar certificados con el token de Turnstile
    const r = await axios.get(`${API_BASE}/consulta-soat/api/certificados/placa/${placa}`, {
      httpsAgent,
      headers: {
        ...HEADERS_JSON,
        Authorization:          `Bearer ${token}`,
        'CF-Turnstile-Response': cfToken,
        'X-Source':              'apeseg',
        'X-Referrer':            'apeseg',
      },
      timeout: 20000,
      validateStatus: s => s < 500,
    });

    console.log(`[APESEG] ${placa}: ${r.status}`, typeof r.data === 'object' ? JSON.stringify(r.data).substring(0,120) : r.data?.substring(0,80));

    // 4. Logout (asíncrono, no bloquea)
    logout(token).catch(() => {});

    if (r.status === 429) {
      return { ok: false, error: true, soat_vigente: null, mensaje: 'APESEG: límite de consultas alcanzado' };
    }
    if (r.status !== 200) {
      return { ok: false, error: true, soat_vigente: null, mensaje: 'Servicio APESEG no disponible temporalmente' };
    }

    return normalizar(r.data);

  } catch (err) {
    if (err.message?.includes('login failed') || err.response?.status === 401) {
      cachedToken = null; tokenExpiresAt = 0;
    }
    console.error('[APESEG] Error:', err.message);
    return {
      ok: false, error: true, soat_vigente: null,
      mensaje: 'Servicio APESEG no disponible temporalmente',
    };
  }
}

module.exports = { consultarAPESEG };
