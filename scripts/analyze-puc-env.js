// scripts/analyze-puc-env.js
// Busca la configuracion de entorno (apiUrl) en el Angular bundle del PUC MTC
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    });
    r.on('error', reject); r.end();
  });
}

async function testEndpoint(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, */*' },
      rejectUnauthorized: false,
      timeout: 8000,
    };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d.substring(0, 300) }));
    });
    r.on('error', e => resolve({ error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ error: 'timeout' }); });
    r.end();
  });
}

async function run() {
  const code = (await get('https://licencias.mtc.gob.pe/main.10efc8d0e841ac5b.js')).data;
  
  // Buscar todas las cadenas con "scddstd" y "rec.mtc"
  console.log('=== Contexto scddstd.mtc.gob.pe ===');
  let idx = 0;
  while (true) {
    idx = code.indexOf('scddstd', idx);
    if (idx < 0) break;
    console.log('...', code.substring(Math.max(0, idx-50), idx+150), '...');
    idx++;
  }
  
  console.log('\n=== Contexto rec.mtc ===');
  idx = 0;
  while (true) {
    idx = code.indexOf('rec.mtc', idx);
    if (idx < 0) break;
    console.log('...', code.substring(Math.max(0, idx-50), idx+150), '...');
    idx++;
  }

  // Buscar "apiUrl" o "baseUrl" o "api_url" en el bundle
  console.log('\n=== apiUrl / baseUrl ===');
  for (const kw of ['apiUrl', 'baseUrl', 'api_url', 'base_url', 'apiBase', 'urlApi', 'urlBase']) {
    idx = code.indexOf(kw);
    if (idx >= 0) {
      console.log(`${kw}:`, code.substring(idx, idx+200));
    }
  }
  
  // Buscar "vehiculo" con contexto
  console.log('\n=== Todas las ocurrencias de "vehiculo" ===');
  idx = 0;
  let count = 0;
  while (count < 10) {
    idx = code.toLowerCase().indexOf('vehiculo', idx);
    if (idx < 0) break;
    const ctx = code.substring(Math.max(0, idx-100), idx+200);
    console.log(`[${idx}]: ${ctx}`);
    idx++;
    count++;
  }
  
  // Buscar "placa" con contexto
  console.log('\n=== Todas las ocurrencias de "placa" ===');
  idx = 0;
  count = 0;
  while (count < 10) {
    idx = code.toLowerCase().indexOf('placa', idx);
    if (idx < 0) break;
    const ctx = code.substring(Math.max(0, idx-100), idx+200);
    if (!ctx.includes('replaceAll') && !ctx.includes('placeholder')) {
      console.log(`[${idx}]: ${ctx}`);
      count++;
    }
    idx++;
  }

  // Probar endpoints directos de los dominios encontrados
  const PLACA = 'BAB215';
  console.log('\n=== Probando endpoints en scddstd.mtc.gob.pe ===');
  const endpoints = [
    `https://scddstd.mtc.gob.pe/api/vehiculo/${PLACA}`,
    `https://scddstd.mtc.gob.pe/api/v1/vehiculo/${PLACA}`,
    `https://scddstd.mtc.gob.pe/api/consulta/vehiculo?placa=${PLACA}`,
    `https://scddstd.mtc.gob.pe/api/placa/${PLACA}`,
    `https://rec.mtc.gob.pe/api/vehiculo/${PLACA}`,
    `https://rec.mtc.gob.pe/api/placa/${PLACA}`,
  ];
  for (const ep of endpoints) {
    const r = await testEndpoint(ep);
    console.log(ep.replace('https://','').substring(0,65), '->', r.status || r.error, '|', (r.data||'').substring(0,100));
  }
}

run().catch(console.error);
