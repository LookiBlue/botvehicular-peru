// scripts/test-mtc-real.js
// Prueba endpoints reales del MTC para consulta vehicular
const https = require('https');
const cheerio = require('cheerio');

function httpGet(url, headers = {}, cookieJar = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const cookieStr = Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'es-PE,es;q=0.9',
        'Cookie': cookieStr,
        ...headers,
      },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const sc = res.headers['set-cookie'] || [];
        (Array.isArray(sc) ? sc : [sc]).forEach(c => {
          const eq = c.indexOf('='), semi = c.indexOf(';');
          if (eq > 0) cookieJar[c.substring(0,eq).trim()] = (semi>eq?c.substring(eq+1,semi):c.substring(eq+1)).trim();
        });
        resolve({ status: res.statusCode, headers: res.headers, data: d });
      });
    });
    r.on('error', reject);
    r.end();
  });
}

function httpPost(url, body, headers = {}, cookieJar = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const cookieStr = Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        'Content-Type': 'application/json',
        'Cookie': cookieStr,
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
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

async function run() {
  const PLACA = 'BAB215';
  
  // ── TEST 1: Record Conductor MTC ──────────────────────────────────────────
  console.log('=== TEST 1: Record Conductor MTC ===');
  const cookieRC = {};
  const r1 = await httpGet('https://recordconductor.mtc.gob.pe/', {}, cookieRC);
  console.log('Status:', r1.status, '| Size:', r1.data.length);
  
  const $ = cheerio.load(r1.data);
  const forms = [];
  $('form').each((i, el) => forms.push({ action: $(el).attr('action'), inputs: $('input', el).map((j, inp) => $(inp).attr('name')).get() }));
  console.log('Formularios:', JSON.stringify(forms).substring(0, 400));
  
  // ── TEST 2: Portal MTC consulta publica ───────────────────────────────────
  console.log('\n=== TEST 2: Portal MTC endpoints ===');
  const mtcEndpoints = [
    `https://recordconductor.mtc.gob.pe/api/vehiculos/consulta/${PLACA}`,
    `https://recordconductor.mtc.gob.pe/consulta-vehicular?placa=${PLACA}`,
    `https://portal.mtc.gob.pe/transportes/accesopublico/ConsultaVehiculo?placa=${PLACA}`,
    `https://www.sutran.gob.pe/informacion/empresa/?placa=${PLACA}`,
    `https://fiscalizacion.sutran.gob.pe/api/vehiculo/${PLACA}`,
  ];
  
  for (const ep of mtcEndpoints) {
    try {
      const r = await httpGet(ep, { 'Accept': 'application/json, text/html, */*' });
      const preview = r.data.substring(0, 150).replace(/\n/g, ' ');
      console.log(`${ep.replace('https://','').substring(0,55)} -> ${r.status} | ${preview}`);
    } catch(e) {
      console.log(`${ep.replace('https://','').substring(0,55)} -> ERROR: ${e.message}`);
    }
  }
  
  // ── TEST 3: MTC consulta AJAX desde la pagina recordconductor ─────────────
  console.log('\n=== TEST 3: Analizar JS recordconductor ===');
  const $2 = cheerio.load(r1.data);
  $2('script[src]').each((i, el) => console.log('  Script:', $2(el).attr('src')));
  
  // Buscar en scripts inline
  $2('script:not([src])').each((i, el) => {
    const t = $2(el).text();
    if (t.includes('ajax') || t.includes('fetch') || t.includes('url') || t.includes('api')) {
      console.log(`Script inline ${i}:`, t.substring(0, 600));
    }
  });
  
  // ── TEST 4: MTC API moderna ───────────────────────────────────────────────
  console.log('\n=== TEST 4: MTC API moderna ===');
  const mtcApiEndpoints = [
    { url: `https://recordconductor.mtc.gob.pe/api/v1/vehiculo/${PLACA}`, method: 'GET' },
    { url: `https://recordconductor.mtc.gob.pe/rest/vehiculo`, method: 'POST', body: { placa: PLACA } },
    { url: 'https://recordconductor.mtc.gob.pe/api/consulta', method: 'POST', body: { placa: PLACA } },
  ];
  
  for (const ep of mtcApiEndpoints) {
    try {
      let r;
      if (ep.method === 'POST') {
        r = await httpPost(ep.url, ep.body, { 'Accept': 'application/json' }, cookieRC);
      } else {
        r = await httpGet(ep.url, { 'Accept': 'application/json' }, cookieRC);
      }
      console.log(`${ep.method} ${ep.url.replace('https://','').substring(0,55)} -> ${r.status} | ${r.data.substring(0, 200)}`);
    } catch(e) {
      console.log(`${ep.url.replace('https://','').substring(0,55)} -> ERROR: ${e.message}`);
    }
  }
  
  // ── TEST 5: Servicio SUNARP público ──────────────────────────────────────
  console.log('\n=== TEST 5: SUNARP consulta vehicular ===');
  const sunarpEndpoints = [
    `https://www.sunarp.gob.pe/SRVS/default.aspx?placa=${PLACA}`,
    `https://servicios.sunarp.gob.pe/restSunarp/rest/api/vehicular/consulta?placa=${PLACA}`,
    `https://www.sunarp.gob.pe/api/vehicular/${PLACA}`,
  ];
  
  for (const ep of sunarpEndpoints) {
    try {
      const r = await httpGet(ep, { 'Accept': 'application/json, text/html, */*' });
      console.log(`${ep.replace('https://','').substring(0,60)} -> ${r.status} | ${r.data.substring(0, 150)}`);
    } catch(e) {
      console.log(`${ep.replace('https://','').substring(0,60)} -> ERROR: ${e.message}`);
    }
  }
}

run().catch(console.error);
