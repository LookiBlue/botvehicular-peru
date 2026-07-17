// scripts/test-sat-js.js
// Descarga y analiza el JS del SAT para encontrar llamadas AJAX/endpoints
const https = require('https');
const cheerio = require('cheerio');

async function getPage(url, cookieJar = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const cookieStr = Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Cookie': cookieStr,
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
    r.end();
  });
}

async function run() {
  const cookieJar = {};
  
  // Sesion
  const r1 = await getPage(
    'https://www.sat.gob.pe/VirtualSAT/iniciolibre.aspx?uid=Invitado&valida=17&ncod=0&tipbus=XAGOb41cU78%3d&valbus=XAGOb41cU78%3d',
    cookieJar
  );
  const mysession = r1.headers['location']?.match(/mysession=([^&\s]+)/)?.[1] || '';
  
  // Pagina multas
  const r2 = await getPage(
    `https://www.sat.gob.pe/VirtualSAT/modulos/MultasAdmin.aspx?mysession=${mysession}&tri=`,
    cookieJar
  );
  
  const $ = cheerio.load(r2.data);
  
  // Listar todos los scripts externos
  const scripts = [];
  $('script[src]').each((i, el) => {
    const src = $(el).attr('src');
    if (src && src.includes('VirtualSAT')) {
      scripts.push(src.startsWith('http') ? src : `https://www.sat.gob.pe${src.trim()}`);
    }
  });
  
  console.log('Scripts VirtualSAT a analizar:', scripts);
  
  // Descargar y analizar codigoSAT.js que es el principal
  for (const scriptUrl of scripts) {
    console.log(`\n=== Analizando: ${scriptUrl} ===`);
    try {
      const rs = await getPage(scriptUrl, cookieJar);
      const code = rs.data;
      console.log('Tamaño:', code.length);
      
      // Buscar URLs/endpoints en el JS
      const ajaxUrls = [...code.matchAll(/['"](\/[^'"]*(?:aspx|asmx|ashx|json|api)[^'"]*)['"]/g)].map(m => m[1]);
      if (ajaxUrls.length > 0) {
        console.log('URLs encontradas en JS:');
        ajaxUrls.forEach(u => console.log('  ', u));
      }
      
      // Buscar llamadas $.ajax, $.post, $.get, fetch
      const ajaxCalls = [...code.matchAll(/\$\.(ajax|post|get)\s*\(\s*['"]([^'"]+)['"]/g)].map(m => ({ method: m[1], url: m[2] }));
      if (ajaxCalls.length > 0) {
        console.log('Llamadas jQuery AJAX:');
        ajaxCalls.forEach(c => console.log(`  ${c.method}: ${c.url}`));
      }
      
      // Buscar PageMethods o ScriptManager
      if (code.includes('PageMethods') || code.includes('WebService')) {
        console.log('PAGE METHODS / WebService encontrado!');
        const pm = [...code.matchAll(/PageMethods\.(\w+)\s*\(/g)].map(m => m[1]);
        console.log('Métodos:', pm);
      }
      
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
  
  // Analizar el HTML inline por llamadas ajax 
  console.log('\n=== Scripts inline con AJAX ===');
  $('script:not([src])').each((i, el) => {
    const text = $(el).text();
    if (text.length < 50) return;
    const hasAjax = text.includes('ajax') || text.includes('.post(') || text.includes('.get(') || 
                    text.includes('fetch(') || text.includes('XMLHttpRequest') || 
                    text.includes('WebService') || text.includes('PageMethods');
    if (hasAjax) {
      console.log(`--- Script inline ${i} (${text.length} chars) ---`);
      console.log(text.substring(0, 800));
    }
  });
  
  // Analizar la URL del browser: MultasAdmin - buscar modulo de papeletas por vehiculo
  console.log('\n=== Buscando modulo de papeletas vehiculares ===');
  const vehiculoEndpoints = [
    '/VirtualSAT/modulos/PapeletasVehiculo.aspx',
    '/VirtualSAT/modulos/MultasVehiculo.aspx', 
    '/VirtualSAT/modulos/ConsultaVehiculo.aspx',
    '/VirtualSAT/modulos/InfraccionVehiculo.aspx',
    '/VirtualSAT/modulos/PapeletaPlaca.aspx',
  ];
  
  for (const ep of vehiculoEndpoints) {
    const r = await getPage(`https://www.sat.gob.pe${ep}?mysession=${mysession}`, cookieJar);
    const msg = r.status === 404 ? '404' : `${r.status} | ${r.data.length} chars`;
    console.log(`${ep} -> ${msg}`);
    if (r.status === 200 && r.data.length > 1000) {
      const $ = cheerio.load(r.data);
      const inputs = $('input, select').map((i, el) => $(el).attr('name')).get().filter(Boolean);
      console.log('  Inputs:', inputs.slice(0, 10));
    }
  }
}

run().catch(console.error);
