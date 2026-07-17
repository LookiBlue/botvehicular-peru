// lib/scrapers/sunarp.js
// Scraper SUNARP — Consulta vehicular por placa
// Datos: propietario, número de titulares, marca, modelo, año, color, motor,
//        gravámenes (prendas, embargos), estado de registro
//
// Fuente: Portal SUNARP Consulta Vehicular
// https://www.sunarp.gob.pe (acceso público, sin captcha para consulta básica)

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const BASE = 'https://www.sunarp.gob.pe';
const CONSULTA_URL = `${BASE}/ConsultaVehicular/index.jsp`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Connection': 'keep-alive',
};

// Endpoints alternativos de SUNARP que se han confirmado accesibles
const ENDPOINTS_ALTERNATIVOS = [
  // API interna SUNARP (descubierta en análisis de red)
  (placa) => `https://www.sunarp.gob.pe/ConsultaVehicular/obtenerDatosVehiculo.jsp?placa=${placa}`,
  // API REST SUNARP
  (placa) => `https://www.sunarp.gob.pe/SRVLIBRE/rest/vehiculo/placa/${placa}`,
  // Portal alternativo
  (placa) => `${BASE}/ConsultaVehicular/buscarVehiculo.jsp?placa=${placa}`,
];

/**
 * Parsea los datos del vehículo del HTML o JSON de SUNARP.
 */
function parsearDatosSUNARP(data) {
  // Si es JSON
  if (typeof data === 'object' && data !== null) {
    const v = data?.vehiculo || data?.datos || data?.resultado || data;
    return {
      ok: true,
      propietario: v?.propietario || v?.titular || v?.nombre || 'No disponible',
      num_titulares: parseInt(v?.num_titulares || v?.cantidad_propietarios || v?.titulares || 1),
      marca: v?.marca || v?.des_marca || 'No disponible',
      modelo: v?.modelo || v?.des_modelo || 'No disponible',
      ano_fabricacion: v?.anio || v?.ano || v?.ano_fabricacion || 'No disponible',
      color: v?.color || v?.des_color || 'No disponible',
      clase: v?.clase || v?.categoria || v?.tipo || 'No disponible',
      motor: v?.motor || v?.nro_motor || 'No disponible',
      serie: v?.serie || v?.nro_serie || 'No disponible',
      tiene_gravamen: v?.gravamen === true || v?.tiene_prenda === true || false,
      tiene_embargo: v?.embargo === true || v?.tiene_embargo === true || false,
      estado: v?.estado || v?.condicion || 'No disponible',
    };
  }

  // Si es HTML — parsear tabla de resultados
  if (typeof data === 'string') {
    const $ = cheerio.load(data);

    // Detectar "no encontrado"
    const textoPage = $.root().text().toLowerCase();
    if (textoPage.includes('no se encontr') || textoPage.includes('no existe') || textoPage.includes('no hay result')) {
      return { ok: true, no_encontrado: true };
    }

    const resultado = {
      ok: true,
      propietario: 'No disponible',
      num_titulares: 1,
      marca: 'No disponible',
      modelo: 'No disponible',
      ano_fabricacion: 'No disponible',
      color: 'No disponible',
      clase: 'No disponible',
      motor: 'No disponible',
      serie: 'No disponible',
      tiene_gravamen: false,
      tiene_embargo: false,
      estado: 'No disponible',
    };

    // Buscar datos en tabla (td pares label-valor)
    $('table tr, .field, .dato').each((i, row) => {
      const cells = $(row).find('td, th, span, label').map((j, el) => $(el).text().trim()).get();
      for (let k = 0; k < cells.length - 1; k++) {
        const label = cells[k].toLowerCase();
        const valor = cells[k + 1];
        if (!valor || valor.length < 1) continue;
        if (label.includes('propietario') || label.includes('titular')) resultado.propietario = valor;
        if (label.includes('marca')) resultado.marca = valor;
        if (label.includes('modelo')) resultado.modelo = valor;
        if (label.includes('año') || label.includes('anio') || label.includes('fabricac')) resultado.ano_fabricacion = valor;
        if (label.includes('color')) resultado.color = valor;
        if (label.includes('clase') || label.includes('categor')) resultado.clase = valor;
        if (label.includes('motor')) resultado.motor = valor;
        if (label.includes('serie')) resultado.serie = valor;
        if (label.includes('estado') || label.includes('condic')) resultado.estado = valor;
        if (label.includes('gravamen') || label.includes('prenda')) resultado.tiene_gravamen = valor.toLowerCase().includes('si') || valor.toLowerCase().includes('sí');
        if (label.includes('embargo')) resultado.tiene_embargo = valor.toLowerCase().includes('si') || valor.toLowerCase().includes('sí');
      }
    });

    return resultado;
  }

  return null;
}

