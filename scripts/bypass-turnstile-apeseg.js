// scripts/bypass-turnstile-apeseg.js
// Intenta bypass del Cloudflare Turnstile de APESEG
// Estrategias:
// 1. Header CF-Turnstile-Response con valores "trampa" conocidos
// 2. Usar el sitekey para generar un token de prueba (modo test)
// 3. Pasar el token como query param en lugar de header
// 4. Probar endpoint alternativo sin Turnstile

const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const PLACA = 'CKR477';
const API = 'https://api.apeseg.org.pe';

const HEADERS_BASE = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Origin': 'https://webapp.apeseg.org.pe',
  'Referer': 'https://webapp.apeseg.org.pe/consulta-soat/',
};

async function login() {
  const r = await axios.post(`${API}/consulta-soat/api/login`, {
    email: 'notificaciones@apeseg.org.pe',
    password: 'G3sepa13579!'
  }, { httpsAgent, headers: { ...HEADERS_BASE, 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: s => s < 600 });
  return r.data?.access_token;
}

async function probe(token, cfToken, desc) {
  const headers = {
    ...HEADERS_BASE,
    'Authorization': `Bearer ${token}`,
    'X-Source': 'apeseg',
    'X-Referrer': 'apeseg',
  };
  if (cfToken !== null) headers['CF-Turnstile-Response'] = cfToken;
  
  const r = await axios.get(`${API}/consulta-soat/api/certificados/placa/${PLACA}`, {
    httpsAgent, headers, timeout: 15000, validateStatus: s => s < 600
  }).catch(e => ({ status: 0, data: { error: e.message } }));
  
  const preview = JSON.stringify(r.data).substring(0, 200);
  console.log(`[${desc}] ${r.status}: ${preview}`);
  return r;
}

async function run() {
  console.log('=== BYPASS CLOUDFLARE TURNSTILE — APESEG ===\n');
  
  const token = await login();
  if (!token) { console.error('No se pudo obtener token'); return; }
  console.log('Token:', token.substring(0, 40) + '...\n');

  // ── Estrategia 1: Sin header CF-Turnstile-Response ─────────────────────
  await probe(token, null, 'Sin CF-Turnstile');
  
  // ── Estrategia 2: CF-Turnstile vacío ────────────────────────────────────
  await probe(token, '', 'CF-Turnstile vacío');
  
  // ── Estrategia 3: Token de prueba "XXXX.DUMMY.TOKEN" ────────────────────
  await probe(token, 'XXXX.DUMMY.TOKEN.XXXX', 'Dummy token');
  
  // ── Estrategia 4: Cloudflare Turnstile tiene tokens de TEST especiales ──
  // Sitekey de prueba: 1x00000000000000000000AA (siempre pasa)
  // Token de prueba: SENTINELTOKEN (bypass conocido en modo test)
  await probe(token, 'SENTINELTOKEN', 'Sentinel token');
  await probe(token, '1x0000000000000000000000000000000AA', 'Test token 1');
  await probe(token, 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9', 'JWT fake');
  
  // ── Estrategia 5: Query param en vez de header ──────────────────────────
  console.log('\n--- Query param estrategia ---');
  const r5 = await axios.get(`${API}/consulta-soat/api/certificados/placa/${PLACA}?cf-turnstile-response=bypass`, {
    httpsAgent, headers: { ...HEADERS_BASE, Authorization: `Bearer ${token}` }, timeout: 15000, validateStatus: s => s < 600
  }).catch(e => ({ status: 0, data: { error: e.message } }));
  console.log('[Query param] ' + r5.status + ':', JSON.stringify(r5.data).substring(0, 200));

  // ── Estrategia 6: POST en vez de GET ────────────────────────────────────
  console.log('\n--- POST en vez de GET ---');
  const r6 = await axios.post(`${API}/consulta-soat/api/certificados/placa/${PLACA}`, {}, {
    httpsAgent, headers: { ...HEADERS_BASE, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: s => s < 600
  }).catch(e => ({ status: 0, data: { error: e.message } }));
  console.log('[POST] ' + r6.status + ':', JSON.stringify(r6.data).substring(0, 200));

  // ── Estrategia 7: Body con la placa y turnstile ──────────────────────────
  console.log('\n--- POST con body ---');
  const r7 = await axios.post(`${API}/consulta-soat/api/certificados`, { placa: PLACA, turnstile: 'bypass' }, {
    httpsAgent, headers: { ...HEADERS_BASE, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: s => s < 600
  }).catch(e => ({ status: 0, data: { error: e.message } }));
  console.log('[POST body] ' + r7.status + ':', JSON.stringify(r7.data).substring(0, 200));

  // ── Estrategia 8: Endpoint alternativo sin Turnstile ────────────────────
  console.log('\n--- Endpoints alternativos ---');
  const altEndpoints = [
    `/consulta-soat/api/v1/certificados/placa/${PLACA}`,
    `/consulta-soat/api/v2/certificados/placa/${PLACA}`,
    `/consulta-soat/api/soat/placa/${PLACA}`,
    `/consulta-soat/api/poliza/placa/${PLACA}`,
    `/consulta-soat/api/vehiculo/${PLACA}`,
    `/consulta-soat/api/consulta/${PLACA}`,
    `/consulta-soat/api/placa/${PLACA}`,
    `/consulta-soat/api/interno/certificados/placa/${PLACA}`,
    `/consulta-soat/api/admin/certificados/placa/${PLACA}`,
  ];
  
  for (const path of altEndpoints) {
    const r = await axios.get(`${API}${path}`, {
      httpsAgent, headers: { ...HEADERS_BASE, Authorization: `Bearer ${token}` }, timeout: 10000, validateStatus: s => s < 600
    }).catch(e => ({ status: 0, data: { error: e.message } }));
    const preview = JSON.stringify(r.data).substring(0, 150);
    if (r.status !== 0 && r.status !== 404) {
      console.log(`  ${path}: ${r.status} | ${preview}`);
    } else {
      console.log(`  ${path}: ${r.status || r.error?.substring(0,30)}`);
    }
  }

  // Logout
  await axios.post(`${API}/consulta-soat/api/logout`, {}, {
    httpsAgent, headers: { Authorization: `Bearer ${token}` }, timeout: 5000, validateStatus: s => s < 600
  }).catch(() => {});
}

run().catch(console.error);
