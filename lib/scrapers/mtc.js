// lib/scrapers/mtc.js
// Scraper MTC / SUNARP — Datos vehiculares y papeletas de tránsito
//
// Estrategia multi-fuente:
// 1. Portal Único del Conductor (licencias.mtc.gob.pe) — Angular SPA
//    API base URL: "/" → endpoints son /api/* en el mismo dominio
//    Rate limited con Cloudflare (429) desde IPs domésticas,
//    puede funcionar desde IPs de Vercel en producción
// 2. Fallback: Datos neutros sin penalización

const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const PUC_BASE = 'https://licencias.mtc.gob.pe';

const HEADERS_BASE = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Origin': PUC_BASE,
  'Referer': PUC_BASE + '/',
  'Connection': 'keep-alive',
};

/**
 * Parsea respuesta JSON del Portal Único del Conductor.
 */
function parsearRespuestaPUC(data) {
  if (!data || typeof data !== 'object') return null;

  // Estructura esperada del API PUC
  const robado = data?.vehiculo?.robado === true ||
    data?.robado === true ||
    data?.estado === 'ROBADO' ||
    data?.condicion === 'ROBADO';

  const papeletas = data?.papeletas || data?.infracciones || [];
  const papeletasPendientes = Array.isArray(papeletas)
    ? papeletas.filter(p => p?.estado === 'PENDIENTE' || p?.pagado === false || p?.estado_pago === 'NO_PAGADO').length
    : (data?.total_papeletas || data?.cantidad_papeletas || 0);

  const revisionTecnicaVencida = data?.revision_tecnica?.estado === 'VENCIDA' ||
    data?.citv === 'VENCIDA' || false;

  const propietario = data?.propietario?.nombre ||
    data?.titular?.razon_social ||
    data?.nombre_propietario ||
    data?.vehiculo?.propietario || null;

  const marca = data?.vehiculo?.marca || data?.marca || null;
  const modelo = data?.vehiculo?.modelo || data?.modelo || null;
  const ano = data?.vehiculo?.anio || data?.anio || data?.ano || null;
  const color = data?.vehiculo?.color || data?.color || null;
  const categoria = data?.vehiculo?.categoria || data?.categoria || data?.clase || null;

  return {
    ok: true,
    propietario: propietario || 'No disponible',
    marca: marca || 'No disponible',
    modelo: modelo || 'No disponible',
    ano: ano || 'No disponible',
    color: color || 'No disponible',
    categoria: categoria || 'No disponible',
    papeletas_pendientes: papeletasPendientes,
    reportado_robado: robado,
    revision_tecnica_vencida: revisionTecnicaVencida,
  };
}

/**
 * Intenta obtener datos del vehículo desde el Portal Único del Conductor.
 */
async function consultarPUC(placa) {
  // El PUC usa Cloudflare. Estos endpoints están confirmados con status 429
  // (rate limited), lo cual significa que SÍ existen.
  // Desde IPs de servidor (Vercel) pueden no estar rate-limited.
  const candidatos = [
    `/api/vehiculo/${placa}`,
    `/api/vehiculos/${placa}`,
    `/api/v1/vehiculo?placa=${placa}`,
  ];

  for (const path of candidatos) {
    try {
      const resp = await axios.get(PUC_BASE + path, {
        httpsAgent,
        headers: HEADERS_BASE,
        timeout: 10000,
        validateStatus: s => s < 600,
      });

      if (resp.status === 200 && resp.data && typeof resp.data === 'object') {
        const parsed = parsearRespuestaPUC(resp.data);
        if (parsed) return parsed;
      }

      // Si retorna 429, el endpoint existe pero está rate-limited.
      // No intentar más en esta ejecución.
      if (resp.status === 429) break;

    } catch (err) {
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') break;
    }
  }

  return null;
}

/**
 * Consulta datos del vehículo en el MTC / SUNARP.
 * @param {string} placa - Ej: "ABC123" (sin guión)
 * @returns {Object} Resultado normalizado
 */
async function consultarMTC(placa) {
  try {
    // Intentar Portal Único del Conductor
    const pucResult = await consultarPUC(placa);
    if (pucResult) return pucResult;

    // Fallback: retornar sin datos (no penaliza el score)
    console.warn('[MTC] No se pudo obtener datos para placa:', placa);
    return {
      ok: false,
      error: true,
      mensaje: 'Servicio MTC/SUNARP no disponible temporalmente',
      propietario: 'No disponible',
      marca: 'No disponible',
      modelo: 'No disponible',
      ano: 'No disponible',
      color: 'No disponible',
      categoria: 'No disponible',
      papeletas_pendientes: 0,
      reportado_robado: false,
      revision_tecnica_vencida: false,
    };

  } catch (err) {
    console.error('[MTC] Error en consulta:', err.message);
    return {
      ok: false,
      error: true,
      mensaje: 'Servicio MTC/SUNARP no disponible temporalmente',
      propietario: 'No disponible',
      marca: 'No disponible',
      modelo: 'No disponible',
      ano: 'No disponible',
      color: 'No disponible',
      categoria: 'No disponible',
      papeletas_pendientes: 0,
      reportado_robado: false,
      revision_tecnica_vencida: false,
    };
  }
}

module.exports = { consultarMTC };
