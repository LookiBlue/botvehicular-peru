// scripts/analyze-sunarp-js-fixed.js
// Los JS bundles de consultavehicular.sunarp.gob.pe tienen URL malformada en el HTML
// La URL correcta es: BASE + '/' + filename (con slash)
// Extraemos el API endpoint del JS y también buscamos el backend real

const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const BASE = 'https://consultavehicular.sunarp.gob.pe';
const PLACA = 'CKR477';

async function get(url, extra = {}) {
  try {
    const r = await axios.get(url, { httpsAgent, headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126', 'Accept': '*/*', ...(extra.headers || {}) }, maxRedirects: 5, timeout: 20000, validateStatus: s => s < 600, ...extra });
    return r;
  } catch (e) { return { status: 0, data: '', error: e.message, headers: {} }; }
}

async function run() {
  console.log('=== SUNARP consultavehicular JS Analysis ===\n');

  // Cargar el app shell
  const r0 = await get(BASE + '/consulta-vehicular/inicio');
  const $ = cheerio.load(r0.data || '');
  
  // Extraer correctamente los JS — el HTML tiene href sin slash inicial
  const jsSrcs = [];
  $('script[src]').each((i, el) => {
    const src = $(el).attr('src') || '';
    if (src.startsWith('http')) {
      jsSrcs.push(src);
    } else if (src.startsWith('/')) {
      jsSrcs.push(BASE + src);
    } else {
      // Relativo sin slash — agregar con base href
      const baseHref = $('base').attr('href') || '/consulta-vehicular/';
      jsSrcs.push(BASE + baseHref + src);
    }
  });
  
  console.log('JS bundles (corregidos):', jsSrcs);

  for (const jsUrl of jsSrcs) {
    console.log('\n--- Analizando:', jsUrl, '---');
    const rJs = await get(jsUrl);
    console.log('Status:', rJs.status, '| Size:', rJs.data?.length);
    
    if (rJs.status !== 200 || !rJs.data) continue;
    const code = rJs.data;

    // Buscar todos los paths de API usando iterador en vez de regex global
    const foundPaths = new Set();
    const pathRe = /["'`](\/[a-z][a-z0-9/_\-]{3,120})["'`]/g;
    let m;
    while ((m = pathRe.exec(code)) !== null) {
      const p = m[1];
      if (p.includes('/api/') || p.includes('/rest/') || p.includes('/v1/') || 
          p.includes('vehiculo') || p.includes('placa') || p.includes('consulta') ||
          p.includes('sunarp') || p.includes('propietario')) {
        foundPaths.add(p);
      }
    }
    if (foundPaths.size) console.log('API paths:', [...foundPaths].slice(0, 20));

    // Buscar URLs absolutas
    const absRe = /https?:\/\/[^\s"'`\\]{10,200}/g;
    const absUrls = new Set();
    while ((m = absRe.exec(code)) !== null) {
      const u = m[0];
      if (u.includes('sunarp') || u.includes('gob.pe') || u.includes('api') || u.includes('backend')) {
        absUrls.add(u.split('"')[0].split("'")[0]);
      }
    }
    if (absUrls.size) console.log('Abs URLs:', [...absUrls].slice(0, 15));

    // Buscar environment/config
    const envRe = /environment[^{]*\{([^}]{0,500})\}/g;
    while ((m = envRe.exec(code)) !== null) {
      console.log('Environment config:', m[1].substring(0, 400));
    }

    // Buscar httpClient (Angular usa this.http.get)
    const httpRe = /\.(?:get|post|put|delete)\s*\(\s*[`'"](\/[^`'"]{5,150})[`'"]/g;
    const httpCalls = new Set();
    while ((m = httpRe.exec(code)) !== null) httpCalls.add(m[1]);
    if (httpCalls.size) console.log('HTTP calls:', [...httpCalls].slice(0, 15));

    // Buscar placa en contexto
    const placaCtx = [];
    const pRe = /.{0,100}placa.{0,100}/gi;
    while ((m = pRe.exec(code)) !== null) {
      placaCtx.push(m[0].trim());
      if (placaCtx.length >= 8) break;
    }
    if (placaCtx.length) {
      console.log('Placa context:');
      [...new Set(placaCtx)].forEach(c => console.log(' ', c.substring(0, 200)));
    }

    // Buscar baseUrl pattern
    const baseRe = /baseUrl['":\s=]+['"](https?:\/\/[^'"]{10,100})['"]/g;
    while ((m = baseRe.exec(code)) !== null) console.log('baseUrl:', m[1]);

    // Buscar tokens de autenticación (JWT, Bearer)
    const authRe = /.{0,50}(?:Bearer|Authorization|apiKey|token|JWT).{0,100}/gi;
    const authCtx = new Set();
    while ((m = authRe.exec(code)) !== null) {
      authCtx.add(m[0].trim());
      if (authCtx.size >= 6) break;
    }
    if (authCtx.size) {
      console.log('Auth context:');
      [...authCtx].forEach(c => console.log(' ', c.substring(0, 200)));
    }
  }
  
  console.log('\n\n=== Probe endpoints SUNARP consultavehicular ===\n');
  
  // Con base href = /consulta-vehicular/, el backend probablemente está en /consulta-vehicular/api/
  const endpoints = [
    '/consulta-vehicular/api/placa/' + PLACA,
    '/consulta-vehicular/api/vehiculo/' + PLACA,
    '/consulta-vehicular/api/consulta/' + PLACA,
    '/consulta-vehicular/api/datos/' + PLACA,
    '/consulta-vehicular/v1/placa/' + PLACA,
    '/consulta-vehicular/backend/placa/' + PLACA,
    '/backend/consulta-vehicular/placa/' + PLACA,
    // Quizás el backend es un servidor diferente, ver headers
    '/api/placa/' + PLACA,
    '/api/v1/placa/' + PLACA,
    '/api/consulta-vehicular/placa/' + PLACA,
  ];
  
  for (const path of endpoints) {
    const r = await get(BASE + path, { headers: { 'Accept': 'application/json', 'Referer': BASE + '/consulta-vehicular/inicio' } });
    const isJson = (r.headers?.['content-type'] || '').includes('json');
    const isAngular = typeof r.data === 'string' && r.data.includes('Consulta Vehicular');
    const preview = isJson ? JSON.stringify(r.data).substring(0, 200) : (isAngular ? '[Angular SPA]' : (r.data || '').substring(0, 60).replace(/\n/g, ' '));
    
    const flag = r.status === 200 && !isAngular && !isJson ? '⚠️' :
                 r.status === 200 && isJson ? '✅' :
                 r.status === 401 || r.status === 403 ? '🔑' : '  ';
    console.log(flag, path + ':', r.status, isJson ? '(JSON)' : isAngular ? '(Angular)' : '', preview);
  }
}

run().catch(console.error);
