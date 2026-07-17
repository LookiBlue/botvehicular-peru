// scripts/test-sat-form.js
// Extrae el formulario exacto del SAT y prueba la consulta por tipo vehiculo
const https = require('https');
const cheerio = require('cheerio');

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
        'Accept': 'text/html,application/xhtml+xml',
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
  
  // PASO 1: Obtener sesion
  console.log('=== PASO 1: Sesion Invitado ===');
  const r1 = await httpGet(
    'https://www.sat.gob.pe/VirtualSAT/iniciolibre.aspx?uid=Invitado&valida=17&ncod=0&tipbus=XAGOb41cU78%3d&valbus=XAGOb41cU78%3d',
    {}, cookieJar
  );
  
  let mysession = '';
  const match1 = r1.headers['location']?.match(/mysession=([^&\s]+)/);
  if (match1) {
    mysession = match1[1]; // encoded
    console.log('mysession obtenido directamente');
  }
  
  console.log('mysession raw:', mysession.substring(0, 40));
  
  // PASO 2: Cargar MultasAdmin
  console.log('\n=== PASO 2: Cargar MultasAdmin ===');
  const multasUrl = `https://www.sat.gob.pe/VirtualSAT/modulos/MultasAdmin.aspx?mysession=${mysession}&tri=`;
  const r2 = await httpGet(multasUrl, {
    'Referer': 'https://www.sat.gob.pe/VirtualSAT/principal.aspx'
  }, cookieJar);
  
  console.log('Status:', r2.status, '| Size:', r2.data.length);
  
  const $ = cheerio.load(r2.data);
  
  // Extraer opciones del dropdown tipo documento
  console.log('\n-- Opciones ddlTipoDocu --');
  $('select[name*="ddlTipoDocu"] option').each((i, el) => {
    console.log(`  value="${$(el).attr('value')}" -> ${$(el).text().trim()}`);
  });
  
  // Extraer VIEWSTATE
  const viewState = $('[name="__VIEWSTATE"]').attr('value') || '';
  const eventValidation = $('[name="__EVENTVALIDATION"]').attr('value') || '';
  const vsGenerator = $('[name="__VIEWSTATEGENERATOR"]').attr('value') || '';
  
  console.log('\nVIEWSTATE length:', viewState.length);
  console.log('EVENTVALIDATION length:', eventValidation.length);
  
  // Extraer todos los inputs y selects del formulario
  console.log('\n-- Todos los campos del formulario --');
  $('form input, form select, form textarea').each((i, el) => {
    const name = $(el).attr('name') || '';
    const type = $(el).attr('type') || el.tagName;
    const value = $(el).attr('value') || '';
    if (name) console.log(`  [${type}] ${name} = "${value.substring(0,50)}"`);
  });
  
  // PASO 3: Intentar POST con placa, cambiando tipo a "Vehiculo" o "Placa"
  // Primero necesitamos saber que valor corresponde a placa en ddlTipoDocu
  // Por ejemplo si hay opcion "6" para vehiculo...
  
  // Revisar si hay AJAX calls / WCF services en el JS
  console.log('\n-- Scripts referenciados --');
  $('script[src]').each((i, el) => {
    console.log(`  ${$(el).attr('src')}`);
  });
  
  // Buscar en el JavaScript referencias a endpoints AJAX
  const inlineScripts = [];
  $('script:not([src])').each((i, el) => {
    const text = $(el).text();
    if (text.includes('ajax') || text.includes('Ajax') || text.includes('fetch') || text.includes('XMLHttpRequest') || text.includes('PageMethods') || text.includes('webservice')) {
      inlineScripts.push(text.substring(0, 500));
    }
  });
  if (inlineScripts.length > 0) {
    console.log('\n-- Scripts con AJAX --');
    inlineScripts.forEach(s => console.log(s));
  }
  
  // PASO 4: POST del formulario con placa (tipo = el que corresponde a placa)
  // Primero probar con tipo 6 (comun en SAT para vehiculo)
  const tipoOptions = [];
  $('select[name*="ddlTipoDocu"] option').each((i, el) => {
    tipoOptions.push({ value: $(el).attr('value'), text: $(el).text().trim() });
  });
  
  // Encontrar la opcion de placa
  const placaOption = tipoOptions.find(o => 
    o.text.toLowerCase().includes('placa') || 
    o.text.toLowerCase().includes('vehiculo') || 
    o.text.toLowerCase().includes('veh')
  );
  
  console.log('\n=== PASO 4: POST formulario por placa ===');
  console.log('Opciones de tipo:', tipoOptions);
  console.log('Opcion placa detectada:', placaOption);
  
  if (viewState && tipoOptions.length > 0) {
    // Intentar con cada tipo que parezca vehiculo/placa
    const typesToTry = placaOption ? [placaOption] : tipoOptions.slice(0, 3);
    
    for (const tipo of typesToTry) {
      console.log(`\nProbando con tipo="${tipo.value}" (${tipo.text})...`);
      
      const params = new URLSearchParams({
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': vsGenerator,
        '__EVENTVALIDATION': eventValidation,
        'ctl00$cplPrincipal$ddlTipoDocu': tipo.value,
        'ctl00$cplPrincipal$txtDocumento': 'BAB215',
        'ctl00$cplPrincipal$txtNumeroMulta': '',
        'ctl00$cplPrincipal$CaptchaContinue': '',
        'ctl00$cplPrincipal$hidTipConsulta': '1',
        'ctl00$cplPrincipal$hidCabecera': '',
        'ctl00$cplPrincipal$hidDocumento': '',
        'ctl00$cplPrincipal$btnBuscar': 'Buscar',
      });
      
      const r4 = await httpPost(multasUrl, params.toString(), {
        'Referer': multasUrl,
        'Origin': 'https://www.sat.gob.pe',
        'Cache-Control': 'max-age=0',
      }, cookieJar);
      
      console.log('POST Status:', r4.status, '| Size:', r4.data.length);
      
      const $r = cheerio.load(r4.data);
      
      // Buscar tabla de resultados
      const tables = $r('table').length;
      console.log('Tablas encontradas:', tables);
      
      // Buscar mensajes de error o resultado
      const alertMsg = $r('.alert, .error, .mensaje, #lblMensaje, #lblError').text().trim();
      if (alertMsg) console.log('Mensaje:', alertMsg.substring(0, 200));
      
      // Buscar resultado de multas
      const multaData = $r('td').map((i, el) => $r(el).text().trim()).get().filter(t => t.length > 0).slice(0, 30);
      console.log('Datos en celdas:', multaData);
      
      // Imprimir todo si parece tener datos
      if (r4.data.includes('multa') || r4.data.includes('Multa') || r4.data.includes('papeleta') || r4.data.includes('deuda')) {
        console.log('\n*** DATOS DE MULTAS ENCONTRADOS ***');
        console.log(r4.data.substring(0, 3000));
      }
    }
  }
}

run().catch(console.error);
