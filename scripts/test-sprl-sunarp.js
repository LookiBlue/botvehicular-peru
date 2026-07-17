// scripts/test-sprl-sunarp.js
// Investiga sprl.sunarp.gob.pe (sistema IBM) y record de infracciones SUTRAN
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
};
const PLACA = 'CKR477';

async function get(url, extra = {}) {
  try {
    const r = await axios.get(url, { httpsAgent, headers: { ...HEADERS, ...extra.headers }, maxRedirects: 5, timeout: 15000, validateStatus: s => s < 600, ...extra });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function post(url, body, extra = {}) {
  try {
    const r = await axios.post(url, body, { httpsAgent, headers: { ...HEADERS, ...extra.headers }, maxRedirects: 3, timeout: 15000, validateStatus: s => s < 600, ...extra });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function run() {
  // ══════════════════════════════════════════════
  // BLOQUE 1: sprl.sunarp.gob.pe — IBM Portal
  // ══════════════════════════════════════════════
  console.log('🔍 SUNARP — Portal IBM sprl.sunarp.gob.pe\n');
  
  const jar = {};
  const ck = () => Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
  const mergeCk = (h) => (h?.['set-cookie'] || []).forEach(c => {
    const eq=c.indexOf('='), semi=c.indexOf(';');
    if(eq>0) jar[c.substring(0,eq).trim()]=(semi>eq?c.substring(eq+1,semi):c.substring(eq+1)).trim();
  });

  // Cargar el portal
  const r1 = await get('https://sprl.sunarp.gob.pe/sprl/ingreso');
  mergeCk(r1.headers);
  console.log('sprl/ingreso status:', r1.status, '| size:', r1.data?.length);
  
  if (r1.status === 200 && r1.data) {
    const $ = cheerio.load(r1.data);
    console.log('Title:', $('title').text());
    const has_captcha = r1.data.toLowerCase().includes('captcha');
    console.log('Tiene captcha:', has_captcha);
    
    // Buscar formularios
    $('form').each((i, el) => {
      const action = $(el).attr('action') || '';
      const method = $(el).attr('method') || 'GET';
      console.log(`\nForm[${i}]: action="${action}" method="${method}"`);
      $(el).find('input,select').each((j, inp) => {
        console.log(`  ${$(inp).attr('name')||'?'}: type=${$(inp).attr('type')||'text'} val="${$(inp).val()||''}"`);
      });
    });
    
    // Buscar endpoints de API en scripts inline
    $('script:not([src])').each((i, el) => {
      const t = $(el).html() || '';
      if (t.includes('ajax') || t.includes('fetch') || t.includes('placa') || t.includes('vehiculo') || t.includes('/api/') || t.includes('rest')) {
        console.log(`\nScript[${i}] (inline):`, t.substring(0, 800));
      }
    });
    
    // Buscar links de consulta vehicular
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const txt = $(el).text().trim();
      if (href.toLowerCase().includes('vehic') || href.toLowerCase().includes('placa') || txt.toLowerCase().includes('vehic')) {
        console.log(`Link: "${txt}" → ${href}`);
      }
    });
  }
  
  // Probar consulta directa en SPRL sin login
  console.log('\n--- Endpoints SPRL sin login ---');
  const sprlEndpoints = [
    `https://sprl.sunarp.gob.pe/sprl/vehiculo/placa/${PLACA}`,
    `https://sprl.sunarp.gob.pe/sprl/vehiculo/${PLACA}`,
    `https://sprl.sunarp.gob.pe/sprl/consulta/vehiculo?placa=${PLACA}`,
    `https://sprl.sunarp.gob.pe/sprl/rest/vehiculo/placa/${PLACA}`,
    `https://sprl.sunarp.gob.pe/sprl/api/vehiculo/${PLACA}`,
  ];
  for (const url of sprlEndpoints) {
    const r = await get(url, { headers: { Accept: 'application/json, */*', Cookie: ck() } });
    const preview = typeof r.data === 'object' ? JSON.stringify(r.data).substring(0,200) : (r.data||'').substring(0,120).replace(/\n/g,' ');
    console.log(`${url.replace('https://sprl.sunarp.gob.pe','')} → ${r.status || r.error} | ${preview}`);
  }

  // ══════════════════════════════════════════════
  // BLOQUE 2: SUTRAN — record-de-infracciones
  // URL encontrada: http://www.sutran.gob.pe/consultas/record-de-infracciones/
  // ══════════════════════════════════════════════
  console.log('\n\n🔍 SUTRAN — record de infracciones (URL antigua HTTP)\n');
  
  const sutranUrls = [
    'http://www.sutran.gob.pe/consultas/record-de-infracciones/record-de-infracciones/',
    'http://www.sutran.gob.pe/consultas/record-de-infracciones/',
    'http://www.sutran.gob.pe/consultas/',
    'https://www.sutran.gob.pe/consultas/record-de-infracciones/',
    // Portal antiguo de infracciones
    'http://fiscalizacion.sutran.gob.pe/',
    'https://fiscalizacion.sutran.gob.pe/',
    'http://infracciones.sutran.gob.pe/',
  ];
  
  for (const url of sutranUrls) {
    const r = await get(url);
    const has_form = typeof r.data === 'string' && r.data.includes('<form');
    const has_captcha = typeof r.data === 'string' && r.data.toLowerCase().includes('captcha');
    console.log(`${url.replace('http://www.sutran.gob.pe','').replace('https://www.sutran.gob.pe','')} → ${r.status || r.error} | form:${has_form} captcha:${has_captcha} size:${r.data?.length || 0}`);
    if (r.status === 200 && has_form) {
      const $ = cheerio.load(r.data);
      $('form').each((i, el) => {
        const action = $(el).attr('action');
        console.log(`  Form action: "${action}"`);
        $(el).find('input[name]').each((j, inp) => {
          console.log(`    ${$(inp).attr('name')}: ${$(inp).attr('type')} = "${$(inp).val() || ''}"`);
        });
      });
      // Scripts inline con lógica
      $('script:not([src])').each((i, el) => {
        const t = $(el).html() || '';
        if (t.includes('placa') || t.includes('infraccion') || t.includes('ajax')) {
          console.log(`  Script:`, t.substring(0, 500));
        }
      });
    }
  }
  
  // ══════════════════════════════════════════════
  // BLOQUE 3: gob.pe — Infracción SUTRAN (link encontrado: 46479-verifica-tu-infraccion)
  // ══════════════════════════════════════════════
  console.log('\n\n🔍 GOB.PE — verifica-tu-infraccion SUTRAN\n');
  
  const rGob = await get('https://www.gob.pe/46479-verifica-tu-infraccion');
  console.log('Status:', rGob.status, '| size:', rGob.data?.length);
  if (rGob.status === 200 && rGob.data) {
    const $ = cheerio.load(rGob.data);
    console.log('Title:', $('title').text().trim());
    // Buscar iframe o embed de formulario
    $('iframe,embed,object').each((i, el) => {
      console.log(`Frame[${i}]:`, $(el).attr('src') || $(el).attr('data'));
    });
    // Buscar links de consulta
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('sutran') || href.includes('infraccion') || href.includes('consulta')) {
        console.log(`Link: ${$(el).text().trim()} → ${href}`);
      }
    });
    // Texto con URLs de portales
    const urls = rGob.data.match(/https?:\/\/[^\s"'<>]+/g) || [];
    const relevant = [...new Set(urls.filter(u => u.includes('sutran') || u.includes('infraccion') || u.includes('multa')))];
    if (relevant.length) console.log('URLs relevantes en página:', relevant);
  }
}

run().catch(console.error);
