// scripts/test-region-vercel.js
// Verifica si cambiando la región de Vercel a Sudamérica soluciona los bloqueos
// Simula peticiones desde diferentes IPs para diagnosticar el problema

const https = require('https');

function get(url, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': '*/*', ...headers },
      rejectUnauthorized: false, timeout: 10000,
    };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, size: d.length, preview: d.substring(0, 150).replace(/\n/g, ' ') }));
    });
    r.on('error', e => resolve({ error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ error: 'TIMEOUT' }); });
    r.end();
  });
}

async function run() {
  console.log('=== Diagnóstico de bloqueos por IP ===\n');
  const PLACA = 'BAB215';

  const endpoints = [
    // SAT Lima
    { name: 'SAT Lima (invitado)', url: 'https://www.sat.gob.pe/VirtualSAT/iniciolibre.aspx?uid=Invitado&valida=17&ncod=0&tipbus=XAGOb41cU78%3d&valbus=XAGOb41cU78%3d' },
    // SUNARP
    { name: 'SUNARP home', url: 'https://www.sunarp.gob.pe/' },
    { name: 'SUNARP Vehicular form', url: 'https://www.sunarp.gob.pe/seccion/servicios/post/consulta-vehicular.html' },
    // APESEG
    { name: 'APESEG API', url: `https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}` },
    { name: 'APESEG webapp', url: 'https://webapp.apeseg.org.pe/' },
    // SUTRAN (multas nacionales)
    { name: 'SUTRAN home', url: 'https://www.sutran.gob.pe' },
    { name: 'SUTRAN infracciones', url: 'https://www.sutran.gob.pe/consulta-de-infracciones/' },
    // MTC
    { name: 'Portal MTC', url: 'https://portal.mtc.gob.pe' },
  ];

  for (const ep of endpoints) {
    const r = await get(ep.url);
    const ok = r.status === 200 || r.status === 301 || r.status === 302;
    const icon = r.error ? '❌' : ok ? '✅' : '⚠️ ';
    console.log(`${icon} ${ep.name}`);
    console.log(`   → ${r.status || r.error} | ${r.preview || ''}`);
  }
}

run().catch(console.error);
