// scripts/test-apeseg-form.js
// Analiza el formulario web de APESEG consultas-soat (sin API, scraping HTML directo)
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
    const r = await axios.get(url, { httpsAgent, headers: { ...HEADERS, ...extra.headers }, maxRedirects: 5, timeout: 15000, validateStatus: s => s < 600 });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function post(url, body, headers = {}) {
  try {
    const r = await axios.post(url, body, { httpsAgent, headers: { ...HEADERS, ...headers }, maxRedirects: 3, timeout: 15000, validateStatus: s => s < 600 });
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
  // BLOQUE 1: APESEG /consultas-soat/ — Formulario real
  // ══════════════════════════════════════════════════════
  console.log('🔍 APESEG — /consultas-soat/ formulario web\n');
  
  const r1 = await get('https://www.apeseg.org.pe/consultas-soat/');
  mergeCk(r1.headers);
  console.log('Status:', r1.status, '| size:', r1.data?.length);
  
  if (r1.status === 200 && r1.data) {
    const $ = cheerio.load(r1.data);
    console.log('Title:', $('title').text().trim());
    
    // Captcha?
    const has_recaptcha = r1.data.includes('recaptcha') || r1.data.includes('g-recaptcha');
    const has_img_captcha = r1.data.toLowerCase().includes('captcha') && !has_recaptcha;
    console.log('reCAPTCHA:', has_recaptcha, '| Image captcha:', has_img_captcha);
    
    // Buscar forms
    $('form').each((i, el) => {
      const action = $(el).attr('action') || '';
      const method = $(el).attr('method') || 'GET';
      console.log(`\nForm[${i}]: action="${action}" method="${method}"`);
      $(el).find('input,select,textarea').each((j, inp) => {
        const name = $(inp).attr('name') || '';
        const val = $(inp).val() || $(inp).attr('value') || '';
        const type = $(inp).attr('type') || $(inp).prop('tagName').toLowerCase();
        console.log(`  ${type} name="${name}" value="${val.substring(0, 80)}"`);
      });
    });
    
    // Scripts con lógica de consulta
    $('script:not([src])').each((i, el) => {
      const t = $(el).html() || '';
      if ((t.includes('placa') || t.includes('soat') || t.includes('ajax') || t.includes('fetch') || t.includes('api')) && t.length > 50 && t.length < 10000) {
        console.log(`\nScript inline[${i}]:`, t.substring(0, 1500));
      }
    });
    
    // Scripts externos relevantes
    $('script[src]').each((i, el) => {
      const src = $(el).attr('src') || '';
      if (src.includes('consulta') || src.includes('soat') || src.includes('placa') || src.includes('custom') || src.includes('app')) {
        console.log('Script externo:', src);
      }
    });
    
    // Buscar iframes (puede ser que tenga el formulario en un iframe)
    $('iframe').each((i, el) => {
      console.log(`iframe[${i}]:`, $(el).attr('src'));
    });
    
    // Buscar URLs de API en el código fuente
    const apiUrls = r1.data.match(/https?:\/\/[^\s"'<>]+(?:api|soat|consulta|placa|certificado)[^\s"'<>]*/gi) || [];
    if (apiUrls.length > 0) console.log('\nAPI URLs:', [...new Set(apiUrls)].slice(0, 15));
  }
  
  // También probar con URL alternativa
  console.log('\n--- Otras URLs de APESEG ---');
  const apesegAlts = [
    'https://www.apeseg.org.pe/consulta-soat/',
    'https://www.dimequetienesseguro.com/consulta-soat/',
    'https://www.dimequetienesseguro.com/',
  ];
  for (const url of apesegAlts) {
    const r = await get(url, { headers: { ...HEADERS, Cookie: ck() } });
    mergeCk(r.headers);
    const has_captcha = r.data?.toLowerCase().includes('captcha') || false;
    const has_form = r.data?.includes('<form') || false;
    const $ = cheerio.load(r.data || '');
    console.log(`\n${url}: ${r.status} | captcha:${has_captcha} form:${has_form}`);
    console.log('Title:', $('title').text().trim());
    if (has_form) {
      $('form').each((i, el) => {
        const action = $(el).attr('action') || '';
        console.log(`  Form action: "${action}"`);
        $(el).find('input[name]').each((j, inp) => {
          console.log(`    ${$(inp).attr('name')}: ${$(inp).attr('type')} = "${$(inp).val()||''}`);
        });
      });
      // Scripts inline
      $('script:not([src])').each((i, el) => {
        const t = $(el).html() || '';
        if ((t.includes('placa') || t.includes('soat') || t.includes('api')) && t.length < 5000) {
          console.log(`  Script:`, t.substring(0, 800));
        }
      });
    }
  }
  
  // ══════════════════════════════════════════════════════
  // BLOQUE 2: dimequetienesseguro.com — App de APESEG
  // ══════════════════════════════════════════════════════
  console.log('\n\n🔍 dimequetienesseguro.com — Consulta SOAT\n');
  
  const rDique = await get(`https://www.dimequetienesseguro.com/consulta-soat/?placa=${PLACA}`);
  console.log('Status:', rDique.status, '| size:', rDique.data?.length);
  if (rDique.status === 200 && rDique.data) {
    const $ = cheerio.load(rDique.data);
    console.log('Title:', $('title').text().trim());
    const has_captcha = rDique.data.toLowerCase().includes('captcha');
    console.log('Captcha:', has_captcha);
    
    // Buscar datos del SOAT en el resultado
    const placa_en_res = rDique.data.toUpperCase().includes(PLACA);
    console.log('Placa en resultado:', placa_en_res);
    
    // Scripts con API calls
    $('script:not([src])').each((i, el) => {
      const t = $(el).html() || '';
      if ((t.includes('placa') || t.includes('soat') || t.includes('api') || t.includes('ajax')) && t.length > 50 && t.length < 8000) {
        console.log(`Script[${i}]:`, t.substring(0, 1200));
      }
    });
    
    // Verificar si hay datos del SOAT en la respuesta
    const soatData = rDique.data.match(/(?:SOAT|poliza|certificado|vencimiento|aseguradora)[^<]{0,200}/gi) || [];
    if (soatData.length > 0) {
      console.log('\nDatos SOAT encontrados:');
      soatData.slice(0, 5).forEach(d => console.log(' ', d.trim().substring(0, 150)));
    }
    
    // Buscar API endpoints en el HTML
    const apiUrls = rDique.data.match(/https?:\/\/[^\s"'<>]+(?:api|soat|placa|certif)[^\s"'<>]*/gi) || [];
    if (apiUrls.length) console.log('\nAPI URLs:', [...new Set(apiUrls)].slice(0, 10));
  }
}

run().catch(console.error);
