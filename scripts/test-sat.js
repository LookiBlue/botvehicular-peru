// scripts/test-sat.js
// Script para descubrir endpoints reales del SAT Lima y MTC
const https = require('https');

function httpReq(hostname, path, method, body, headers) {
  return new Promise((resolve) => {
    const options = { hostname, path, method, headers, rejectUnauthorized: false };
    const r = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d, h: res.headers }));
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(body);
    r.end();
  });
}

async function run() {
  // ─── PASO 1: Sesión inicial del SAT ──────────────────────────────────────
  console.log('=== PASO 1: Página de bienvenida SAT ===');
  const r1 = await httpReq('www.sat.gob.pe', '/VirtualSAT/bienvenida.aspx', 'GET', null, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'es-PE,es;q=0.9',
  });
  console.log('Status:', r1.status);
  const setCookies = r1.h['set-cookie'] || [];
  const cookies = setCookies.map(c => c.split(';')[0]).join('; ');
  console.log('Cookies:', cookies.substring(0, 150));
  
  const html1 = r1.data || '';
  console.log('HTML size:', html1.length);
  
  // Buscar formularios
  const inputNames = [...html1.matchAll(/name="([^"]+)"/g)].map(m => m[1]).slice(0, 20);
  console.log('Input names encontrados:', inputNames);
  
  // ─── PASO 2: Consulta de multas ──────────────────────────────────────────
  console.log('\n=== PASO 2: Página MultasAdmin ===');
  const r2 = await httpReq('www.sat.gob.pe', '/VirtualSAT/modulos/MultasAdmin.aspx?mysession=&tri=', 'GET', null, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'es-PE,es;q=0.9',
    'Cookie': cookies,
  });
  console.log('Status:', r2.status);
  console.log('Location:', r2.h['location']);
  
  const html2 = r2.data || '';
  const inputNames2 = [...html2.matchAll(/name="([^"]+)"/g)].map(m => m[1]).slice(0, 20);
  console.log('Input names MultasAdmin:', inputNames2);
  console.log('HTML preview:', html2.substring(0, 500));
  
  // ─── PASO 3: Probar endpoint JSON si existe ───────────────────────────────
  console.log('\n=== PASO 3: Endpoint JSON SAT ===');
  const endpoints = [
    '/VirtualSAT/handler/MultasHandler.ashx',
    '/WebSitev8/handler/consulta.ashx',
    '/VirtualSAT/modulos/MultasAdmin.ashx',
    '/api/multas',
    '/WebSitev8/api/vehiculo',
  ];
  
  for (const ep of endpoints) {
    const r = await httpReq('www.sat.gob.pe', ep + '?placa=ABC123', 'GET', null, {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json, text/plain, */*',
      'Cookie': cookies,
    });
    console.log(`${ep} -> Status: ${r.status}, Data: ${(r.data || '').substring(0, 100)}`);
  }
}

run().catch(console.error);
