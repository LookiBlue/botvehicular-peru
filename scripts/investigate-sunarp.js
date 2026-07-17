// scripts/investigate-sunarp.js
// Investiga SUNARP a fondo: endpoints, captcha, sesiones, formularios
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
};

async function get(url, extra = {}) {
  try {
    const r = await axios.get(url, { httpsAgent, headers: HEADERS, maxRedirects: 5, timeout: 12000, validateStatus: s => s < 600, ...extra });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message }; }
}

async function post(url, data, extra = {}) {
  try {
    const r = await axios.post(url, data, { httpsAgent, headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }, maxRedirects: 3, timeout: 12000, validateStatus: s => s < 600, ...extra });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message }; }
}

const PLACA = 'CKR477';

async function run() {
  console.log('=========================================');
  console.log('  INVESTIGACIÓN SUNARP — BRECHA CAPTCHA');
  console.log('=========================================\n');

  // ── TEST 1: SUNARP ConsultaVehicular JSP ──────────────────────────────────
  console.log('--- TEST 1: ConsultaVehicular JSP ---');
  const urls = [
    `https://www.sunarp.gob.pe/ConsultaVehicular/index.jsp`,
    `https://www.sunarp.gob.pe/ConsultaVehicular/`,
    `https://www.sunarp.gob.pe/ConsultaVehicular/buscarVehiculo.jsp?placa=${PLACA}`,
    `https://www.sunarp.gob.pe/ConsultaVehicular/obtenerDatosVehiculo.jsp?placa=${PLACA}`,
    `https://enlinea.sunarp.gob.pe/`,
    `https://enlinea.sunarp.gob.pe/ConsultaVehicular/`,
    `https://www.sunarp.gob.pe/index.asp`,
  ];
  for (const url of urls) {
    const r = await get(url);
    const has_captcha = typeof r.data === 'string' && (r.data.toLowerCase().includes('captcha') || r.data.toLowerCase().includes('recaptcha'));
    const has_form = typeof r.data === 'string' && r.data.includes('<form');
    const $ = cheerio.load(r.data || '');
    const title = $('title').text().trim().substring(0, 50);
    console.log(`  ${url.replace('https://','').substring(0,60)}`);
    console.log(`    → ${r.status || r.error} | title:"${title}" | captcha:${has_captcha} | form:${has_form} | size:${r.data?.length || 0}`);
    
    if (r.status === 200 && has_form) {
      $('form').each((i, el) => {
        console.log(`    FORM[${i}] action:"${$(el).attr('action')}" method:"${$(el).attr('method')}"`);
        $(el).find('input[name],select[name]').each((j, inp) => {
          console.log(`      INPUT: name="${$(inp).attr('name')}" type="${$(inp).attr('type')}" value="${$(inp).attr('value') || ''}"`);
        });
      });
    }
    if (r.status === 200 && !has_form) {
      // Buscar links de consulta
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const txt = $(el).text().trim();
        if (href.toLowerCase().includes('vehicul') || href.toLowerCase().includes('placa') || txt.toLowerCase().includes('vehicul')) {
          console.log(`    LINK: "${txt}" → ${href}`);
        }
      });
    }
  }

  // ── TEST 2: APESEG — Probar con cookies de sesión web ─────────────────────
  console.log('\n--- TEST 2: APESEG sesión web ---');
  const apesegJar = {};
  const mergeApeseg = (headers) => {
    (headers?.['set-cookie'] || []).forEach(c => {
      const eq = c.indexOf('='), semi = c.indexOf(';');
      if (eq > 0) apesegJar[c.substring(0, eq).trim()] = (semi > eq ? c.substring(eq + 1, semi) : c.substring(eq + 1)).trim();
    });
  };

  // Probar diferentes URLs de APESEG
  const apesegUrls = [
    'https://www.apeseg.org.pe/index.php/consulta-soat/',
    'https://www.apeseg.org.pe/consulta-soat/',
    'https://soat.apeseg.org.pe/',
    'https://consultasoat.apeseg.org.pe/',
    'https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/' + PLACA,
  ];
  for (const url of apesegUrls) {
    const r = await get(url, { headers: { ...HEADERS, Cookie: Object.entries(apesegJar).map(([k,v])=>`${k}=${v}`).join('; ') } });
    mergeApeseg(r.headers || {});
    const has_captcha = typeof r.data === 'string' && r.data.toLowerCase().includes('captcha');
    const $ = cheerio.load(r.data || '');
    console.log(`  ${url.replace('https://','').substring(0,65)} → ${r.status || r.error} | captcha:${has_captcha} | size:${r.data?.length || 0}`);
    if (r.status === 200 && r.data?.includes('<form')) {
      $('form').each((i, el) => {
        console.log(`    FORM action:"${$(el).attr('action')}"`);
        $(el).find('input[name]').each((j, inp) => console.log(`      ${$(inp).attr('name')}=${$(inp).attr('value')||''}`));
      });
    }
    if (r.status === 200 && typeof r.data === 'object') {
      console.log(`    JSON:`, JSON.stringify(r.data).substring(0, 200));
    }
    // Scripts que mencionan api
    if (typeof r.data === 'string') {
      const scripts = r.data.match(/https?:\/\/[^"'<>\s]+\/api\/[^"'<>\s]+/g) || [];
      scripts.forEach(s => console.log(`    API en HTML: ${s}`));
    }
  }
  
  // ── TEST 3: SUTRAN — Buscar endpoint sin captcha ───────────────────────────
  console.log('\n--- TEST 3: SUTRAN endpoints ---');
  const sutranUrls = [
    `https://www.sutran.gob.pe/`,
    `https://www.sutran.gob.pe/consulta-de-infracciones/`,
    `https://infracciones.sutran.gob.pe/`,
    `https://www.sutran.gob.pe/wp-json/wp/v2/pages`,
    `https://servicios.sutran.gob.pe/`,
    `https://portal.sutran.gob.pe/`,
  ];
  for (const url of sutranUrls) {
    const r = await get(url);
    const has_captcha = typeof r.data === 'string' && r.data.toLowerCase().includes('captcha');
    const has_form = typeof r.data === 'string' && r.data.includes('<form');
    const $ = cheerio.load(r.data || '');
    console.log(`  ${url.replace('https://','').substring(0,65)} → ${r.status || r.error} | captcha:${has_captcha} | form:${has_form}`);
    if (has_form) {
      $('form').each((i, el) => {
        const action = $(el).attr('action') || '';
        if (action) console.log(`    FORM action:"${action}"`);
        $(el).find('input[name]').slice(0,5).each((j, inp) => console.log(`      ${$(inp).attr('name')}=${$(inp).attr('value')||''}`));
      });
    }
  }
  
  // ── TEST 4: SUNARP enlinea ─────────────────────────────────────────────────
  console.log('\n--- TEST 4: SUNARP en linea / servicios ---');
  const sunarpAlt = [
    `https://www.sunarp.gob.pe/SRVLIBRE/rest/vehiculo/placa/${PLACA}`,
    `https://www.sunarp.gob.pe/SRVLIBRE/rest/vehiculo/${PLACA}`,
    `https://www.sunarp.gob.pe/seccion/servicios`,
    `https://www.sunarp.gob.pe/SECCION/servicios`,
    `https://www.sunarp.gob.pe/SRVLIBRE/`,
    `https://www.sunarp.gob.pe/EstudiosPublicos/`,
  ];
  for (const url of sunarpAlt) {
    const r = await get(url, { headers: { ...HEADERS, 'Accept': 'application/json,text/html,*/*' } });
    console.log(`  ${url.replace('https://','').substring(0,65)} → ${r.status || r.error} | size:${r.data?.length || 0}`);
    if (r.status === 200 && typeof r.data === 'object') console.log(`    JSON:`, JSON.stringify(r.data).substring(0,300));
    if (r.status === 200 && typeof r.data === 'string' && r.data.length < 1000) console.log(`    HTML:`, r.data.substring(0,300));
  }
}

run().catch(console.error);
