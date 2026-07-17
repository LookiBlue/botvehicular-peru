// scripts/test-mtc-placa.js
// Busca endpoints MTC para consulta por placa vehicular
const https = require('https');
const cheerio = require('cheerio');

function get(url, headers = {}, jar = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const ck = Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0', 'Accept': '*/*', 'Accept-Language': 'es-PE,es;q=0.9', 'Cookie': ck, ...headers },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        (res.headers['set-cookie'] || []).forEach(c => { const eq=c.indexOf('='),semi=c.indexOf(';'); if(eq>0) jar[c.substring(0,eq).trim()]=(semi>eq?c.substring(eq+1,semi):c.substring(eq+1)).trim(); });
        resolve({ status: res.statusCode, headers: res.headers, data: d });
      });
    });
    r.on('error', reject); r.end();
  });
}

async function run() {
  const PLACA = 'BAB215';
  
  // ── TEST: Portal MTC Vehiculos ─────────────────────────────────────────────
  console.log('=== TEST: portal.mtc.gob.pe ===');
  const endpoints = [
    `https://portal.mtc.gob.pe/consultasvehiculos/`,
    `https://portal.mtc.gob.pe/transportes/accesopublico/ConsultaPlacaVehiculo.aspx?nroplaca=${PLACA}`,
    `https://portal.mtc.gob.pe/consultasvehiculos/default.aspx`,
    `https://www.mtc.gob.pe/transportes/accesopublico/ConsultaVehiculo.aspx`,
  ];
  
  for (const ep of endpoints) {
    try {
      const r = await get(ep);
      const loc = r.headers['location'] || '';
      const preview = r.data.substring(0,100).replace(/\n/g,' ');
      console.log(`${ep.replace('https://','').substring(0,65)} -> ${r.status}${loc?' -> '+loc:''} | ${preview}`);
      
      if (r.status === 200 && r.data.length > 1000) {
        const $ = cheerio.load(r.data);
        console.log('  Title:', $('title').text().trim().substring(0,60));
        const inputs = $('input[name]').map((i,el) => $(el).attr('name')).get();
        if (inputs.length) console.log('  Inputs:', inputs.slice(0,10));
      }
    } catch(e) { console.log(`${ep.replace('https://','').substring(0,65)} -> ERR: ${e.message}`); }
  }
  
  // ── TEST: Consulta SOAT/MTC por placa con la web de APESEG ─────────────────
  console.log('\n=== TEST: apeseg.org.pe ===');
  const jar = {};
  try {
    const r1 = await get('https://www.apeseg.org.pe/index.php/consulta-soat/', {}, jar);
    console.log('APESEG web Status:', r1.status, '| Size:', r1.data.length);
    if (r1.status === 200 && r1.data.length > 100) {
      const $ = cheerio.load(r1.data);
      console.log('Title:', $('title').text());
      $('form').each((i,el) => console.log(`  Form action: ${$(el).attr('action')} method: ${$(el).attr('method')}`));
      $('input[name]').each((i,el) => console.log(`  Input: ${$(el).attr('name')} type=${$(el).attr('type')} value=${$(el).attr('value')||''}`));
      $('script:not([src])').each((i,el) => {
        const t = $(el).text();
        if (t.includes('ajax') || t.includes('fetch') || t.includes('placa') || t.includes('soat')) {
          console.log(`  Script inline ${i}:`, t.substring(0,600));
        }
      });
    }
  } catch(e) { console.log('APESEG Error:', e.message); }
  
  // ── TEST: Buscar endpoint del formulario APESEG consultando directo ─────────
  console.log('\n=== TEST: APESEG Consulta directa ===');
  try {
    // Cargar la pagina y enviar formulario
    const r2 = await get('https://www.apeseg.org.pe/', {}, jar);
    console.log('APESEG home Status:', r2.status, '| Location:', r2.headers.location);
  } catch(e) { console.log('Error:', e.message); }
  
  // ── TEST: Probar endpoint SUNARP gob.pe real ──────────────────────────────
  console.log('\n=== TEST: SUNARP gob.pe Vehicular consulta ===');
  const sunarpJar = {};
  try {
    const r3 = await get('https://www.sunarp.gob.pe/', {}, sunarpJar);
    console.log('SUNARP home Status:', r3.status, '| Size:', r3.data.length, '| Loc:', r3.headers.location);
  } catch(e) { console.log('SUNARP Error:', e.message); }
  
  // Buscar formulario de consulta en SUNARP
  try {
    const r4 = await get('https://www.sunarp.gob.pe/seccion/servicios', {}, sunarpJar);
    console.log('SUNARP servicios Status:', r4.status, '| Size:', r4.data.length);
    if (r4.status === 200) {
      const $ = cheerio.load(r4.data);
      // Buscar links de consulta vehicular
      $('a[href]').each((i,el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (href.includes('vehicul') || text.toLowerCase().includes('vehicul') || href.includes('placa')) {
          console.log(`  Link: ${text} -> ${href}`);
        }
      });
    }
  } catch(e) { console.log('SUNARP servicios Error:', e.message); }
}

run().catch(console.error);
