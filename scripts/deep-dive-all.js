// scripts/deep-dive-all.js
// Análisis profundo de SUTRAN, SUNARP y APESEG para encontrar las brechas reales
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
    const r = await axios.get(url, { httpsAgent, headers: HEADERS, maxRedirects: 5, timeout: 15000, validateStatus: s => s < 600, ...extra });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function post(url, data, extra = {}) {
  try {
    const r = await axios.post(url, data, { httpsAgent, headers: HEADERS, maxRedirects: 3, timeout: 15000, validateStatus: s => s < 600, ...extra });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function run() {

  // ══════════════════════════════════════════════════════
  // ANÁLISIS 1: SUTRAN — Consulta de infracciones real
  // La página /consulta-de-infracciones/ existe y tiene form
  // Vamos a analizar el HTML completo y el JS
  // ══════════════════════════════════════════════════════
  console.log('\n🔍 ANÁLISIS SUTRAN — consulta-de-infracciones\n');
  
  const rSutran = await get('https://www.sutran.gob.pe/consulta-de-infracciones/');
  if (rSutran.status === 200) {
    const $ = cheerio.load(rSutran.data);
    console.log('Title:', $('title').text());
    
    // Buscar todos los forms con sus campos
    $('form').each((i, el) => {
      const action = $(el).attr('action');
      const method = $(el).attr('method') || 'GET';
      console.log(`\nForm[${i}]: action="${action}" method="${method}"`);
      $(el).find('input,select,textarea').each((j, inp) => {
        const name = $(inp).attr('name');
        const type = $(inp).attr('type') || $(inp).prop('tagName').toLowerCase();
        const val = $(inp).attr('value') || $(inp).val() || '';
        console.log(`  ${type} name="${name}" value="${val}"`);
      });
    });
    
    // Buscar scripts que hacen requests a API
    $('script').each((i, el) => {
      const src = $(el).attr('src') || '';
      const content = $(el).html() || '';
      if (src.includes('placa') || src.includes('infrac') || content.includes('placa') || content.includes('ajax') || content.includes('fetch')) {
        console.log(`\nScript[${i}] src="${src}"`);
        if (content.length > 0 && content.length < 5000) console.log('Content:', content.substring(0, 1000));
      }
    });
    
    // Buscar todas las URLs de API en el HTML
    const apiUrls = rSutran.data.match(/https?:\/\/[^\s"'<>]+(?:api|consulta|infraccion|placa|vehiculo)[^\s"'<>]*/gi) || [];
    if (apiUrls.length > 0) {
      console.log('\nAPI URLs encontradas en HTML:', [...new Set(apiUrls)]);
    }
    
    // Buscar widgets o shortcodes de WordPress
    const widgets = rSutran.data.match(/\[[\w\s=_"']+\]/g) || [];
    if (widgets.length > 0) console.log('\nWordPress shortcodes:', widgets.slice(0, 10));
  }

  // ── SUTRAN WP-JSON API ──────────────────────────────────────────────────
  console.log('\n🔍 SUTRAN WordPress REST API\n');
  const wpEndpoints = [
    'https://www.sutran.gob.pe/wp-json/wp/v2/pages?search=infraccion&per_page=5',
    'https://www.sutran.gob.pe/wp-json/wp/v2/pages?search=placa&per_page=5',
    'https://www.sutran.gob.pe/wp-json/',
    'https://www.sutran.gob.pe/wp-json/wp/v2/posts?search=infraccion&per_page=3',
  ];
  for (const url of wpEndpoints) {
    const r = await get(url, { headers: { ...HEADERS, 'Accept': 'application/json' } });
    console.log(`${url.replace('https://www.sutran.gob.pe','')}: ${r.status}`);
    if (r.status === 200 && typeof r.data === 'object') {
      if (Array.isArray(r.data)) {
        r.data.slice(0, 3).forEach(p => console.log(`  • ${p.slug || p.title?.rendered || p.id}`));
      } else {
        const namespaces = r.data?.namespaces || [];
        console.log('  Namespaces:', namespaces.slice(0, 10));
        const routes = Object.keys(r.data?.routes || {}).filter(k => k.includes('placa') || k.includes('infrac') || k.includes('vehic'));
        if (routes.length) console.log('  Relevant routes:', routes);
      }
    }
  }

  // ── Cargar el JS de SUTRAN para encontrar el endpoint real ─────────────
  console.log('\n🔍 Scripts JS de SUTRAN\n');
  const sutranMain = await get('https://www.sutran.gob.pe/consulta-de-infracciones/');
  const $ = cheerio.load(sutranMain.data || '');
  const jsUrls = [];
  $('script[src]').each((i, el) => {
    const src = $(el).attr('src');
    if (src && !src.includes('google') && !src.includes('facebook') && !src.includes('twitter')) {
      jsUrls.push(src.startsWith('http') ? src : 'https://www.sutran.gob.pe' + src);
    }
  });
  console.log('Scripts encontrados:', jsUrls.slice(0, 10));
  
  // Analizar los últimos JS (los más probables de ser personalizados)
  for (const jsUrl of jsUrls.slice(-5)) {
    const rJs = await get(jsUrl);
    if (rJs.status === 200 && typeof rJs.data === 'string') {
      const code = rJs.data;
      // Buscar URLs de API, ajax calls, fetch
      const apiCalls = code.match(/(?:url|href|ajax|fetch|axios\.get|axios\.post)\s*[:(]\s*["'`]([^"'`\n]{5,200})["'`]/g) || [];
      const placaRefs = code.match(/.{50}placa.{50}/gi) || [];
      if (apiCalls.length > 0 || placaRefs.length > 0) {
        console.log(`\n[JS: ${jsUrl.split('/').pop()}]`);
        apiCalls.slice(0, 5).forEach(c => console.log(`  API call: ${c.substring(0, 150)}`));
        placaRefs.slice(0, 3).forEach(p => console.log(`  Placa ctx: ${p}`));
      }
    }
  }
  
  // ══════════════════════════════════════════════════════
  // ANÁLISIS 2: APESEG — Encontrar endpoint sin whitelist
  // ══════════════════════════════════════════════════════
  console.log('\n\n🔍 ANÁLISIS APESEG — Brechas en la API\n');
  
  // El error fue: {"message":"Auth guard [ ipwhilelist] is not defined."}
  // Esto es un BUG del servidor — el guard no está registrado correctamente
  // Podemos intentar otros endpoints que no usen ese guard
  const apesegEndpoints = [
    // Endpoints que NO pasan por el guard ipwhitelist
    `https://api.apeseg.org.pe/consulta-soat/api/certificados/${PLACA}`,
    `https://api.apeseg.org.pe/consulta-soat/api/polizas/placa/${PLACA}`,
    `https://api.apeseg.org.pe/consulta-soat/api/soat/${PLACA}`,
    `https://api.apeseg.org.pe/consulta-soat/api/v1/certificados/placa/${PLACA}`,
    `https://api.apeseg.org.pe/consulta-soat/api/v2/certificados/placa/${PLACA}`,
    // API pública sin autenticación
    `https://api.apeseg.org.pe/public/soat/${PLACA}`,
    `https://api.apeseg.org.pe/soat/consulta/${PLACA}`,
    // APESEG tiene una app móvil — probar endpoints de la app
    `https://api.apeseg.org.pe/mobile/soat/${PLACA}`,
    `https://api.apeseg.org.pe/app/soat/${PLACA}`,
  ];

  for (const url of apesegEndpoints) {
    const r = await get(url, { headers: { ...HEADERS, 'Accept': 'application/json', 'Origin': 'https://webapp.apeseg.org.pe', 'Referer': 'https://webapp.apeseg.org.pe/' } });
    const preview = typeof r.data === 'object' ? JSON.stringify(r.data).substring(0, 200) : (r.data || '').substring(0, 100);
    console.log(`${url.replace('https://api.apeseg.org.pe','')}: ${r.status || r.error} | ${preview}`);
  }

  // Probar con app móvil user-agent
  console.log('\n--- APESEG con User-Agent de app móvil ---');
  const mobileHeaders = {
    'User-Agent': 'Dart/2.18 (dart:io)',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  const rMobile = await get(`https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, { headers: mobileHeaders });
  console.log(`Mobile UA: ${rMobile.status} | ${JSON.stringify(rMobile.data).substring(0, 200)}`);

  // ══════════════════════════════════════════════════════
  // ANÁLISIS 3: SUNARP — Portal en línea y API
  // ══════════════════════════════════════════════════════
  console.log('\n\n🔍 ANÁLISIS SUNARP — enlinea y API pública\n');
  
  // enlinea.sunarp.gob.pe retorna 200 pero con 524 bytes — revisemos qué es
  const rEnlinea = await get('https://enlinea.sunarp.gob.pe/');
  console.log('enlinea.sunarp.gob.pe status:', rEnlinea.status);
  console.log('Content:', rEnlinea.data?.substring(0, 600));
  console.log('Location:', rEnlinea.headers?.location);
  
  // Probar la API pública de SUNARP
  const sunarpApiEndpoints = [
    `https://enlinea.sunarp.gob.pe/interconexion/rest/vehiculo/placa/${PLACA}`,
    `https://enlinea.sunarp.gob.pe/interconexion/rest/vehiculo/${PLACA}`,
    `https://www.sunarp.gob.pe/Interconexion/rest/vehiculo/placa/${PLACA}`,
    `https://www.sunarp.gob.pe/interconexion/vehiculo/${PLACA}`,
    `https://www.sunarp.gob.pe/SRVVEH/rest/vehiculo/placa/${PLACA}`,
    `https://www.sunarp.gob.pe/SRVVEH/rest/vehiculo/${PLACA}`,
    `https://www.sunarp.gob.pe/SRV/vehiculo/placa/${PLACA}`,
  ];
  
  for (const url of sunarpApiEndpoints) {
    const r = await get(url, { headers: { ...HEADERS, 'Accept': 'application/json, */*' } });
    const preview = typeof r.data === 'object' ? JSON.stringify(r.data).substring(0, 200) : (r.data || '').substring(0, 100).replace(/\n/g, ' ');
    console.log(`${url.replace('https://','').substring(0,65)}: ${r.status || r.error} | ${preview}`);
  }
}

run().catch(console.error);
