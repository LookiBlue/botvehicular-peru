// scripts/probe-licencias-api.js
// Prueba endpoints de API del Portal Unico del Conductor (licencias.mtc.gob.pe)
// api_url = "/" → los endpoints son relativos a https://licencias.mtc.gob.pe/
const https = require('https');

function get(url, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json, */*', 'Accept-Language': 'es-PE,es', ...headers },
      rejectUnauthorized: false, timeout: 8000,
    };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: d }));
    });
    r.on('error', e => resolve({ error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ error: 'TIMEOUT' }); });
    r.end();
  });
}

const BASE = 'https://licencias.mtc.gob.pe';
const PLACA = 'BAB215';

async function run() {
  // Endpoints comunes en Angular apps peruanas gubernamentales
  const endpoints = [
    `/api/vehiculo/${PLACA}`,
    `/api/vehiculos/placa/${PLACA}`,
    `/api/consulta/placa/${PLACA}`,
    `/api/v1/vehiculo/${PLACA}`,
    `/api/v1/consulta/vehiculo?placa=${PLACA}`,
    `/vehiculo/consultar?placa=${PLACA}`,
    `/consulta/vehiculo/${PLACA}`,
    `/api/conductor/vehiculo/${PLACA}`,
    `/api/certificado/${PLACA}`,
    // Endpoints de licencias
    `/api/licencia/consultar?documento=BAB215`,
    `/api/brevete/consultar?dni=BAB215`,
    // Endpoints del scddstd (firma digital)
    `/api/firma/${PLACA}`,
    `/api/documento/${PLACA}`,
    // Probar con prefijos de la API
    `/puc/api/vehiculo/${PLACA}`,
    `/rest/vehiculo/${PLACA}`,
    `/services/vehiculo/${PLACA}`,
  ];
  
  console.log(`=== Probando ${endpoints.length} endpoints en ${BASE} ===\n`);
  
  for (const ep of endpoints) {
    const url = BASE + ep;
    const r = await get(url);
    const status = r.status || `ERR(${r.error})`;
    const preview = (r.data || '').substring(0, 100).replace(/\n/g, ' ');
    
    // Solo mostrar los interesantes (no 404, no Error HTML)
    if (r.status !== 404 && r.status !== undefined) {
      console.log(`✅ ${ep}`);
      console.log(`   Status: ${status} | Data: ${preview}`);
    } else if (r.error) {
      // No mostrar errores de red comunes
    } else {
      // 404 - mostrar brevemente
      process.stdout.write(`❌ ${ep} -> 404\n`);
    }
  }
  
  // Probar el runtime.js para ver el env completo
  console.log('\n=== runtime.js del PUC ===');
  const runtime = await get('https://licencias.mtc.gob.pe/runtime.c4fb5a013c79eeea.js');
  console.log('Size:', runtime.data?.length);
  // Buscar apiUrl en runtime
  const apiMatch = runtime.data?.match(/"apiUrl"\s*:\s*"([^"]+)"/);
  const envMatch = runtime.data?.match(/environment[^{]*({[^}]{50,500}})/);
  console.log('apiUrl:', apiMatch ? apiMatch[1] : 'NO ENCONTRADO');
  if (envMatch) console.log('environment:', envMatch[0].substring(0, 300));
  
  // Ver el contenido del runtime completo (puede tener la config)
  if (runtime.data && runtime.data.length < 10000) {
    console.log('\nRuntime.js content:\n', runtime.data.substring(0, 3000));
  }
}

run().catch(console.error);
