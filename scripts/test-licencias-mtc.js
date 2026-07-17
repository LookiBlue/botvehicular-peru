// scripts/test-licencias-mtc.js
const https = require('https');

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': '*/*', ...headers },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: d }));
    });
    r.on('error', reject); r.end();
  });
}

async function run() {
  // Probar portal de licencias MTC
  const r = await get('https://licencias.mtc.gob.pe/');
  console.log('licencias.mtc.gob.pe Status:', r.status);
  console.log('Location:', r.headers.location);
  console.log('HTML size:', r.data.length);
  console.log('HTML preview:\n', r.data.substring(0, 800));
  
  // Buscar inputs
  const inputNames = r.data.match(/name="([^"]+)"/g) || [];
  console.log('Inputs:', inputNames.slice(0, 15));
  
  // Buscar scripts
  const scriptSrcs = r.data.match(/src="([^"]+\.js[^"]*)"/g) || [];
  console.log('Scripts:', scriptSrcs.slice(0, 10));
  
  // Probar endpoint de vehiculos en licencias
  const PLACA = 'BAB215';
  const vehiculoEndpoints = [
    `https://licencias.mtc.gob.pe/api/vehiculo/${PLACA}`,
    `https://licencias.mtc.gob.pe/consulta/vehiculo?placa=${PLACA}`,
    `https://licencias.mtc.gob.pe/Vehiculo/Consulta?placa=${PLACA}`,
  ];
  
  console.log('\n=== Probando endpoints vehiculares ===');
  for (const ep of vehiculoEndpoints) {
    try {
      const r2 = await get(ep, { 'Accept': 'application/json, text/html' });
      console.log(ep.replace('https://licencias.mtc.gob.pe', ''), '->', r2.status, '|', r2.data.substring(0, 100));
    } catch(e) {
      console.log(ep.replace('https://licencias.mtc.gob.pe', ''), '-> ERR:', e.message);
    }
  }
}

run().catch(console.error);
