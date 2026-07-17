// scripts/test-sat-placa.js
// Prueba búsqueda por PLACA en SAT Lima con los params correctos del JS
const https = require('https');
const cheerio = require('cheerio');

function httpGet(url, headers = {}, cookieJar = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const cookieStr = Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0',
        'Accept': 'text/html,application/xhtml+xml',
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
        const sc = res.headers['set-cookie'] || [];
        (Array.isArray(sc) ? sc : [sc]).forEach(c => {
          const eq = c.indexOf('='), semi = c.indexOf(';');
          if (eq > 0) cookieJar[c.substring(0,eq).trim()] = (semi>eq ? c.substring(eq+1,semi) : c.substring(eq+1)).trim();
        });
        resolve({ status: res.statusCode, headers: res.headers, data: d });
      });
    });
    r.on('error', reject);
    r.end();
  });
}

function httpPost(url, bodyStr, headers = {}, cookieJar = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const cookieStr = Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0',
        'Accept': 'text/html,application/xhtml+xml',
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
          const eq = c.indexOf('='), semi = c.indexOf(';');
          if (eq > 0) cookieJar[c.substring(0,eq).trim()] = (semi>eq ? c.substring(eq+1,semi) : c.substring(eq+1)).trim();
        });
        resolve({ status: res.statusCode, headers: res.headers, data: d });
      });
    });
    r.on('error', reject);
    r.write(bodyStr);
    r.end();
  });
}

async function run() {
  const cookieJar = {};
  const PLACA = 'BAB215';
  
  // ── PASO 1: Sesion invitado ───────────────────────────────────────────────
  console.log('PASO 1: Sesion invitado...');
  const r1 = await httpGet(
    'https://www.sat.gob.pe/VirtualSAT/iniciolibre.aspx?uid=Invitado&valida=17&ncod=0&tipbus=XAGOb41cU78%3d&valbus=XAGOb41cU78%3d',
    {}, cookieJar
  );
  const mysession = r1.headers['location']?.match(/mysession=([^&\s]+)/)?.[1] || '';
  console.log('mysession:', mysession ? 'OK' : 'FAIL');
  
  // ── PASO 2: Cargar la pagina MultasAdmin ──────────────────────────────────
  const multasUrl = `https://www.sat.gob.pe/VirtualSAT/modulos/MultasAdmin.aspx?mysession=${mysession}&tri=`;
  console.log('PASO 2: Cargando MultasAdmin...');
  const r2 = await httpGet(multasUrl, {}, cookieJar);
  const $ = cheerio.load(r2.data);
  
  const viewState = $('[name="__VIEWSTATE"]').val() || '';
  const eventValidation = $('[name="__EVENTVALIDATION"]').val() || '';
  const vsGenerator = $('[name="__VIEWSTATEGENERATOR"]').val() || '';
  console.log('ViewState length:', viewState.length, '| EventValidation:', eventValidation.length);
  
  // Listar todos los inputs ocultos
  console.log('\nTodos los inputs del formulario:');
  $('input, select').each((i, el) => {
    const n = $(el).attr('name'), v = $(el).attr('value') || $(el).val() || '';
    if (n && !n.includes('__VIEW') && !n.includes('__EVENT')) {
      console.log(`  ${n} = "${v.substring(0,50)}"`);
    }
  });
  
  // ── PASO 3: POST por placa (busqPlaca) ────────────────────────────────────
  console.log('\nPASO 3: POST busqPlaca...');
  
  const params = new URLSearchParams({
    '__EVENTTARGET': '',
    '__EVENTARGUMENT': '',
    '__VIEWSTATE': viewState,
    '__VIEWSTATEGENERATOR': vsGenerator,
    '__EVENTVALIDATION': eventValidation,
    // Campo de tipo de busqueda = busqPlaca (segun el JS)
    'ctl00$cplPrincipal$hidTipConsulta': 'busqPlaca',
    'ctl00$cplPrincipal$hidCabecera': 'Placa del Vehículo',
    'ctl00$cplPrincipal$hidDocumento': PLACA,
    // Input de placa (nombre probable segun el JS: divBusPlaca contiene txtPlaca)
    'ctl00$cplPrincipal$txtPlaca': PLACA,
    'ctl00$cplPrincipal$txtDocumento': PLACA,
    'ctl00$cplPrincipal$CaptchaContinue': '',
    // El boton de buscar
    'ctl00$cplPrincipal$btnBuscar': 'Buscar',
  });
  
  const r3 = await httpPost(multasUrl, params.toString(), {
    'Referer': multasUrl,
    'Origin': 'https://www.sat.gob.pe',
    'Cache-Control': 'max-age=0',
  }, cookieJar);
  
  console.log('POST Status:', r3.status, '| Size:', r3.data.length);
  
  const $3 = cheerio.load(r3.data);
  
  // Buscar mensajes
  const msgs = [];
  $3('[id*="lbl"], [id*="Label"], [id*="msg"], [id*="Mensaje"], .alert, .error, .success').each((i, el) => {
    const t = $3(el).text().trim();
    if (t && t.length < 300) msgs.push(`${el.attribs?.id || el.tagName}: ${t}`);
  });
  console.log('\nMensajes encontrados:', msgs.slice(0, 10));
  
  // Buscar tablas con datos
  const rows = [];
  $3('tr').each((i, el) => {
    const cells = $3(el).find('td').map((j, td) => $3(td).text().trim()).get().filter(t => t.length > 0);
    if (cells.length > 0) rows.push(cells);
  });
  console.log('\nFilas de tabla:', rows.slice(0, 20));
  
  // Sacar texto de todo el body
  const bodyText = $3('body').text().replace(/\s+/g, ' ').trim();
  console.log('\nTexto del body (primeros 2000):', bodyText.substring(0, 2000));
  
  // Datos de multas
  if (r3.data.toLowerCase().includes('multa') || r3.data.toLowerCase().includes('papelet') || r3.data.toLowerCase().includes('deuda')) {
    console.log('\n*** POSIBLES DATOS DE MULTAS EN RESPUESTA ***');
    // Buscar en divs con esas palabras
    $3('*').each((i, el) => {
      const text = $3(el).children().length === 0 ? $3(el).text().trim() : '';
      if (text && (text.toLowerCase().includes('multa') || text.toLowerCase().includes('papelet') || text.toLowerCase().includes('s/.') || text.toLowerCase().includes('deuda'))) {
        console.log(`  [${el.name}#${el.attribs?.id}]: ${text.substring(0,200)}`);
      }
    });
  }
}

run().catch(console.error);
