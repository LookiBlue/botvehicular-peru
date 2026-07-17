// scripts/probe-sunarp-cv.js
// Prueba el portal consultavehicular.sunarp.gob.pe para encontrar el endpoint de consulta
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const BASE = 'https://consultavehicular.sunarp.gob.pe';
const PLACA = 'CKR477';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Referer': BASE + '/consulta-vehicular/inicio',
  'Origin': BASE,
};

async function get(url, extra = {}) {
  try {
    const r = await axios.get(url, { httpsAgent, headers: { ...HEADERS, ...extra.headers }, maxRedirects: 5, timeout: 15000, validateStatus: s => s < 600, ...extra });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function run() {
  console.log('=== SUNARP consultavehicular — Análisis de endpoints ===\n');

  // 1. Cargar la app para obtener cookies y el HTML
  const r0 = await get(BASE + '/consulta-vehicular/inicio', { headers: { 'User-Agent': HEADERS['User-Agent'], 'Accept': 'text/html,*/*' } });
  const cookies = (r0.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  console.log('Status inicial:', r0.status, '| size:', r0.data?.length);
  console.log('Cookies:', cookies);

  if (r0.status === 200 && r0.data) {
    const $ = cheerio.load(r0.data);
    console.log('Title:', $('title').text());
    console.log('Base href:', $('base').attr('href'));

    // Extraer JS bundles
    const jsSrcs = [];
    $('script[src]').each((i, el) => {
      const src = $(el).attr('src') || '';
      jsSrcs.push(src.startsWith('http') ? src : BASE + src);
    });
    console.log('\nJS bundles:', jsSrcs);

    // Analizar cada JS para encontrar endpoints
    for (const jsUrl of jsSrcs) {
      const rJs = await get(jsUrl, { headers: { 'User-Agent': HEADERS['User-Agent'], Cookie: cookies } });
      if (rJs.status !== 200 || !rJs.data) continue;
      
      const code = rJs.data;
      const jsName = jsUrl.split('/').pop().split('?')[0];
      
      // Buscar paths de API
      const apiPaths = [];
      const matches = code.matchAll(/["'`](\/(api|rest|v[0-9]|ws|consulta|vehiculo|sunarp)[^"'`\s\\]{2,100})["'`]/g);
      for (const m of matches) apiPaths.push(m[1]);
      
      // Buscar URLs absolutas
      const absUrls = [];
      const absMatches = code.matchAll(/https?:\/\/[^"'`\s\\]{10,200}/g);
      for (const m of absMatches) {
        const u = m[0];
        if (u.includes('sunarp') || u.includes('gob.pe') || u.includes('api') || u.includes('vehiculo')) {
          absUrls.push(u);
        }
      }
      
      // Buscar httpClient calls (Angular)
      const httpCalls = [];
      const httpMatches = code.matchAll(/this\.[a-z]+\.(?:get|post|put)\([`'"](\/[^`'"]+)[`'"]/g);
      for (const m of httpMatches) httpCalls.push(m[1]);
      
      const placaCtx = [];
      const placaMatches = code.matchAll(/.{0,100}placa.{0,100}/gi);
      for (const m of placaMatches) placaCtx.push(m[0].trim());
      
      if (apiPaths.length || absUrls.length || httpCalls.length || placaCtx.length) {
        console.log(`\n[${jsName}] ${code.length} bytes`);
        if (apiPaths.length) console.log('  API paths:', [...new Set(apiPaths)].slice(0, 20));
        if (absUrls.length) console.log('  Abs URLs:', [...new Set(absUrls)].slice(0, 15));
        if (httpCalls.length) console.log('  HTTP calls:', [...new Set(httpCalls)].slice(0, 10));
        if (placaCtx.length) {
          console.log('  Placa context:');
          [...new Set(placaCtx)].slice(0, 6).forEach(c => console.log('   ', c.substring(0, 200)));
        }
      }
    }
  }

  // 2. Probar endpoints REST directamente
  console.log('\n\n=== Probe de endpoints ===\n');
  const endpoints = [
    '/api/placa/' + PLACA,
    '/api/vehiculo/placa/' + PLACA,
    '/api/consulta/' + PLACA,
    '/api/consulta/vehiculo/' + PLACA,
    '/v1/placa/' + PLACA,
    '/v1/vehiculo/' + PLACA,
    '/rest/vehiculo/placa/' + PLACA,
    '/rest/consulta/placa/' + PLACA,
    '/SRVLIBRE/rest/vehiculo/placa/' + PLACA,
    '/RRPP/rest/vehiculo/placa/' + PLACA,
    '/backend/api/placa/' + PLACA,
    '/api/sunarp/vehiculo/' + PLACA,
  ];

  for (const path of endpoints) {
    const r = await get(BASE + path, { headers: { ...HEADERS, Cookie: cookies } });
    const isJson = (r.headers?.['content-type'] || '').includes('json');
    if (r.status !== 0 && r.status !== 404) {
      const preview = isJson ? JSON.stringify(r.data).substring(0, 200) : (r.data || '').substring(0, 60).replace(/\n/g, ' ');
      const flag = r.status === 200 ? '✅' : r.status === 401 || r.status === 403 ? '🔑' : '❌';
      console.log(flag, path, ':', r.status, isJson ? '(JSON)' : '', preview);
    } else {
      console.log('  ', path, ':', r.status || r.error);
    }
  }

  // 3. También probar APESEG con las nuevas credenciales
  console.log('\n\n=== TEST APESEG con credenciales del bundle ===\n');
  
  // Primero login
  const loginResp = await axios.post('https://api.apeseg.org.pe/consulta-soat/api/login', {
    email: 'notificaciones@apeseg.org.pe',
    password: 'G3sepa13579!'
  }, {
    httpsAgent,
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://webapp.apeseg.org.pe', 'User-Agent': HEADERS['User-Agent'] },
    timeout: 15000,
    validateStatus: s => s < 600
  }).catch(e => ({ status: 0, data: { error: e.message } }));

  console.log('Login status:', loginResp.status);
  console.log('Login response:', JSON.stringify(loginResp.data).substring(0, 300));

  if (loginResp.data?.access_token) {
    const token = loginResp.data.access_token;
    console.log('\n✅ TOKEN OBTENIDO:', token.substring(0, 50) + '...');
    
    // Consultar con el token
    const certResp = await axios.get(`https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, {
      httpsAgent,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Origin': 'https://webapp.apeseg.org.pe',
        'User-Agent': HEADERS['User-Agent'],
      },
      timeout: 15000,
      validateStatus: s => s < 600
    }).catch(e => ({ status: 0, data: { error: e.message } }));
    
    console.log('\nCertificados status:', certResp.status);
    console.log('Certificados response:', JSON.stringify(certResp.data).substring(0, 500));

    // Logout
    await axios.post('https://api.apeseg.org.pe/consulta-soat/api/logout', {}, {
      httpsAgent,
      headers: { 'Authorization': 'Bearer ' + token },
      timeout: 5000,
      validateStatus: s => s < 600
    }).catch(() => {});
    console.log('\nLogout completado');
  }
}

run().catch(console.error);
