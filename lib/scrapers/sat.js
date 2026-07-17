// lib/scrapers/sat.js
// Scraper SAT Lima — Consulta de Multas Administrativas por Placa
// Endpoint: https://www.sat.gob.pe/VirtualSAT/modulos/MultasAdmin.aspx
// Método: ScraperAPI URL-mode (no proxy-agent) → maneja cookies/redirects internamente
//         Si no hay SCRAPER_API_KEY, se conecta directo (funciona en local/IP peruana).

const axios   = require('axios');
const cheerio = require('cheerio');
const https   = require('https');

const BASE_URL     = 'https://www.sat.gob.pe';
const INVITADO_URL = `${BASE_URL}/VirtualSAT/iniciolibre.aspx?uid=Invitado&valida=17&ncod=0&tipbus=XAGOb41cU78%3d&valbus=XAGOb41cU78%3d`;
const MULTAS_PATH  = '/VirtualSAT/modulos/MultasAdmin.aspx';

// ScraperAPI URL-mode: simplemente antepone la URL del scraper a la URL target
function scraperUrl(targetUrl) {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return targetUrl; // Sin key → directo (útil en local)
  return `http://api.scraperapi.com/?api_key=${key}&url=${encodeURIComponent(targetUrl)}`;
}

// Para POSTs con ScraperAPI URL-mode, usamos el endpoint de API directo
function scraperPostUrl() {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return null;
  return `https://async.scraperapi.com/batches`; // no aplica
}

const DIRECT_AGENT = new https.Agent({ rejectUnauthorized: false });

function makeRequestConfig(isPost = false) {
  const key = process.env.SCRAPER_API_KEY;
  if (key) {
    // Con ScraperAPI: peticiones simples HTTP, ScraperAPI hace el HTTPS por nosotros
    return { timeout: 45000, maxRedirects: 5 };
  }
  // Sin ScraperAPI: directo con TLS desactivado (para CAs peruanos)
  return { httpsAgent: DIRECT_AGENT, timeout: 30000, maxRedirects: 5 };
}

// ─── Parsers ────────────────────────────────────────────────────────────────

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
      const tieneMonto  = cells.some(c => c.includes('S/.') || c.includes('S/') || /\d+\.\d{2}/.test(c));
      if (tieneNumero && tieneMonto) {
        const montoStr = cells.find(c => /\d+\.\d{2}/.test(c)) || '0';
        const monto    = parseFloat(montoStr.replace(/[^0-9.]/g, '')) || 0;
        deudaTotal += monto;
        multas.push({ numero: cells[0] || '', descripcion: cells[1] || '', monto, raw: cells });
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

  // Si no hay nada → sin multas
  return { multas_impagas: multas.length, deuda_total: deudaTotal, detalle_multas: multas };
}

// ─── Flujo principal ─────────────────────────────────────────────────────────

async function consultarSAT(placa) {
  const cookieJar = {};
  const cfg       = makeRequestConfig();
  const HEADERS   = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'es-PE,es;q=0.9',
    'Connection':      'keep-alive',
  };

  try {
    // ── 1. Sesión Invitado ──────────────────────────────────────────────────
    const r1 = await axios.get(scraperUrl(INVITADO_URL), {
      ...cfg,
      validateStatus: s => s < 500,
      headers: HEADERS,
    });

    mergeCookies(cookieJar, r1.headers['set-cookie']);

    // Extraer mysession de la URL final o del HTML
    const finalUrl = r1.request?.res?.responseUrl || r1.config?.url || '';
    const html1    = typeof r1.data === 'string' ? r1.data : '';

    const mysession =
      (finalUrl.match(/mysession=([^&\s]+)/)   ||
       html1.match(/mysession=([A-Za-z0-9+/=%]+)/) ||
       html1.match(/name=["']mysession["']\s+value=["']([^"']+)["']/)
      )?.[1];

    if (!mysession) {
      console.warn('[SAT] No se pudo extraer mysession. Status:', r1.status);
      return { ok: false, error: true, mensaje: 'SAT Lima: no se pudo obtener sesión', multas_impagas: 0, deuda_total: 0 };
    }

    // ── 2. Página MultasAdmin (para obtener ViewState) ─────────────────────
    const multasPageUrl = `${BASE_URL}${MULTAS_PATH}?mysession=${mysession}&tri=`;
    const r2 = await axios.get(scraperUrl(multasPageUrl), {
      ...cfg,
      validateStatus: s => s < 500,
      headers: { ...HEADERS, Cookie: cookieStr(cookieJar), Referer: `${BASE_URL}/VirtualSAT/` },
    });

    mergeCookies(cookieJar, r2.headers['set-cookie']);

    const $2           = cheerio.load(typeof r2.data === 'string' ? r2.data : '');
    const viewState    = $2('[name="__VIEWSTATE"]').val()          || '';
    const evValidation = $2('[name="__EVENTVALIDATION"]').val()    || '';
    const vsGenerator  = $2('[name="__VIEWSTATEGENERATOR"]').val() || '';

    if (!viewState) {
      console.warn('[SAT] ViewState vacío en paso 2');
      // Sin ViewState no podemos hacer el POST — intenta retornar sin multas
      return { ok: true, multas_impagas: 0, deuda_total: 0, detalle_multas: [] };
    }

    // ── 3. POST búsqueda por placa ─────────────────────────────────────────
    const params = new URLSearchParams({
      '__EVENTTARGET':   '',
      '__EVENTARGUMENT': '',
      '__VIEWSTATE':     viewState,
      '__VIEWSTATEGENERATOR': vsGenerator,
      '__EVENTVALIDATION': evValidation,
      'ctl00$cplPrincipal$hidTipConsulta': 'busqPlaca',
      'ctl00$cplPrincipal$hidCabecera':    'Placa del Vehículo',
      'ctl00$cplPrincipal$hidDocumento':   placa,
      'ctl00$cplPrincipal$txtDocumento':   placa,
      'ctl00$cplPrincipal$txtPlaca':       placa,
      'ctl00$cplPrincipal$CaptchaContinue': '',
      'ctl00$cplPrincipal$btnBuscar':      'Buscar',
    });

    // El POST va DIRECTAMENTE al SAT (sin proxy) usando las cookies del paso 2
    // ScraperAPI no maneja bien POSTs con form-data, así que lo enviamos directo
    // desde la IP de Vercel (para el POST el SAT no suele bloquear IPs de servidor)
    const postCfg = process.env.SCRAPER_API_KEY
      ? { httpsAgent: DIRECT_AGENT, timeout: 30000, validateStatus: s => s < 500 }
      : cfg;

    const r3 = await axios.post(multasPageUrl, params.toString(), {
      ...postCfg,
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie':       cookieStr(cookieJar),
        'Referer':      multasPageUrl,
        'Origin':       BASE_URL,
        'Cache-Control':'max-age=0',
      },
    });

    const resultado = parsearResultadoSAT(typeof r3.data === 'string' ? r3.data : '');
    console.log(`[SAT] ${placa}: ${resultado.multas_impagas} multas, deuda S/. ${resultado.deuda_total}`);
    return { ok: true, ...resultado };

  } catch (err) {
    console.error('[SAT] Error:', err.message);
    return { ok: false, error: true, mensaje: 'Servicio SAT Lima no disponible temporalmente', multas_impagas: 0, deuda_total: 0 };
  }
}

module.exports = { consultarSAT };
