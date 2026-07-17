// scripts/test-apeseg-real.js
// Prueba la API real de APESEG para consultar SOAT
// Endpoint confirmado: https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/{placa}
const https = require('https');
const cheerio = require('cheerio');

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0',
        'Accept': '*/*',
        'Accept-Language': 'es-PE,es;q=0.9',
        ...headers,
      },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: d }));
    });
    r.on('error', reject);
    r.end();
  });
}

async function run() {
  const PLACA = 'BAB215';
  
  // ── TEST 1: Webapp principal de APESEG ────────────────────────────────────
  console.log('=== TEST 1: webapp.apeseg.org.pe ===');
  const r1 = await httpGet('https://webapp.apeseg.org.pe/consulta-soat', {
    'Accept': 'text/html',
    'Origin': 'https://webapp.apeseg.org.pe',
    'Referer': 'https://webapp.apeseg.org.pe/',
  });
  console.log('Status:', r1.status, '| Size:', r1.data.length);
  
  if (r1.status === 200) {
    const $ = cheerio.load(r1.data);
    // Buscar script tags con endpoints
    $('script[src]').each((i, el) => console.log('  Script:', $(el).attr('src')));
    // Buscar metadatos de la app
    const appData = r1.data.match(/apiUrl['":\s]+['"]([^'"]+)['"]/g);
    console.log('API URLs encontradas:', appData);
  }
  
  // ── TEST 2: API directa sin token ─────────────────────────────────────────
  console.log('\n=== TEST 2: API sin token ===');
  const r2 = await httpGet(`https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, {
    'Accept': 'application/json',
    'Origin': 'https://webapp.apeseg.org.pe',
    'Referer': 'https://webapp.apeseg.org.pe/',
    'X-Source': 'apeseg',
  });
  console.log('Status:', r2.status, '| Data:', r2.data.substring(0, 300));
  
  // ── TEST 3: API con variantes de endpoint ─────────────────────────────────
  console.log('\n=== TEST 3: Otros endpoints APESEG ===');
  const endpoints = [
    `https://api.apeseg.org.pe/consulta-soat/api/soat/placa/${PLACA}`,
    `https://api.apeseg.org.pe/consulta-soat/api/vehiculo/${PLACA}`,
    `https://api.apeseg.org.pe/api/soat?placa=${PLACA}`,
    `https://webapp.apeseg.org.pe/api/soat?placa=${PLACA}`,
  ];
  
  for (const ep of endpoints) {
    const r = await httpGet(ep, {
      'Accept': 'application/json',
      'Origin': 'https://webapp.apeseg.org.pe',
      'Referer': 'https://webapp.apeseg.org.pe/',
    });
    console.log(`${ep.replace('https://','').substring(0,60)} -> ${r.status} | ${r.data.substring(0,100)}`);
  }
  
  // ── TEST 4: Obtener token de la webapp ────────────────────────────────────
  console.log('\n=== TEST 4: Intentar obtener token desde webapp ===');
  // Probar login anonimo
  const loginEndpoints = [
    'https://api.apeseg.org.pe/consulta-soat/api/auth/login',
    'https://api.apeseg.org.pe/consulta-soat/api/token',
    'https://api.apeseg.org.pe/consulta-soat/oauth/token',
  ];
  
  for (const ep of loginEndpoints) {
    const urlObj = new URL(ep);
    const loginResult = await new Promise(resolve => {
      const body = JSON.stringify({ username: 'guest', password: 'guest' });
      const opts = {
        hostname: urlObj.hostname, path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://webapp.apeseg.org.pe',
          'User-Agent': 'Mozilla/5.0',
        },
        rejectUnauthorized: false,
      };
      const r = https.request(opts, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, data: d.substring(0, 200) }));
      });
      r.on('error', e => resolve({ error: e.message }));
      r.write(body);
      r.end();
    });
    console.log(`POST ${ep.replace('https://','').substring(0,50)} -> ${loginResult.status} | ${loginResult.data || loginResult.error}`);
  }
  
  // ── TEST 5: Consulta web del APESEG (scraping HTML) ───────────────────────
  console.log('\n=== TEST 5: Web APESEG consulta HTML ===');
  const apesegWeb = await httpGet('https://www.apeseg.org.pe/index.php/consulta-soat/', {
    'Accept': 'text/html',
  });
  console.log('Status:', apesegWeb.status, '| Size:', apesegWeb.data.length);
  if (apesegWeb.status === 200) {
    const $ = cheerio.load(apesegWeb.data);
    const inputs = $('input, select, form').map((i, el) => `${el.name}[name=${$(el).attr('name')||''}]`).get();
    console.log('Inputs:', inputs.slice(0, 10));
    const scripts = $('script[src]').map((i, el) => $(el).attr('src')).get();
    console.log('Scripts externos:', scripts);
    // Buscar endpoints en inline scripts
    const inline = [];
    $('script:not([src])').each((i, el) => {
      const t = $(el).text();
      if (t.includes('ajax') || t.includes('fetch') || t.includes('api')) {
        inline.push(t.substring(0, 400));
      }
    });
    console.log('Scripts inline con API:', inline);
  }
}

run().catch(console.error);
