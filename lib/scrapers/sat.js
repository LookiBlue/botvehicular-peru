// lib/scrapers/sat.js
// Scraper SAT Lima — Consulta de Multas Administrativas por Placa
// Endpoint: https://www.sat.gob.pe/VirtualSAT/modulos/MultasAdmin.aspx
// Método: Sesión "Invitado" + POST ASP.NET WebForms (sin captcha para consultas simples)

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

// Agente HTTPS que ignora errores de certificado (como los CAs peruanos)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const BASE_URL = 'https://www.sat.gob.pe';
const INVITADO_URL = `${BASE_URL}/VirtualSAT/iniciolibre.aspx?uid=Invitado&valida=17&ncod=0&tipbus=XAGOb41cU78%3d&valbus=XAGOb41cU78%3d`;
const MULTAS_PATH = '/VirtualSAT/modulos/MultasAdmin.aspx';

const HEADERS_BASE = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Connection': 'keep-alive',
};

/**
 * Extrae el string de cookies de un objeto cookie jar.
 */
function cookieStr(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Parsea y merge las cookies Set-Cookie en el jar.
 */
function mergeCookies(jar, setCookieHeader) {
  if (!setCookieHeader) return;
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  arr.forEach(c => {
    const eq = c.indexOf('='), semi = c.indexOf(';');
    if (eq > 0) {
      jar[c.substring(0, eq).trim()] =
        (semi > eq ? c.substring(eq + 1, semi) : c.substring(eq + 1)).trim();
    }
  });
}

/**
 * Obtiene una sesión "Invitado" del SAT Lima.
 * Retorna { cookieJar, mysession }
 */
async function obtenerSesionSAT() {
  const cookieJar = {};

  // Paso 1: Seguir la redirección hasta la página final para obtener mysession
  // Usamos maxRedirects:5 para que axios siga la cadena de redirects
  const r1 = await axios.get(INVITADO_URL, {
    httpsAgent,
    maxRedirects: 5,
    validateStatus: s => s < 500,
    timeout: 15000,
    headers: HEADERS_BASE,
  });

  mergeCookies(cookieJar, r1.headers['set-cookie']);

  // Intentar obtener mysession del header Location (si hubo redirect con maxRedirects:0)
  const location = r1.headers['location'] || '';
  let matchLoc = location.match(/mysession=([^&\s]+)/);

  // Fallback: extraer mysession de la URL final (request.res.responseUrl en axios)
  const finalUrl = r1.request?.res?.responseUrl || r1.config?.url || '';
  const matchUrl = finalUrl.match(/mysession=([^&\s]+)/);

  // Fallback 2: buscar en el HTML (a veces está embebido como campo hidden)
  let matchHtml = null;
  if (r1.data && typeof r1.data === 'string') {
    matchHtml = r1.data.match(/mysession=([A-Za-z0-9+/=%]+)/);
    if (!matchHtml) matchHtml = r1.data.match(/name=["']mysession["']\s+value=["']([^"']+)["']/);
  }

  const mysession = (matchLoc || matchUrl || matchHtml)?.[1];
  if (!mysession) throw new Error('No se pudo obtener mysession del SAT Lima');

  return { cookieJar, mysession };
}

/**
 * Carga la página MultasAdmin y extrae el ViewState necesario para el POST.
 */
async function cargarPaginaMultas(mysession, cookieJar) {
  const url = `${BASE_URL}${MULTAS_PATH}?mysession=${mysession}&tri=`;
  const r = await axios.get(url, {
    httpsAgent,
    headers: {
      ...HEADERS_BASE,
      Cookie: cookieStr(cookieJar),
      Referer: BASE_URL + '/VirtualSAT/',
    },
    maxRedirects: 3,
    timeout: 15000,
    validateStatus: s => s < 500,
  });

  mergeCookies(cookieJar, r.headers['set-cookie']);

  const $ = cheerio.load(r.data);
  const viewState = $('[name="__VIEWSTATE"]').val() || '';
  const eventValidation = $('[name="__EVENTVALIDATION"]').val() || '';
  const vsGenerator = $('[name="__VIEWSTATEGENERATOR"]').val() || '';

  // Si no hay ViewState, la sesión no cargó correctamente
  if (!viewState) {
    console.warn('[SAT] ViewState vacío. HTML preview:', r.data?.substring(0, 300));
  }

  return { url, viewState, eventValidation, vsGenerator };
}

/**
 * Parsea el HTML de respuesta del SAT y extrae los datos de multas.
 */
function parsearResultadoSAT(html) {
  const $ = cheerio.load(html);

  // Mensaje vacío → sin multas
  const msgVacio = $('#ctl00_cplPrincipal_lblMensajeVacio').text().trim();
  if (msgVacio && msgVacio.toLowerCase().includes('no se encontraron')) {
    return { multas_impagas: 0, deuda_total: 0, detalle_multas: [] };
  }

  // Parsear tabla de multas
  const multas = [];
  let deudaTotal = 0;

  $('table tr').each((i, row) => {
    const cells = $(row).find('td').map((j, td) => $(td).text().trim()).get();
    if (cells.length >= 3) {
      // Intentar detectar fila de multa (tiene numero de multa y monto)
      const tieneNumero = cells[0] && /\d/.test(cells[0]);
      const tieneMonto = cells.some(c => c.includes('S/.') || c.includes('S/') || /\d+\.\d{2}/.test(c));
      if (tieneNumero && tieneMonto) {
        const montoStr = cells.find(c => /\d+\.\d{2}/.test(c)) || '0';
        const monto = parseFloat(montoStr.replace(/[^0-9.]/g, '')) || 0;
        deudaTotal += monto;
        multas.push({
          numero: cells[0] || '',
          descripcion: cells[1] || '',
          monto,
          raw: cells,
        });
      }
    }
  });

  // Si no hubo tabla pero tampoco mensaje de vacío, buscar monto total en el HTML
  if (multas.length === 0) {
    const totalMatch = html.match(/S\/\.\s*([\d,]+\.?\d*)/);
    if (totalMatch) {
      deudaTotal = parseFloat(totalMatch[1].replace(',', '')) || 0;
      multas.push({ numero: 'N/D', descripcion: 'Multa registrada', monto: deudaTotal, raw: [] });
    }
  }

  // Buscar el label de total deuda
  const lblTotal = $('#ctl00_cplPrincipal_lblTotalDeuda').text().trim();
  if (lblTotal) {
    const montoTotal = parseFloat(lblTotal.replace(/[^0-9.]/g, '')) || deudaTotal;
    if (montoTotal > 0) deudaTotal = montoTotal;
  }

  return {
    multas_impagas: multas.length,
    deuda_total: deudaTotal,
    detalle_multas: multas,
  };
}

/**
 * Consulta multas y deudas en SAT Lima para una placa dada.
 * @param {string} placa - Ej: "ABC123" (sin guión)
 * @returns {Object} Resultado normalizado
 */
async function consultarSAT(placa) {
  try {
    // ── 1. Obtener sesión Invitado ─────────────────────────────────────────
    const { cookieJar, mysession } = await obtenerSesionSAT();

    // ── 2. Cargar página MultasAdmin y extraer ViewState ──────────────────
    const { url, viewState, eventValidation, vsGenerator } = await cargarPaginaMultas(mysession, cookieJar);

    // ── 3. POST de búsqueda por placa ─────────────────────────────────────
    const params = new URLSearchParams({
      '__EVENTTARGET': '',
      '__EVENTARGUMENT': '',
      '__VIEWSTATE': viewState,
      '__VIEWSTATEGENERATOR': vsGenerator,
      '__EVENTVALIDATION': eventValidation,
      'ctl00$cplPrincipal$hidTipConsulta': 'busqPlaca',
      'ctl00$cplPrincipal$hidCabecera': 'Placa del Vehículo',
      'ctl00$cplPrincipal$hidDocumento': placa,
      'ctl00$cplPrincipal$txtDocumento': placa,
      'ctl00$cplPrincipal$txtPlaca': placa,
      'ctl00$cplPrincipal$CaptchaContinue': '',
      'ctl00$cplPrincipal$btnBuscar': 'Buscar',
    });

    const r3 = await axios.post(url, params.toString(), {
      httpsAgent,
      headers: {
        ...HEADERS_BASE,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr(cookieJar),
        'Referer': url,
        'Origin': BASE_URL,
        'Cache-Control': 'max-age=0',
        'Pragma': 'no-cache',
      },
      maxRedirects: 3,
      timeout: 20000,
      validateStatus: s => s < 500,
    });

    // ── 4. Parsear resultado ──────────────────────────────────────────────
    const resultado = parsearResultadoSAT(r3.data);

    return {
      ok: true,
      ...resultado,
    };

  } catch (err) {
    console.error('[SAT] Error en consulta:', err.message);
    return {
      ok: false,
      error: true,
      mensaje: 'Servicio SAT Lima no disponible temporalmente',
      multas_impagas: 0,
      deuda_total: 0,
    };
  }
}

module.exports = { consultarSAT };
