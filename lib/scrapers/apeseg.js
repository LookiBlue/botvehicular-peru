// lib/scrapers/apeseg.js
// Scraper de APESEG — Consulta de SOAT (Seguro Obligatorio)
// Web: https://www.apeseg.org.pe/index.php/consulta-soat/
//
// ─── INSTRUCCIONES PARA COMPLETAR ─────────────────────────────────────────
// 1. Abre https://www.apeseg.org.pe/index.php/consulta-soat/ en Chrome
// 2. Presiona F12 → pestaña "Network" (Red) → filtra por "Fetch/XHR"
// 3. Ingresa una placa en el formulario y haz clic en consultar
// 4. Busca la petición POST o GET que retorna datos del SOAT
// 5. Copia la URL completa, Headers y estructura del Body
// 6. Reemplaza APESEG_ENDPOINT y APESEG_HEADERS abajo
// ─────────────────────────────────────────────────────────────────────────

const axios = require('axios');

// ⚠️ REEMPLAZAR con el endpoint real obtenido del F12
const APESEG_ENDPOINT = 'https://www.apeseg.org.pe/api/consulta-soat';

const APESEG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Content-Type': 'application/json',
  'Referer': 'https://www.apeseg.org.pe/index.php/consulta-soat/',
  'Origin': 'https://www.apeseg.org.pe',
};

/**
 * Consulta el estado del SOAT de un vehículo por placa.
 * @param {string} placa - Ej: "ABC123" (sin guión)
 * @returns {Object} Resultado normalizado
 */
async function consultarAPESEG(placa) {
  try {
    // ⚠️ AJUSTAR método y parámetros según la API real
    const response = await axios.post(
      APESEG_ENDPOINT,
      // Body de la petición (ajustar según F12 → Payload)
      { placa: placa },
      {
        headers: APESEG_HEADERS,
        timeout: 10000,
      }
    );

    const data = response.data;

    // ⚠️ AJUSTAR el parseo según la estructura real de la respuesta
    // Determinar si el SOAT está vigente
    const fechaVencimiento = data?.fechaVencimiento || data?.fecha_vencimiento || null;
    const soatVigente = fechaVencimiento
      ? new Date(fechaVencimiento) > new Date()
      : (data?.vigente === true || data?.estado === 'VIGENTE');

    return {
      ok: true,
      soat_vigente: soatVigente,
      aseguradora: data?.aseguradora || data?.compania || 'No disponible',
      numero_poliza: data?.numeroPoliza || data?.poliza || 'No disponible',
      fecha_inicio: data?.fechaInicio || data?.inicio || null,
      fecha_vencimiento: fechaVencimiento,
    };
  } catch (err) {
    console.error('[APESEG] Error en consulta:', err.message);
    return {
      ok: false,
      error: true,
      mensaje: 'Servicio APESEG no disponible temporalmente',
      soat_vigente: null, // null = desconocido (no penaliza en el score)
    };
  }
}

module.exports = { consultarAPESEG };
