// scripts/test-soat-pe.js
// Analiza soat.com.pe — portal que usa APESEG data sin API directa
// Descubierto en: dimequetienesseguro.com que tiene el script de abrirventana()
// URL: https://www.soat.com.pe/data/index.php?buscar=PLACA&captcha=XXXX
// Si podemos obtener el captcha como imagen y leerlo (es simple/texto), ¡brecha encontrada!
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
};
const PLACA = 'CKR477';

async function get(url, extra = {}) {
  try {
    const r = await axios.get(url, { httpsAgent, headers: { ...HEADERS, ...extra.headers }, maxRedirects: 5, timeout: 15000, validateStatus: s => s < 600, responseType: extra.binary ? 'arraybuffer' : 'text', ...extra });
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
  // ANÁLISIS 1: soat.com.pe — el portal que usan todos
  // ══════════════════════════════════════════════════════
  console.log('🔍 soat.com.pe — Portal principal SOAT\n');
  
  const r1 = await get('https://www.soat.com.pe/');
  mergeCk(r1.headers);
  console.log('Status:', r1.status, '| size:', r1.data?.length);
  
  if (r1.status === 200) {
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
      const name = $(el).attr('name') || '';
      console.log(`Form[${i}] name="${name}" action="${action}" method="${method}"`);
      $(el).find('input,select').each((j, inp) => {
        console.log(`  ${$(inp).attr('type')||'?'} name="${$(inp).attr('name')}" val="${$(inp).val()||''}"`);
      });
    });
    
    // Buscar imagen de captcha
    $('img').each((i, el) => {
      const src = $(el).attr('src') || '';
      if (src.includes('captcha') || src.includes('codigo') || src.includes('imagen')) {
        console.log('Captcha img:', src);
      }
    });
    
    // Scripts
    $('script:not([src])').each((i, el) => {
      const t = $(el).html() || '';
      if ((t.includes('captcha') || t.includes('buscar') || t.includes('soat') || t.includes('placa')) && t.length > 50 && t.length < 5000) {
        console.log(`Script[${i}]:`, t.substring(0, 1000));
      }
    });
  }

  // Probar el endpoint data/index.php directamente
  console.log('\n--- Probando data/index.php sin captcha ---');
  
  // Intento 1: sin captcha
  const tests = [
    { url: `https://www.soat.com.pe/data/index.php?buscar=${PLACA}&captcha=`, desc: 'Sin captcha' },
    { url: `https://www.soat.com.pe/data/index.php?buscar=${PLACA}&captcha=1234`, desc: 'Captcha falso' },
    { url: `https://www.soat.com.pe/data/index.php?buscar=${PLACA}`, desc: 'Sin param captcha' },
    { url: `https://www.soat.com.pe/data/index.php`, desc: 'POST buscar', method: 'POST', body: `buscar=${PLACA}&captcha=1234` },
    // Probar API directa de soat.com.pe
    { url: `https://www.soat.com.pe/api/soat/${PLACA}`, desc: 'API directa' },
    { url: `https://www.soat.com.pe/api/consulta/${PLACA}`, desc: 'API consulta' },
    { url: `https://www.soat.com.pe/consulta/${PLACA}`, desc: 'consulta directa' },
  ];
  
  for (const t of tests) {
    let r;
    if (t.method === 'POST') {
      r = await post(t.url, t.body, { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck(), Referer: 'https://www.soat.com.pe/', Accept: 'application/json, text/html, */*' });
    } else {
      r = await get(t.url, { headers: { Cookie: ck(), Referer: 'https://www.soat.com.pe/', Accept: 'application/json, text/html, */*' } });
    }
    const has_placa = (r.data || '').toUpperCase().includes(PLACA);
    const preview = typeof r.data === 'object' ? JSON.stringify(r.data).substring(0, 200) : (r.data || '').replace(/\n/g,' ').substring(0, 200);
    console.log(`  [${t.desc}]: ${r.status || r.error} | placa_en_resp:${has_placa} | ${preview}`);
  }
  
  // Descargar la imagen del captcha y verla
  console.log('\n--- Captcha imagen de soat.com.pe ---');
  const rCaptcha = await get('https://www.soat.com.pe/data/captcha.php', { headers: { Cookie: ck(), Referer: 'https://www.soat.com.pe/' }, binary: true });
  console.log('Captcha status:', rCaptcha.status, '| Content-Type:', rCaptcha.headers?.['content-type'], '| size:', rCaptcha.data?.length || 0);
  
  if (rCaptcha.status === 200 && rCaptcha.data) {
    // Guardar la imagen del captcha para inspeccionarla
    const imgPath = 'scripts/captcha_soat.png';
    fs.writeFileSync(imgPath, Buffer.from(rCaptcha.data));
    console.log('Captcha guardado en:', imgPath);
    console.log('¡Abre esa imagen para ver qué tipo de captcha es!');
  }
  
  // ══════════════════════════════════════════════════════
  // ANÁLISIS 2: APESEG main page con formulario real
  // ══════════════════════════════════════════════════════
  console.log('\n\n🔍 APESEG /consultas-soat/ — análisis completo\n');
  
  const rApeseg = await get('https://www.apeseg.org.pe/consultas-soat/');
  mergeCk(rApeseg.headers);
  console.log('Status:', rApeseg.status, '| size:', rApeseg.data?.length);
  if (rApeseg.status === 200 && rApeseg.data) {
    const $a = cheerio.load(rApeseg.data);
    console.log('Title:', $a('title').text().trim().substring(0, 80));
    
    const has_recaptcha = rApeseg.data.includes('recaptcha') || rApeseg.data.includes('g-recaptcha');
    const has_img_captcha = rApeseg.data.toLowerCase().includes('captcha') && !has_recaptcha;
    console.log('reCAPTCHA:', has_recaptcha, '| Image captcha:', has_img_captcha);
    
    $a('form').each((i, el) => {
      const action = $a(el).attr('action') || '';
      if (!action.includes('buscador')) {
        console.log(`Form[${i}] action="${action}" method="${$a(el).attr('method')||'GET'}"`);
        $a(el).find('input,select').each((j, inp) => {
          console.log(`  ${$a(inp).attr('name')}: ${$a(inp).attr('type')} = "${$a(inp).val()||''}"`);
        });
      }
    });
    
    // Scripts con lógica
    $a('script:not([src])').each((i, el) => {
      const t = $a(el).html() || '';
      if ((t.includes('placa') || t.includes('soat') || t.includes('api') || t.includes('ajax') || t.includes('fetch')) && t.length > 50 && t.length < 10000) {
        console.log(`\nScript inline[${i}]:`, t.substring(0, 2000));
      }
    });
    
    // API URLs
    const apiUrls = rApeseg.data.match(/["'`](https?:\/\/[^"'`\s]{10,200})["'`]/g) || [];
    const relevant = [...new Set(apiUrls.map(u => u.replace(/["'`]/g, '')).filter(u => u.includes('api') || u.includes('soat') || u.includes('placa') || u.includes('certif')))];
    if (relevant.length) console.log('\nAPI URLs:', relevant.slice(0, 10));
    
    // Buscar scripts externos custom
    $a('script[src]').each((i, el) => {
      const src = $a(el).attr('src') || '';
      if (!src.includes('jquery') && !src.includes('google') && !src.includes('facebook') && !src.includes('wp-') && src.length > 5) {
        console.log('Script externo:', src);
      }
    });
  }
}

run().catch(console.error);
