// lib/scrapers/mtc.js
// Scraper de MTC / SUNARP — Datos vehiculares y papeletas
// Web MTC: https://www.mtc.gob.pe/transportes/licencias/index.html
// Web SUNARP: https://www.sunarp.gob.pe/seccion/servicios/post/consulta-vehicular.html
//
// ─── INSTRUCCIONES PARA COMPLETAR ─────────────────────────────────────────
// 1. Abre la web del MTC o SUNARP en Chrome con F12 → Network
// 2. Consulta una placa en el formulario oficial
// 3. Ubica la petición XHR/Fetch que retorna los datos del vehículo
// 4. Copia URL, Headers y estructura del Body (GET o POST)
// 5. Reemplaza MTC_ENDPOINT (o SUNARP_ENDPOINT) y sus HEADERS abajo
//
// ALTERNATIVA: RENIEC/PNP tienen APIs de consulta vehicular:
//   - https://consultas.pnp.gob.pe/vehiculos (reportes de robo)
// ─────────────────────────────────────────────────────────────────────────

const axios = require('axios');

// ⚠️ REEMPLAZAR con el endpoint real del MTC o SUNARP
const MTC_ENDPOINT = 'https://www.mtc.gob.pe/api/vehiculo/consulta';

const MTC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Content-Type': 'application/json',
  'Referer': 'https://www.mtc.gob.pe/',
  'Origin': 'https://www.mtc.gob.pe',
};

/**
 * Consulta datos del vehículo en el MTC / SUNARP.
 * @param {string} placa - Ej: "ABC123" (sin guión)
 * @returns {Object} Resultado normalizado
 */
async function consultarMTC(placa) {
  try {
    // ⚠️ AJUSTAR método y parámetros según la API real
    const response = await axios.post(
      MTC_ENDPOINT,
      { placa: placa },
      {
        headers: MTC_HEADERS,
        timeout: 12000, // MTC suele ser más lento
      }
    );

    const data = response.data;

    // ⚠️ AJUSTAR el parseo según la estructura real de la respuesta
    return {
      ok: true,
      propietario: data?.propietario || data?.nombrePropietario || 'No disponible',
      marca: data?.marca || data?.fabricante || 'No disponible',
      modelo: data?.modelo || 'No disponible',
      año: data?.anio || data?.año || data?.year || 'No disponible',
      color: data?.color || 'No disponible',
      categoria: data?.categoria || data?.tipo || 'No disponible',
      papeletas_pendientes: data?.papeletas || data?.infracciones || 0,
      reportado_robado: data?.robado === true || data?.estado === 'ROBADO',
      revision_tecnica_vencida: data?.revisionTecnicaVencida === true
        || data?.citv === 'VENCIDA'
        || (data?.fechaCITV && new Date(data.fechaCITV) < new Date()),
      fecha_revision_tecnica: data?.fechaCITV || data?.revisionTecnica || null,
    };
  } catch (err) {
    console.error('[MTC] Error en consulta:', err.message);
    return {
      ok: false,
      error: true,
      mensaje: 'Servicio MTC/SUNARP no disponible temporalmente',
      papeletas_pendientes: 0,
      reportado_robado: false,
      revision_tecnica_vencida: false,
    };
  }
}

module.exports = { consultarMTC };
