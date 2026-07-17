// scripts/test-sat-multas.js
// Prueba el flujo completo del SAT: obtener sesion + consultar multas por placa
const https = require('https');

function httpGet(url, headers = {}, cookieJar = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const cookieStr = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9',
        'Cookie': cookieStr,
        ...headers,
      },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        // Merge cookies
        const sc = res.headers['set-cookie'] || [];
        (Array.isArray(sc) ? sc : [sc]).forEach(c => {
          const eq = c.indexOf('='); const semi = c.indexOf(';');
          if (eq > 0) {
            const k = c.substring(0, eq).trim();
            const v = (semi > eq ? c.substring(eq + 1, semi) : c.substring(eq + 1)).trim();
            cookieJar[k] = v;
          }
        });
        resolve({ status: res.statusCode, headers: res.headers, data: d });
      });
    });
    r.on('error', reject);
    r.end();
  });
}

function httpPost(url, body, headers = {}, cookieJar = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const cookieStr = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr,
        ...headers,
      },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const sc = res.headers['set-cookie'] || [];
        (Array.isArray(sc) ? sc : [sc]).forEach(c => {
          const eq = c.indexOf('='); const semi = c.indexOf(';');
          if (eq > 0) {
            const k = c.substring(0, eq).trim();
            const v = (semi > eq ? c.substring(eq + 1, semi) : c.substring(eq + 1)).trim();
            cookieJar[k] = v;
          }
        });
        resolve({ status: res.statusCode, headers: res.headers, data: d });
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

async function run() {
  const cookieJar = {};
  
  // ─── PASO 1: Obtener sesion de invitado ────────────────────────────────────
  console.log('=== PASO 1: Obtener sesion Invitado ===');
  const r1 = await httpGet(
    'https://www.sat.gob.pe/VirtualSAT/iniciolibre.aspx?uid=Invitado&valida=17&ncod=0&tipbus=XAGOb41cU78%3d&valbus=XAGOb41cU78%3d',
    {}, cookieJar
  );
  console.log('Status:', r1.status, '| Location:', r1.headers['location']);
  
  // Seguir el redirect para obtener el mysession
  let mysession = '';
  if (r1.headers['location'] && r1.headers['location'].includes('mysession=')) {
    const match = r1.headers['location'].match(/mysession=([^&]+)/);
    if (match) mysession = decodeURIComponent(match[1]);
  }
  
  // Si todavia no tenemos mysession, seguir redirect
  if (!mysession && r1.headers['location']) {
    const r1b = await httpGet(
      r1.headers['location'].startsWith('http') ? r1.headers['location'] : `https://www.sat.gob.pe${r1.headers['location']}`,
      {}, cookieJar
    );
    console.log('Redirect follow Status:', r1b.status, '| Loc:', r1b.headers['location']);
    const m = r1b.headers['location']?.match(/mysession=([^&]+)/);
    if (m) mysession = decodeURIComponent(m[1]);
    
    if (!mysession && r1b.headers['location']) {
      const r1c = await httpGet(
        r1b.headers['location'].startsWith('http') ? r1b.headers['location'] : `https://www.sat.gob.pe${r1b.headers['location']}`,
        {}, cookieJar
      );
      const m2 = r1c.headers['location']?.match(/mysession=([^&]+)/);
      if (m2) mysession = decodeURIComponent(m2[1]);
      console.log('Status2:', r1c.status, '| Loc2:', r1c.headers['location']);
    }
  }
  
  console.log('mysession:', mysession ? mysession.substring(0, 30) + '...' : 'NO ENCONTRADO');
  console.log('cookieJar keys:', Object.keys(cookieJar));
  
  if (!mysession) {
    console.log('ERROR: No se pudo obtener mysession');
    return;
  }
  
  // ─── PASO 2: Cargar pagina MultasAdmin con mysession ──────────────────────
  console.log('\n=== PASO 2: Cargar MultasAdmin con mysession ===');
  const multasUrl = `https://www.sat.gob.pe/VirtualSAT/modulos/MultasAdmin.aspx?mysession=${encodeURIComponent(mysession)}&tri=`;
  const r2 = await httpGet(multasUrl, { 'Referer': 'https://www.sat.gob.pe/VirtualSAT/principal.aspx' }, cookieJar);
  console.log('Status:', r2.status, '| Location:', r2.headers['location']);
  
  let pageHtml = r2.data;
  
  // Si hay redirect, seguirlo
  if (r2.status === 302 && r2.headers['location']) {
    const loc = r2.headers['location'].startsWith('http') ? r2.headers['location'] : `https://www.sat.gob.pe${r2.headers['location']}`;
    const r2b = await httpGet(loc, {}, cookieJar);
    console.log('Redirect Status:', r2b.status);
    pageHtml = r2b.data;
  }
  
  console.log('HTML size:', pageHtml.length);
  const inputNames = [...pageHtml.matchAll(/name="([^"]+)"/g)].map(m => m[1]);
  console.log('Inputs encontrados:', inputNames);
  
  if (pageHtml.length > 100) {
    console.log('\n--- HTML MultasAdmin (primeros 3000 chars) ---');
    console.log(pageHtml.substring(0, 3000));
  }
  
  // ─── PASO 3: Extraer VIEWSTATE y enviar formulario con placa ──────────────
  const vsMatch = pageHtml.match(/id="__VIEWSTATE"[^>]*value="([^"]+)"/);
  const evMatch = pageHtml.match(/id="__EVENTVALIDATION"[^>]*value="([^"]+)"/);
  const vsGenMatch = pageHtml.match(/id="__VIEWSTATEGENERATOR"[^>]*value="([^"]+)"/);
  
  if (vsMatch) {
    console.log('\n=== PASO 3: Enviar formulario con placa ===');
    const formBody = new URLSearchParams({
      '__VIEWSTATE': vsMatch[1],
      '__EVENTVALIDATION': evMatch ? evMatch[1] : '',
      '__VIEWSTATEGENERATOR': vsGenMatch ? vsGenMatch[1] : '',
      'txtPlacaVehiculo': 'BAB215',
      'btnBuscarPlaca': 'Buscar',
    }).toString();
    
    const r3 = await httpPost(multasUrl, formBody, {
      'Referer': multasUrl,
      'Origin': 'https://www.sat.gob.pe',
    }, cookieJar);
    console.log('POST Status:', r3.status);
    console.log('HTML size:', r3.data.length);
    
    // Buscar tabla de resultados
    const tableMatch = r3.data.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
    if (tableMatch) {
      console.log('Tablas encontradas:', tableMatch.length);
      tableMatch.forEach((t, i) => console.log(`Tabla ${i}:`, t.substring(0, 500)));
    } else {
      console.log('HTML preview:', r3.data.substring(0, 2000));
    }
  } else {
    console.log('VIEWSTATE no encontrado en el HTML');
  }
}

run().catch(console.error);
