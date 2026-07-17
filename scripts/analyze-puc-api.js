// scripts/analyze-puc-api.js
// Analiza el main.js del Portal Único del Conductor para encontrar endpoints API
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

async function run() {
  // Descargar el main.js
  const mainJs = await get('https://licencias.mtc.gob.pe/main.10efc8d0e841ac5b.js');
  console.log('main.js size:', mainJs.data.length);
  
  const code = mainJs.data;
  
  // Buscar URLs de API en el código minificado
  // Patrón: strings que parecen paths de API
  const apiPatterns = [
    /["'](\/api\/[^"']{3,100})["']/g,
    /["'](https?:\/\/[^"']{5,100}\/api\/[^"']{3,100})["']/g,
    /["'](https?:\/\/[a-z0-9.-]+\.mtc\.gob\.pe[^"']{3,100})["']/g,
    /["'](\/[a-z]+\/[a-z]+\/[^"']{3,60})["']/g,
  ];
  
  const found = new Set();
  apiPatterns.forEach(pattern => {
    for (const m of code.matchAll(pattern)) {
      const url = m[1];
      if (!url.includes('.css') && !url.includes('.png') && !url.includes('.ico') && !url.includes('.js')) {
        found.add(url);
      }
    }
  });
  
  console.log('\n=== URLs de API encontradas ===');
  [...found].sort().forEach(u => console.log(' ', u));
  
  // Buscar dominios de backend API
  const domains = new Set();
  for (const m of code.matchAll(/["'](https?:\/\/([a-z0-9.-]+\.(?:gob\.pe|mtc|pe))[^"']{0,50})["']/g)) {
    const domain = m[2];
    domains.add(domain);
    if (m[1].length < 100) found.add(m[1]);
  }
  
  console.log('\n=== Dominios de backend encontrados ===');
  [...domains].forEach(d => console.log(' ', d));
  
  // Buscar "vehiculo", "placa" en el código
  const matches = [];
  const placaIdx = code.toLowerCase().indexOf('placa');
  if (placaIdx >= 0) {
    console.log('\n=== Contexto "placa" en main.js ===');
    console.log(code.substring(Math.max(0, placaIdx - 200), placaIdx + 500));
  }
  
  const vehiculoIdx = code.toLowerCase().indexOf('vehiculo');
  if (vehiculoIdx >= 0 && vehiculoIdx !== placaIdx) {
    console.log('\n=== Contexto "vehiculo" en main.js ===');
    console.log(code.substring(Math.max(0, vehiculoIdx - 100), vehiculoIdx + 500));
  }
  
  // También buscar environment URLs
  const envMatch = code.match(/environment.*?({[^}]{50,500}})/);
  if (envMatch) {
    console.log('\n=== Environment config ===');
    console.log(envMatch[0].substring(0, 500));
  }
}

run().catch(console.error);
