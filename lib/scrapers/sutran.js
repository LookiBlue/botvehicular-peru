// lib/scrapers/sutran.js
// Scraper SUTRAN — Consulta de infracciones nacionales de tránsito por placa
// Fuente: https://www.sutran.gob.pe
// SUTRAN es la Superintendencia de Transporte Terrestre de Personas, Carga y Mercancías
// Tiene jurisdicción a nivel NACIONAL (a diferencia de SAT que es solo Lima)

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const BASE = 'https://www.sutran.gob.pe';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Connection': 'keep-alive',
};

/**
 * Parsea el resultado HTML de SUTRAN para extraer infracciones.
 */
function parsearResultadoSUTRAN(html) {
  const $ = cheerio.load(html);
  const texto = $.root().text().toLowerCase();

  if (texto.includes('no se encontr') || texto.includes('no tiene infracc') || texto.includes('no existen')) {
    return { ok: true, infracciones: 0, monto_total: 0, detalle: [] };
  }

  const detalle = [];
  let montoTotal = 0;

  // Buscar tabla de infracciones
  $('table tbody tr, .infraccion, .row-infraccion').each((i, row) => {
    const cells = $(row).find('td').map((j, td) => $(td).text().trim()).get();
    if (cells.length >= 2) {
      const tieneInfo = cells.some(c => c.length > 2);
      const monto = cells.find(c => /\d+\.?\d*/.test(c.replace(/[,S/.]/g, '')));
      if (tieneInfo) {
        const montoNum = monto ? parseFloat(monto.replace(/[^0-9.]/g, '')) || 0 : 0;
        montoTotal += montoNum;
        detalle.push({
          descripcion: cells[0] || 'Infracción',
          fecha: cells[1] || 'N/D',
          monto: montoNum,
          estado: cells[cells.length - 1] || 'N/D',
        });
      }
    }
  });

  return {
    ok: true,
    infracciones: detalle.length,
    monto_total: montoTotal,
    detalle: detalle.slice(0, 5),
  };
}

/**
 * Consulta infracciones nacionales en SUTRAN.
 * @param {string} placa - Ej: "ABC123" (sin guión)
 */
async function consultarSUTRAN(placa) {
  const jar = {};
  const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const mergeCk = (headers) => {
    (headers?.['set-cookie'] || []).forEach(c => {
      const eq = c.indexOf('='), semi = c.indexOf(';');
      if (eq > 0) jar[c.substring(0, eq).trim()] = (semi > eq ? c.substring(eq + 1, semi) : c.substring(eq + 1)).trim();
    });
  };

  try {
    // ── Intentar API JSON de SUTRAN ──────────────────────────────────────────
    const apiEndpoints = [
      `${BASE}/api/consulta/infracciones?placa=${placa}`,
      `${BASE}/api/v1/placa/${placa}/infracciones`,
      `${BASE}/consulta-de-infracciones/?placa=${placa}`,
    ];

    for (const url of apiEndpoints) {
      try {
        const r = await axios.get(url, {
          httpsAgent,
          headers: { ...HEADERS, 'Accept': 'application/json, text/html', Cookie: ck() },
          timeout: 10000, maxRedirects: 3, validateStatus: s => s < 500,
        });
        mergeCk(r.headers);

        if (r.status === 200 && r.data) {
          // Si es JSON
          if (typeof r.data === 'object') {
            const infracciones = r.data?.infracciones || r.data?.resultado || r.data?.data || [];
            return {
              ok: true,
              infracciones: Array.isArray(infracciones) ? infracciones.length : (r.data?.total || 0),
              monto_total: r.data?.monto_total || r.data?.deuda || 0,
              detalle: Array.isArray(infracciones) ? infracciones.slice(0, 5) : [],
            };
          }
          // Si es HTML con resultados
          if (typeof r.data === 'string' && r.data.length > 200) {
            const parsed = parsearResultadoSUTRAN(r.data);
            if (parsed) return parsed;
          }
        }
      } catch (_) { /* continuar */ }
    }

    // ── Scraping del portal web ──────────────────────────────────────────────
    // Cargar la página de consulta de SUTRAN
    const r1 = await axios.get(BASE + '/', {
      httpsAgent, headers: HEADERS, maxRedirects: 5, timeout: 12000, validateStatus: s => s < 500,
    });
    mergeCk(r1.headers);

    if (r1.status === 200) {
      const $ = cheerio.load(r1.data);
      // Buscar formulario de consulta
      const form = $('form:contains("placa"), form:contains("infraccion"), form').first();
      if (form.length) {
        const action = form.attr('action') || '/';
        const params = new URLSearchParams();
        form.find('input[name]').each((i, el) => {
          params.set($(el).attr('name'), $(el).val() || '');
        });
        params.set('placa', placa);
        params.set('nroPlaca', placa);

        const postUrl = action.startsWith('http') ? action : BASE + action;
        const r2 = await axios.post(postUrl, params.toString(), {
          httpsAgent,
          headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck(), Referer: BASE + '/' },
          timeout: 12000, maxRedirects: 3, validateStatus: s => s < 500,
        });

        if (r2.status === 200 && r2.data.length > 200) {
          const parsed = parsearResultadoSUTRAN(r2.data);
          if (parsed) return parsed;
        }
      }
    }

  } catch (err) {
    console.error('[SUTRAN] Error:', err.message);
  }

  return {
    ok: false,
    error: true,
    mensaje: 'SUTRAN no disponible temporalmente',
    infracciones: 0,
    monto_total: 0,
    detalle: [],
  };
}

module.exports = { consultarSUTRAN };
