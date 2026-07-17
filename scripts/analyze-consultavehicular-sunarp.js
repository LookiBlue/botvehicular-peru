// scripts/analyze-consultavehicular-sunarp.js
// Analiza consultavehicular.sunarp.gob.pe — el portal Angular real de SUNARP
// Descubierto en el navegador del usuario
// Extrae endpoints de la API desde el JS bundle

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
};
const PLACA = 'CKR477';
const BASE = 'https://consultavehicular.sunarp.gob.pe';

async function get(url, extra = {}) {
  try {
    const r = await axios.get(url, {
      httpsAgent,
      headers: { ...HEADERS, ...extra.headers },
      maxRedirects: 5, timeout: 20000,
      validateStatus: s => s < 600,
      ...extra
    });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function post(url, body, headers = {}) {
  try {
    const r = await axios.post(url, body, {
      httpsAgent, headers: { ...HEADERS, ...headers },
      maxRedirects: 3, timeout: 15000, validateStatus: s => s < 600
    });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function run() {
  // ══════════════════════════════════════════════════════
  // BLOQUE 1: Analizar el portal Angular de SUNARP
  // ══════════════════════════════════════════════════════
  console.log('🔍 consultavehicular.sunarp.gob.pe — ANÁLISIS\n');

  const r1 = await get(`${BASE}/consulta-vehicular/inicio`);
  console.log('Status:', r1.status, '| size:', r1.data?.length);
  console.log('Content-Type:', r1.headers?.['content-type']);

  if (r1.status === 200 && r1.data) {
    const $ = cheerio.load(r1.data);
    console.log('Title:', $('title').text().trim());

    // Encontrar archivos JS del bundle Angular
    const jsFiles = [];
    $('script[src]').each((i, el) => {
      const src = $(el).attr('src') || '';
      const fullUrl = src.startsWith('http') ? src : BASE + src;
      jsFiles.push(fullUrl);
    });
    console.log('\nJS bundles encontrados:', jsFiles);

    // Scripts inline (puede tener config)
    $('script:not([src])').each((i, el) => {
      const t = $(el).html() || '';
      if (t.length > 5 && t.length < 3000) {
        console.log(`\nInline script[${i}]:`, t.substring(0, 600));
      }
    });

    // Analizar cada JS del bundle para extraer API endpoints
    console.log('\n--- Extrayendo APIs de los bundles JS ---');
    for (const jsUrl of jsFiles) {
      const rJs = await get(jsUrl);
      if (rJs.status !== 200 || !rJs.data) continue;

      const code = rJs.data;
      const jsName = jsUrl.split('/').pop().split('?')[0];
      console.log(`\n[${jsName}] ${code.length} bytes`);

      // Buscar URLs de API (paths relativos y absolutos)
      const apiPaths = code.match(/["'`](\/[a-z][a-z0-9/_\-]{3,100})["'`]/g) || [];
      const relevantPaths = [...new Set(apiPaths.map(u => u.replace(/["'`]/g, ''))
        .filter(u => u.includes('api') || u.includes('placa') || u.includes('vehiculo') ||
          u.includes('consulta') || u.includes('sunarp') || u.includes('propietario') ||
          u.includes('registro') || u.includes('gravamen')))];
      if (relevantPaths.length) console.log('  API paths:', relevantPaths.slice(0, 20));

      // Buscar URLs absolutas con dominio sunarp o de APIs peruanas
      const absUrls = code.match(/https?:\/\/[^"'`\s\\]{10,200}/g) || [];
      const relevantAbs = [...new Set(absUrls.filter(u =>
        u.includes('sunarp') || u.includes('api') || u.includes('gob.pe') ||
        u.includes('vehiculo') || u.includes('consulta')
      ))];
      if (relevantAbs.length) console.log('  Abs URLs:', relevantAbs.slice(0, 20));

      // Buscar base URL / environment config
      const envMatches = code.match(/(?:baseUrl|apiUrl|BASE_URL|environment|apiBase)[^;{]{0,200}/g) || [];
      if (envMatches.length) {
        console.log('  Config/Env:');
        envMatches.slice(0, 5).forEach(m => console.log('   ', m.trim().substring(0, 200)));
      }

      // Buscar placa en el código
      const placaCtx = code.match(/.{0,100}placa.{0,100}/gi) || [];
      if (placaCtx.length > 0) {
        console.log('  Placa context:');
        [...new Set(placaCtx)].slice(0, 8).forEach(c => console.log('   ', c.trim().substring(0, 200)));
      }

      // Buscar tokens / auth
      const authCtx = code.match(/.{0,50}(?:token|Bearer|Authorization|auth).{0,100}/gi) || [];
      if (authCtx.length > 0) {
        console.log('  Auth context:');
        [...new Set(authCtx)].slice(0, 5).forEach(c => console.log('   ', c.trim().substring(0, 200)));
      }

      // Buscar endpoints con parámetros de placa en la URL
      const fetchCalls = code.match(/(?:fetch|axios|http\.get|this\.http)\([^)]{0,300}\)/g) || [];
      const placeFetchs = fetchCalls.filter(f => f.includes('placa') || f.includes('vehiculo') || f.includes('consulta'));
      if (placeFetchs.length) {
        console.log('  HTTP calls con placa:');
        placeFetchs.slice(0, 5).forEach(c => console.log('   ', c.substring(0, 300)));
      }
    }
  }

  // ══════════════════════════════════════════════════════
  // BLOQUE 2: Probar endpoints de API directo en SUNARP
  // ══════════════════════════════════════════════════════
  console.log('\n\n🔍 SUNARP consultavehicular — Endpoints directos\n');

  const directEndpoints = [
    `${BASE}/api/vehiculo/placa/${PLACA}`,
    `${BASE}/api/consulta/placa/${PLACA}`,
    `${BASE}/api/consulta-vehicular/placa/${PLACA}`,
    `${BASE}/api/vehiculo/${PLACA}`,
    `${BASE}/api/placa/${PLACA}`,
    `${BASE}/api/v1/vehiculo/placa/${PLACA}`,
    `${BASE}/api/v1/consulta/${PLACA}`,
    `${BASE}/consulta-vehicular/api/placa/${PLACA}`,
    `${BASE}/consulta-vehicular/api/vehiculo/${PLACA}`,
    // SUNARP tiene un servicio de interconexión
    `${BASE}/interconexion/rest/vehiculo/placa/${PLACA}`,
    `${BASE}/ws/vehiculo/placa/${PLACA}`,
    // Servicios SUNARP conocidos
    'https://api.sunarp.gob.pe/vehiculo/placa/' + PLACA,
    'https://servicios.sunarp.gob.pe/api/vehiculo/' + PLACA,
    'https://www.sunarp.gob.pe/api/vehiculo/placa/' + PLACA,
  ];

  for (const url of directEndpoints) {
    const r = await get(url, {
      headers: {
        ...HEADERS,
        'Accept': 'application/json, */*',
        'Referer': `${BASE}/consulta-vehicular/inicio`,
        'Origin': BASE,
      }
    });
    const isJson = r.headers?.['content-type']?.includes('json');
    const preview = typeof r.data === 'object'
      ? JSON.stringify(r.data).substring(0, 250)
      : (r.data || '').replace(/\n/g, ' ').substring(0, 150);
    const flag = r.status === 200 ? '✅' : r.status === 401 || r.status === 403 ? '🔑' : '❌';
    console.log(`${flag} ${url.replace(BASE, '').replace('https://','').substring(0, 65)}: ${r.status || r.error} ${isJson ? '(JSON)' : ''}`);
    if (r.status !== 404 && r.status !== 503 && r.status !== 0 && preview.length > 10) {
      console.log(`   ${preview}`);
    }
  }

  // ══════════════════════════════════════════════════════
  // BLOQUE 3: APESEG — Extraer token flow completo del JS
  // ══════════════════════════════════════════════════════
  console.log('\n\n🔍 APESEG webapp — Extrayendo flujo de autenticación\n');

  const rApesegJs = await get('https://webapp.apeseg.org.pe/consulta-soat/assets/index-DzdirK07.js');
  if (rApesegJs.status === 200 && rApesegJs.data) {
    const code = rApesegJs.data;
    console.log('JS size:', code.length, 'bytes');

    // Buscar el endpoint de login / token
    const authEndpoints = code.match(/.{0,100}(?:login|token|auth|access_token).{0,150}/gi) || [];
    console.log('\nAuth endpoints (primeros 10):');
    [...new Set(authEndpoints)].slice(0, 10).forEach(c => console.log(' ', c.trim().substring(0, 250)));

    // Buscar credenciales hardcodeadas
    const creds = code.match(/.{0,30}(?:username|password|client_id|client_secret|grant_type).{0,100}/gi) || [];
    console.log('\nPosibles credenciales:');
    [...new Set(creds)].slice(0, 10).forEach(c => console.log(' ', c.trim().substring(0, 250)));

    // Buscar el flujo completo de certificados
    const certFlow = code.match(/.{0,200}certificados.{0,200}/gi) || [];
    console.log('\nFlujo certificados (primeros 3):');
    certFlow.slice(0, 3).forEach(c => console.log(' ', c.trim().substring(0, 400)));

    // Buscar Turnstile (sitekey)
    const turnstile = code.match(/.{0,50}turnstile|sitekey.{0,100}/gi) || [];
    console.log('\nTurnstile/Sitekey:');
    [...new Set(turnstile)].slice(0, 5).forEach(c => console.log(' ', c.trim().substring(0, 200)));

    // Extraer las URLs de API completas
    const apiUrls = code.match(/https?:\/\/[^"'`\s\\]{10,200}/g) || [];
    const relevantApis = [...new Set(apiUrls.filter(u => u.includes('api') || u.includes('apeseg') || u.includes('certif')))];
    console.log('\nAPI URLs:', relevantApis);
  }
}

run().catch(console.error);
