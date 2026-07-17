// scripts/test-sat-session.js
// Descubre el flujo real de sesion del SAT Lima para la consulta de multas
const https = require('https');

// Seguidor de redirects con mantenimiento de cookies
async function fetchWithCookies(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8',
        ...options.headers,
      },
      rejectUnauthorized: false,
    };
    
    const r = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        data: d,
      }));
    });
    r.on('error', reject);
    if (options.body) r.write(options.body);
    r.end();
  });
}

async function run() {
  let cookieJar = {};
  
  function mergeCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    arr.forEach(c => {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      cookieJar[k.trim()] = v?.trim() || '';
    });
  }
  
  function getCookieStr() {
    return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  
  console.log('=== TEST 1: Pagina raiz SAT (incio general) ===');
  const r0 = await fetchWithCookies('https://www.sat.gob.pe/WebSitev8/IncioOV2.aspx');
  mergeCookies(r0.headers['set-cookie']);
  console.log('Status:', r0.status, '| Redirect:', r0.headers['location']);
  console.log('Cookies actuales:', JSON.stringify(cookieJar));
  
  console.log('\n=== TEST 2: Consultas en línea - Ver estructura ===');
  const r1 = await fetchWithCookies('https://www.sat.gob.pe/WebSitev8/IncioOV2.aspx', {
    headers: { Cookie: getCookieStr() }
  });
  mergeCookies(r1.headers['set-cookie']);
  console.log('Status:', r1.status);
  
  // Buscar mysession en el redirect
  const mysessionMatch = r0.headers['location']?.match(/mysession=([^&]+)/);
  if (mysessionMatch) {
    const mysession = mysessionMatch[1];
    console.log('\n=== TEST 3: MultasAdmin con mysession real ===');
    const r2 = await fetchWithCookies(
      `https://www.sat.gob.pe/VirtualSAT/modulos/MultasAdmin.aspx?mysession=${mysession}&tri=`,
      { headers: { Cookie: getCookieStr() } }
    );
    mergeCookies(r2.headers['set-cookie']);
    console.log('Status:', r2.status, '| Redirect:', r2.headers['location']);
    const html = r2.data;
    // Buscar formularios e inputs
    const inputs = [...html.matchAll(/name="([^"]+)"/g)].map(m => m[1]);
    console.log('Inputs encontrados:', inputs);
    console.log('HTML size:', html.length);
    if (html.length > 100) {
      console.log('HTML preview:', html.substring(0, 1000));
    }
  } else {
    console.log('\nmysession NO encontrado en redirect, probando bienvenida...');
    const r2b = await fetchWithCookies('https://www.sat.gob.pe/VirtualSAT/bienvenida.aspx', {
      headers: { Cookie: getCookieStr() }
    });
    mergeCookies(r2b.headers['set-cookie']);
    console.log('bienvenida.aspx Status:', r2b.status, '| Loc:', r2b.headers['location']);
    console.log('HTML size:', r2b.data.length);
    
    // Probar distintos endpoints internos
    const endpoints = [
      '/VirtualSAT/modulos/MultasAdmin.aspx',
      '/Servicios/PapeletasMultas/PapeletaVehicular.aspx',
      '/Servicios/Vehiculos/ConsultaVehiculo.aspx',
    ];
    for (const ep of endpoints) {
      const rr = await fetchWithCookies(`https://www.sat.gob.pe${ep}`, {
        headers: { Cookie: getCookieStr() }
      });
      console.log(`${ep} -> ${rr.status} | loc: ${rr.headers['location'] || '-'}`);
      if (rr.status === 200 && rr.data.length > 100) {
        const inputs = [...rr.data.matchAll(/name="([^"]+)"/g)].map(m => m[1]);
        console.log('  Inputs:', inputs);
      }
    }
  }
}

run().catch(console.error);
