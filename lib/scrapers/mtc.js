// lib/scrapers/mtc.js
// Scraper MTC / SUNARP — Datos vehiculares y papeletas de tránsito
//
// Estrategia multi-fuente:
// 1. Portal Único del Conductor (licencias.mtc.gob.pe) — Angular SPA
//    API base URL: "/" → endpoints son /api/* en el mismo dominio
//    Rate limited con Cloudflare (429) desde IPs domésticas o datacenters.
//    Se usa ScraperAPI (si está configurado) para evitar bloqueos.
// 2. Fallback: Datos neutros sin penalización

const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

let httpsAgent;
if (process.env.SCRAPER_API_KEY) {
  const proxyUrl = `http://scraperapi:${process.env.SCRAPER_API_KEY}@proxy-server.scraperapi.com:8001`;
  httpsAgent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
} else {
  httpsAgent = new https.Agent({ rejectUnauthorized: false });
}

const PUC_BASE = 'https://licencias.mtc.gob.pe';

const HEADERS_BASE = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Origin': PUC_BASE,
  'Referer': PUC_BASE + '/',
  'Connection': 'keep-alive',
};

function parsearRespuestaPUC(data) {
  if (!data || typeof data !== 'object') return null;

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

async function consultarPUC(placa) {
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
        timeout: 30000,
        validateStatus: s => s < 600,
      });

      if (resp.status === 200 && resp.data && typeof resp.data === 'object') {
        const parsed = parsearRespuestaPUC(resp.data);
        if (parsed) return parsed;
      }

      if (resp.status === 429) break;

    } catch (err) {
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') break;
    }
  }

  return null;
}

async function consultarMTC(placa) {
  try {
    const pucResult = await consultarPUC(placa);
    if (pucResult) return pucResult;

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