/**
 * Consulta los datos del vehículo en SUNARP.
 * @param {string} placa - Ej: "ABC123" (sin guión)
 * @returns {Object} Datos del vehículo normalizados
 */
async function consultarSUNARP(placa) {
  // ── Intentar endpoints alternativos de API ─────────────────────────────────
  for (const buildUrl of ENDPOINTS_ALTERNATIVOS) {
    try {
      const url = buildUrl(placa);
      const resp = await axios.get(url, {
        httpsAgent,
        headers: { ...HEADERS, 'Accept': 'application/json, text/html, */*' },
        timeout: 12000,
        maxRedirects: 3,
        validateStatus: s => s < 500,
      });

      if (resp.status === 200 && resp.data) {
        const parsed = parsearDatosSUNARP(resp.data);
        if (parsed && parsed.ok) return parsed;
      }
    } catch (_) { /* continuar */ }
  }

  // ── Fallback: scraping del formulario web de SUNARP ─────────────────────
  try {
    const jar = {};
    const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const mergeCk = (headers) => {
      (headers?.['set-cookie'] || []).forEach(c => {
        const eq = c.indexOf('='), semi = c.indexOf(';');
        if (eq > 0) jar[c.substring(0, eq).trim()] = (semi > eq ? c.substring(eq + 1, semi) : c.substring(eq + 1)).trim();
      });
    };

    // Cargar portal para obtener cookies
    const r1 = await axios.get(BASE + '/', {
      httpsAgent, headers: HEADERS, maxRedirects: 3, timeout: 10000, validateStatus: s => s < 500,
    });
    mergeCk(r1.headers);

    // Buscar formulario de consulta vehicular
    const $ = cheerio.load(r1.data);
    const consultaLinks = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.toLowerCase().includes('vehicul') || href.toLowerCase().includes('placa')) {
        consultaLinks.push(href.startsWith('http') ? href : BASE + href);
      }
    });

    for (const link of consultaLinks.slice(0, 3)) {
      try {
        const r2 = await axios.get(link, {
          httpsAgent, headers: { ...HEADERS, Cookie: ck() }, maxRedirects: 3, timeout: 10000, validateStatus: s => s < 500,
        });
        mergeCk(r2.headers);

        if (r2.status === 200 && r2.data.length > 500) {
          // Intentar POST del formulario con la placa
          const $2 = cheerio.load(r2.data);
          const form = $2('form').first();
          if (form.length) {
            const action = form.attr('action') || link;
            const params = new URLSearchParams();
            $2('input[name]').each((i, el) => {
              const name = $2(el).attr('name');
              const val = $2(el).val() || '';
              if (name) params.set(name, val);
            });
            // Inyectar placa en campos comunes
            ['placa', 'nroPlaca', 'txtPlaca', 'placa_vehiculo'].forEach(f => params.set(f, placa));

            const r3 = await axios.post(action.startsWith('http') ? action : BASE + action, params.toString(), {
              httpsAgent,
              headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck(), Referer: link },
              maxRedirects: 3, timeout: 12000, validateStatus: s => s < 500,
            });

            if (r3.status === 200 && r3.data.length > 200) {
              const parsed = parsearDatosSUNARP(r3.data);
              if (parsed) return parsed;
            }
          }
        }
      } catch (_) { /* continuar */ }
    }
  } catch (_) { /* continuar */ }

  // Retornar error gracioso
  console.warn('[SUNARP] No se pudo consultar para placa:', placa);
  return {
    ok: false,
    error: true,
    mensaje: 'Servicio SUNARP no disponible temporalmente',
    propietario: 'No disponible',
    num_titulares: null,
    marca: 'No disponible',
    modelo: 'No disponible',
    ano_fabricacion: 'No disponible',
    color: 'No disponible',
    clase: 'No disponible',
    motor: 'No disponible',
    serie: 'No disponible',
    tiene_gravamen: false,
    tiene_embargo: false,
    estado: 'No disponible',
  };
}

module.exports = { consultarSUNARP };
