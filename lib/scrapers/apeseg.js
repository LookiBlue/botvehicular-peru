// lib/scrapers/apeseg.js
// Scraper APESEG — Consulta de SOAT (Seguro Obligatorio) por placa
//
// Estrategia: La API de APESEG (api.apeseg.org.pe) requiere IP whitelist.
// Usamos scraping de la web pública de APESEG con formulario o fallback
// al endpoint directo si funciona en el servidor de producción (Vercel IP).
//
// La API endpoint real es:
//   GET https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/{placa}
//   Headers: Authorization: Bearer <token>, X-Source: apeseg
//
// El token se obtiene haciendo login en https://webapp.apeseg.org.pe
// Configurar en .env: APESEG_TOKEN=<tu_token>

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const API_URL = 'https://api.apeseg.org.pe/consulta-soat/api/certificados/placa';

// Headers que usa la webapp de APESEG
const APESEG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Origin': 'https://webapp.apeseg.org.pe',
  'Referer': 'https://webapp.apeseg.org.pe/',
  'X-Source': 'apeseg',
};

/**
 * Parsea la respuesta de la API de APESEG al formato normalizado.
 */
function parsearRespuestaAPESEG(data) {
  // La API puede retornar array de certificados o objeto con data
  const certs = Array.isArray(data) ? data : (data?.data || data?.certificados || data?.resultado || []);

  if (!certs || certs.length === 0) {
    return {
      ok: true,
      soat_vigente: false,
      aseguradora: 'No disponible',
      numero_poliza: 'No disponible',
      fecha_inicio: null,
      fecha_vencimiento: null,
    };
  }

  // Tomar el certificado más reciente / vigente
  const hoy = new Date();
  let certVigente = null;
  let certMasReciente = certs[0];

  for (const cert of certs) {
    const vencimiento = cert?.fec_fin || cert?.fecha_vencimiento || cert?.fechaVencimiento || cert?.fecha_fin || null;
    if (vencimiento && new Date(vencimiento) > hoy) {
      certVigente = cert;
      break;
    }
    // Guardar el más reciente como fallback
    const fechaMR = certMasReciente?.fec_fin || certMasReciente?.fecha_vencimiento;
    const fechaCert = cert?.fec_fin || cert?.fecha_vencimiento;
    if (fechaCert && fechaMR && new Date(fechaCert) > new Date(fechaMR)) {
      certMasReciente = cert;
    }
  }

  const cert = certVigente || certMasReciente;
  const fecVencimiento = cert?.fec_fin || cert?.fecha_vencimiento || cert?.fechaVencimiento || cert?.fecha_fin || null;
  const fecInicio = cert?.fec_inicio || cert?.fecha_inicio || cert?.fechaInicio || cert?.fecha_ini || null;
  const vigente = fecVencimiento ? new Date(fecVencimiento) > hoy : false;

  return {
    ok: true,
    soat_vigente: vigente,
    aseguradora: cert?.des_empresa || cert?.aseguradora || cert?.compania || cert?.empresa || cert?.nom_empresa || 'No disponible',
    numero_poliza: cert?.num_poliza || cert?.nro_poliza || cert?.poliza || cert?.numero_poliza || 'No disponible',
    fecha_inicio: fecInicio,
    fecha_vencimiento: fecVencimiento,
  };
}

/**
 * Consulta SOAT en APESEG usando la API directa con token Bearer.
 */
async function consultarConToken(placa, token) {
  const response = await axios.get(`${API_URL}/${placa}`, {
    httpsAgent,
    headers: {
      ...APESEG_HEADERS,
      'Authorization': `Bearer ${token}`,
    },
    timeout: 12000,
    validateStatus: s => s < 500,
  });

  if (response.status === 200) {
    return parsearRespuestaAPESEG(response.data);
  }
  return null;
}

/**
 * Consulta SOAT en APESEG usando la web pública (scraping HTML).
 * Fallback cuando el token no está disponible.
 */
async function consultarConScraping(placa) {
  // Intentar la API sin token (puede funcionar desde IPs de Vercel / servidores cloud)
  const intentos = [
    // Sin token
    { url: `${API_URL}/${placa}`, headers: APESEG_HEADERS },
    // Con user-agent distinto
    { url: `${API_URL}/${placa}`, headers: { ...APESEG_HEADERS, 'User-Agent': 'Dart/3.0 (dart:io)' } },
  ];

  for (const intento of intentos) {
    try {
      const resp = await axios.get(intento.url, {
        httpsAgent,
        headers: intento.headers,
        timeout: 10000,
        validateStatus: s => s < 600,
      });
      if (resp.status === 200 && resp.data) {
        return parsearRespuestaAPESEG(resp.data);
      }
    } catch (_) { /* continuar */ }
  }

  return null;
}

/**
 * Consulta el estado del SOAT de un vehículo por placa.
 * @param {string} placa - Ej: "ABC123" (sin guión)
 * @returns {Object} Resultado normalizado
 */
async function consultarAPESEG(placa) {
  try {
    // Intentar con token del entorno si está configurado
    const token = process.env.APESEG_TOKEN;
    if (token) {
      const resultado = await consultarConToken(placa, token);
      if (resultado) return resultado;
    }

    // Intentar sin token (funciona desde algunas IPs cloud)
    const resultado = await consultarConScraping(placa);
    if (resultado) return resultado;

    // Si todo falla, retornar error gracioso
    console.warn('[APESEG] No se pudo consultar SOAT para placa:', placa);
    return {
      ok: false,
      error: true,
      mensaje: 'Servicio APESEG no disponible temporalmente',
      soat_vigente: null,
    };

  } catch (err) {
    console.error('[APESEG] Error en consulta:', err.message);
    return {
      ok: false,
      error: true,
      mensaje: 'Servicio APESEG no disponible temporalmente',
      soat_vigente: null,
    };
  }
}

module.exports = { consultarAPESEG };
