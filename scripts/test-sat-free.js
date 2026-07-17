// scripts/test-sat-free.js
// Prueba el endpoint SAT iniciolibre.aspx para consultas vehiculares sin login
const https = require('https');

async function fetchWithFollow(url, options = {}, cookieJar = {}, maxRedirects = 5) {
  let currentUrl = url;
  let redirectCount = 0;
  
  function mergeCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    arr.forEach(c => {
      const [pair] = c.split(';');
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        const k = pair.substring(0, eqIdx).trim();
        const v = pair.substring(eqIdx + 1).trim();
        cookieJar[k] = v;
      }
    });
  }
  
  function getCookieStr() {
    return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  
  while (redirectCount < maxRedirects) {
    const urlObj = new URL(currentUrl);
    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-PE,es;q=0.9',
          'Cookie': getCookieStr(),
          ...options.headers,
        },
        rejectUnauthorized: false,
      };
      const r = https.request(opts, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: d, url: currentUrl }));
      });
      r.on('error', reject);
      if (options.body) r.write(options.body);
      r.end();
    });
    
    mergeCookies(result.headers['set-cookie']);
    
    if ([301, 302, 303, 307, 308].includes(result.status) && result.headers['location']) {
      let loc = result.headers['location'];
      if (!loc.startsWith('http')) {
        const base = new URL(currentUrl);
        loc = `${base.protocol}//${base.hostname}${loc}`;
      }
      console.log(`  Redirect ${redirectCount + 1}: ${result.status} -> ${loc}`);
      currentUrl = loc;
      redirectCount++;
    } else {
      return { ...result, cookieJar, finalUrl: currentUrl };
    }
  }
}

async function run() {
  const cookieJar = {};
  
  // ─── Ruta 1: iniciolibre (sin login) ──────────────────────────────────────
  console.log('=== RUTA 1: SAT iniciolibre.aspx ===');
  const r1 = await fetchWithFollow(
    'https://www.sat.gob.pe/VirtualSAT/iniciolibre.aspx?uid=Invitado&valida=17&ncod=0',
    {}, cookieJar
  );
  console.log('Final URL:', r1.finalUrl);
  console.log('Status:', r1.status);
  console.log('Inputs en HTML:', [...(r1.data || '').matchAll(/name="([^"]+)"/g)].map(m => m[1]).slice(0, 15));
  console.log('Forms action:', [...(r1.data || '').matchAll(/action="([^"]+)"/g)].map(m => m[1]));
  
  const html = r1.data || '';
  if (html.length > 100) {
    console.log('\n--- HTML (primeros 1500 chars) ---');
    console.log(html.substring(0, 1500));
  }
  
  // ─── Ruta 2: MultasAdmin con params de iniciolibre ─────────────────────────
  console.log('\n=== RUTA 2: MultasAdmin con cookies de iniciolibre ===');
  const r2 = await fetchWithFollow(
    'https://www.sat.gob.pe/VirtualSAT/modulos/MultasAdmin.aspx',
    { headers: { 'Referer': 'https://www.sat.gob.pe/VirtualSAT/iniciolibre.aspx' } },
    cookieJar
  );
  console.log('Final URL:', r2.finalUrl);
  console.log('Status:', r2.status);
  const inputs2 = [...(r2.data || '').matchAll(/name="([^"]+)"/g)].map(m => m[1]);
  console.log('Inputs:', inputs2);
  if (r2.data && r2.data.length > 100) {
    console.log('HTML preview:', r2.data.substring(0, 2000));
  }
  
  // ─── Ruta 3: Consulta papeletas API JSON posible ──────────────────────────
  console.log('\n=== RUTA 3: Probar endpoints JSON en dominio ===');
  const jsonEndpoints = [
    '/VirtualSAT/services/MultasService.asmx',
    '/VirtualSAT/ajax/GetMultasByPlaca',
    '/VirtualSAT/modulos/PapeletasPorPlaca.aspx',
    '/WebSitev8/services/VehiculoService.asmx',
    '/WebSitev8/ajax/ConsultaPlaca',
  ];
  
  for (const ep of jsonEndpoints) {
    const cookStr = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await new Promise(resolve => {
      const opts = {
        hostname: 'www.sat.gob.pe',
        path: ep,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json, text/plain, */*',
          'Cookie': cookStr,
        },
        rejectUnauthorized: false,
      };
      const req = https.request(opts, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, data: d.substring(0, 200) }));
      });
      req.on('error', e => resolve({ error: e.message }));
      req.end();
    });
    console.log(`${ep} -> Status: ${r.status} | ${(r.data || r.error || '').substring(0, 100)}`);
  }
}

run().catch(console.error);
