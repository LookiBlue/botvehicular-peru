// lib/scrapers/sat.js
// Scraper de SAT Lima — Servicio de Administración Tributaria
// Web: https://www.sat.gob.pe/WebSitev8/IncioOV2.aspx
//
// ─── INSTRUCCIONES PARA COMPLETAR ─────────────────────────────────────────
// 1. Abre https://www.sat.gob.pe en Chrome
// 2. Presiona F12 → pestaña "Network" (Red)
// 3. Realiza una consulta de multas con cualquier placa
// 4. Busca en la lista la petición que va a un endpoint como:
//    /api/consulta/multas?placa=... o similar
// 5. Copia la URL completa y los Headers (especialmente Cookie y X-*) 
// 6. Reemplaza SAT_ENDPOINT y SAT_HEADERS abajo con esos valores
// ─────────────────────────────────────────────────────────────────────────

const axios = require('axios');

// ⚠️ REEMPLAZAR con el endpoint real obtenido del F12
const SAT_ENDPOINT = 'https://www.sat.gob.pe/api/consulta/multas';

const SAT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Referer': 'https://www.sat.gob.pe/',
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': 'https://www.sat.gob.pe',
};

/**
 * Consulta multas y deudas en SAT Lima para una placa dada.
 * @param {string} placa - Ej: "ABC123" (sin guión)
 * @returns {Object} Resultado normalizado
 */
async function consultarSAT(placa) {
  try {
    // ⚠️ AJUSTAR el método (GET/POST) y los parámetros según la API real
    const response = await axios.post(
      SAT_ENDPOINT,
      // Parámetros del body (ajustar según lo que veas en F12 → Payload)
      new URLSearchParams({ placa: placa }),
      {
        headers: SAT_HEADERS,
        timeout: 10000, // 10 segundos máximo
      }
    );

    const data = response.data;

    // ⚠️ AJUSTAR el parseo según la estructura real del JSON de respuesta
    // Estructura ejemplo que deberás adaptar:
    return {
      ok: true,
      multas_impagas: data?.totalMultas || data?.multas?.length || 0,
      deuda_total: data?.deudaTotal || data?.monto || 0,
      detalle_multas: data?.multas || [],
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
