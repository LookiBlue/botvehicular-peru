// scripts/test-webapp-apeseg.js
// BRECHA CONFIRMADA: webapp.apeseg.org.pe/consulta-soat/?source=apeseg
// Este es el frontend Angular/React de APESEG — analizamos sus llamadas a la API
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const HEADERS_CHROME = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
};
const PLACA = 'CKR477';

async function get(url, extra = {}) {
  try {
    const r = await axios.get(url, { httpsAgent, headers: { ...HEADERS_CHROME, ...extra.headers }, maxRedirects: 5, timeout: 15000, validateStatus: s => s < 600, ...extra });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function run() {
  const jar = {};
  const ck = () => Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
  const mergeCk = (h) => (h?.['set-cookie'] || []).forEach(c => {
    const eq=c.indexOf('='), semi=c.indexOf(';');
    if(eq>0) jar[c.substring(0,eq).trim()]=(semi>eq?c.substring(eq+1,semi):c.substring(eq+1)).trim();
  });

  // ══════════════════════════════════════════════════════
  // ANÁLISIS: webapp.apeseg.org.pe/consulta-soat/
  // ══════════════════════════════════════════════════════
  console.log('🔍 webapp.apeseg.org.pe — Análisis completo\n');
  
  const r1 = await get('https://webapp.apeseg.org.pe/consulta-soat/?source=apeseg');
  mergeCk(r1.headers);
  console.log('Status:', r1.status, '| size:', r1.data?.length);
  console.log('Content-Type:', r1.headers?.['content-type']);
  
  if (r1.status === 200 && r1.data) {
    const $ = cheerio.load(r1.data);
    console.log('Title:', $('title').text().trim());
    
    // Es un SPA — buscar el JS principal
    const jsFiles = [];
    $('script[src]').each((i, el) => {
      const src = $(el).attr('src') || '';
      jsFiles.push(src.startsWith('http') ? src : 'https://webapp.apeseg.org.pe' + src);
    });
    console.log('\nJS files:', jsFiles.slice(0, 10));
    
    // Buscar configuración inline
    $('script:not([src])').each((i, el) => {
      const t = $(el).html() || '';
      if (t.length > 10) {
        console.log(`\nScript inline[${i}]:`, t.substring(0, 500));
      }
    });
    
    // Buscar meta tags
    $('meta').each((i, el) => {
      const name = $(el).attr('name') || $(el).attr('property') || '';
      const content = $(el).attr('content') || '';
      if (name && content && !name.includes('viewport') && !name.includes('og:')) {
        console.log(`Meta: ${name} = ${content.substring(0, 100)}`);
      }
    });
    
    // Buscar base href
    console.log('Base href:', $('base').attr('href'));
    
    // Analizar el JS principal para encontrar endpoints de la API
    console.log('\n--- Analizando JS del webapp ---');
    for (const jsUrl of jsFiles.slice(0, 5)) {
      const rJs = await get(jsUrl);
      if (rJs.status === 200 && typeof rJs.data === 'string') {
        const code = rJs.data;
        
        // Buscar URLs de API
        const apiEndpoints = code.match(/["'`](\/[a-z][^"'`\s]{3,100})["'`]/g) || [];
        const relevant = [...new Set(apiEndpoints.map(u => u.replace(/["'`]/g, '')).filter(u =>
          u.includes('api') || u.includes('placa') || u.includes('soat') ||
          u.includes('certif') || u.includes('consulta') || u.includes('vehic')
        ))];
        
        // Buscar URLs absolutas
        const absUrls = code.match(/https?:\/\/[^"'`\s]{10,200}/g) || [];
        const absRelev = [...new Set(absUrls.filter(u => u.includes('api') || u.includes('soat') || u.includes('certif')))];
        
        // Buscar tokens, API keys hardcodeados
        const apiKeys = code.match(/(?:apiKey|api_key|token|secret|Bearer|Authorization)['":\s]+([A-Za-z0-9_\-\.]{20,100})/g) || [];
        
        // Buscar environment config
        const envConfig = code.match(/environment[^{]*\{[^}]{0,500}\}/g) || [];
        
        if (relevant.length || absRelev.length || apiKeys.length || envConfig.length || code.includes('placa')) {
          const jsName = jsUrl.split('/').pop();
          console.log(`\n[${jsName}] (${code.length} bytes)`);
          if (relevant.length) console.log('  API paths:', relevant.slice(0, 15));
          if (absRelev.length) console.log('  API URLs:', absRelev.slice(0, 10));
          if (apiKeys.length) console.log('  API Keys/Tokens:', apiKeys.slice(0, 5));
          if (envConfig.length) console.log('  Config:', envConfig[0]?.substring(0, 300));
          
          // Buscar patrón de llamadas con placa
          const placaCtx = code.match(/.{0,80}placa.{0,80}/gi) || [];
          if (placaCtx.length > 0) {
            console.log('  Placa context (primeros 5):');
            [...new Set(placaCtx)].slice(0, 5).forEach(c => console.log('   ', c.trim()));
          }
        }
      }
    }
  }
  
  // ══════════════════════════════════════════════════════
  // PROBAR ENDPOINTS CON DIFERENTES ORÍGENES
  // El error era "ipwhilelist" — quizas si venimos de webapp.apeseg.org.pe pase
  // ══════════════════════════════════════════════════════
  console.log('\n\n🔍 APESEG API con Origin correcto\n');
  
  const origins = [
    'https://webapp.apeseg.org.pe',
    'https://www.apeseg.org.pe',
    'https://apeseg.org.pe',
    'https://consulta-soat.apeseg.org.pe',
  ];
  
  for (const origin of origins) {
    const r = await get(`https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, {
      headers: {
        'Accept': 'application/json',
        'Origin': origin,
        'Referer': origin + '/consulta-soat/',
        'User-Agent': HEADERS_CHROME['User-Agent'],
        Cookie: ck(),
      }
    });
    const preview = typeof r.data === 'object' ? JSON.stringify(r.data).substring(0, 200) : (r.data || '').substring(0, 100);
    console.log(`  Origin: ${origin} → ${r.status} | ${preview}`);
  }
}

run().catch(console.error);
