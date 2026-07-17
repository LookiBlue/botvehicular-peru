// lib/scrapers/sat.js
// Scraper SAT Lima — Consulta de Multas Administrativas por Placa
// Endpoint: https://www.sat.gob.pe/VirtualSAT/modulos/MultasAdmin.aspx
// Método: Sesión "Invitado" + POST ASP.NET WebForms (sin captcha para consultas simples)

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Agente HTTPS que ignora errores de certificado
// Si hay ScraperAPI configurado, usamos el proxy para evitar el bloqueo a Vercel
let httpsAgent;
if (process.env.SCRAPER_API_KEY) {
  const proxyUrl = `http://scraperapi:${process.env.SCRAPER_API_KEY}@proxy-server.scraperapi.com:8001`;
  httpsAgent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });
  // Ignorar errores TLS a nivel de Node para que el proxy intercepte HTTPS correctamente
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
} else {
  httpsAgent = new https.Agent({ rejectUnauthorized: false });
}

const BASE_URL = 'https://www.sat.gob.pe';
const INVITADO_URL = `${BASE_URL}/VirtualSAT/iniciolibre.aspx?uid=Invitado&valida=17&ncod=0&tipbus=XAGOb41cU78%3d&valbus=XAGOb41cU78%3d`;
const MULTAS_PATH = '/VirtualSAT/modulos/MultasAdmin.aspx';

const HEADERS_BASE = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Connection': 'keep-alive',
};

function cookieStr(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

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

async function obtenerSesionSAT() {
  const cookieJar = {};

  const r1 = await axios.get(INVITADO_URL, {
    httpsAgent,
    maxRedirects: 5,
    validateStatus: s => s < 500,
    timeout: 30000,
    headers: HEADERS_BASE,
  });

  mergeCookies(cookieJar, r1.headers['set-cookie']);

  const location = r1.headers['location'] || '';
  let matchLoc = location.match(/mysession=([^&\s]+)/);

  const finalUrl = r1.request?.res?.responseUrl || r1.config?.url || '';
  const matchUrl = finalUrl.match(/mysession=([^&\s]+)/);

  let matchHtml = null;
  if (r1.data && typeof r1.data === 'string') {
    matchHtml = r1.data.match(/mysession=([A-Za-z0-9+/=%]+)/);
    if (!matchHtml) matchHtml = r1.data.match(/name=["']mysession["']\s+value=["']([^"']+)["']/);
  }

  const mysession = (matchLoc || matchUrl || matchHtml)?.[1];
  if (!mysession) throw new Error('No se pudo obtener mysession del SAT Lima');

  return { cookieJar, mysession };
}

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
    timeout: 30000,
    validateStatus: s => s < 500,
  });

  mergeCookies(cookieJar, r.headers['set-cookie']);

  const $ = cheerio.load(r.data);
  const viewState = $('[name="__VIEWSTATE"]').val() || '';
  const eventValidation = $('[name="__EVENTVALIDATION"]').val() || '';
  const vsGenerator = $('[name="__VIEWSTATEGENERATOR"]').val() || '';

  if (!viewState) {
    console.warn('[SAT] ViewState vacío.');
  }

  return { url, viewState, eventValidation, vsGenerator };
}

function parsearResultadoSAT(html) {
  const $ = cheerio.load(html);

  const msgVacio = $('#ctl00_cplPrincipal_lblMensajeVacio').text().trim();
  if (msgVacio && msgVacio.toLowerCase().includes('no se encontraron')) {
    return { multas_impagas: 0, deuda_total: 0, detalle_multas: [] };
  }

  const multas = [];
  let deudaTotal = 0;

  $('table tr').each((i, row) => {
    const cells = $(row).find('td').map((j, td) => $(td).text().trim()).get();
    if (cells.length >= 3) {
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

  if (multas.length === 0) {
    const totalMatch = html.match(/S\/\.\s*([\d,]+\.?\d*)/);
    if (totalMatch) {
      deudaTotal = parseFloat(totalMatch[1].replace(',', '')) || 0;
      multas.push({ numero: 'N/D', descripcion: 'Multa registrada', monto: deudaTotal, raw: [] });
    }
  }

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

async function consultarSAT(placa) {
  try {
    const { cookieJar, mysession } = await obtenerSesionSAT();
    const { url, viewState, eventValidation, vsGenerator } = await cargarPaginaMultas(mysession, cookieJar);

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
      timeout: 30000,
      validateStatus: s => s < 500,
    });

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
