// lib/scrapers/sunarp.js
// Scraper SUNARP — Consulta Vehicular (Backend Oculto)
//
// Flujo descubierto:
// 1. Obtiene la IP del cliente (simulado o real usando ipify)
// 2. Resuelve el Cloudflare Turnstile con Sitekey 0x4AAAAAACFzt4Xn8T1Jg9ZS
// 3. POST https://api-gateway.sunarp.gob.pe:9443/.../getDatosVehiculo
//    con payload: numPlaca, ipAddress, appVersion, y dG9rZW4 (que es el token de Turnstile)

const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CAPSOLVER_KEY = process.env.CAPSOLVER_API_KEY || '';
const SUNARP_SITEKEY = '0x4AAAAAACFzt4Xn8T1Jg9ZS';
const SUNARP_URL = 'https://consultavehicular.sunarp.gob.pe/';
const SUNARP_GATEWAY = 'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo';

const HEADERS_JSON = {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json',
  'origin': 'https://consultavehicular.sunarp.gob.pe',
  'referer': 'https://consultavehicular.sunarp.gob.pe/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'x-ibm-client-id': '70574c7d9194834316a156b1d68fdb90' // Client ID hardcodeado de la app Angular
};

// ── 1. Obtener IP simulada ───────────────────────────────────────────────────
async function getIpAddress() {
  try {
    const r = await axios.get('https://api.ipify.org/?format=json', { timeout: 5000 });
    return r.data.ip || '181.176.72.5';
  } catch (e) {
    return '181.176.72.5'; // IP peruana por defecto si falla
  }
}

// ── 2. Resolver Turnstile con CapSolver ──────────────────────────────────────
async function resolverTurnstile() {
  if (!CAPSOLVER_KEY) return null;

  try {
    const rCreate = await axios.post('https://api.capsolver.com/createTask', {
      clientKey: CAPSOLVER_KEY,
      task: {
        type: 'AntiTurnstileTaskProxyLess',
        websiteURL: SUNARP_URL,
        websiteKey: SUNARP_SITEKEY,
        metadata: { action: '', cdata: '' },
      }
    }, { timeout: 15000, validateStatus: s => s < 500 });

    if (!rCreate.data?.taskId) {
      console.warn('[CapSolver SUNARP] Error:', JSON.stringify(rCreate.data));
      return null;
    }

    const taskId = rCreate.data.taskId;
    
    // Polling hasta 60s
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const rResult = await axios.post('https://api.capsolver.com/getTaskResult', {
        clientKey: CAPSOLVER_KEY,
        taskId,
      }, { timeout: 10000, validateStatus: s => s < 500 });

      if (rResult.data?.status === 'ready') return rResult.data?.solution?.token;
      if (rResult.data?.status === 'failed') return null;
    }
    return null;
  } catch (err) {
    console.error('[CapSolver SUNARP] Excepción:', err.message);
    return null;
  }
}

// ── Normalizar respuesta de SUNARP ───────────────────────────────────────────
function normalizar(data) {
  if (data.cod !== 1 || !data.model) {
    return {
      ok: false,
      error: true,
      mensaje: data.mensaje || 'Vehículo no encontrado o error en SUNARP'
    };
  }

  const v = data.model;
  
  return {
    ok: true,
    placa: v.placa,
    sede: v.sedes && v.sedes.length > 0 ? v.sedes[0].nombreSede : 'N/D',
    propietarios: v.propietarios ? v.propietarios.map(p => p.nombre.trim()) : [],
    vehiculo: {
      marca: v.marca || 'N/D',
      modelo: v.modelo || 'N/D',
      color: v.color || 'N/D',
      vin: v.numeroVin || v.numeroSerie || 'N/D',
      motor: v.numeroMotor || 'N/D',
      estado: v.estadoVehiculo || 'N/D',
      anotaciones: v.anotacionInscripcion || 'Ninguna',
      robo: v.msgAlertaRobo || 'No registra'
    },
    // Opcional: la tarjeta TIVE en base64 si la necesitas luego
    // imagen_tive: v.imagen 
  };
}

// ── Función Principal ────────────────────────────────────────────────────────
async function consultarSUNARP(placa) {
  try {
    // 1. Resolver captcha
    const cfToken = await resolverTurnstile();

    if (!cfToken && !CAPSOLVER_KEY) {
      return { ok: false, error: true, mensaje: 'SUNARP requiere configuración de CAPSOLVER_API_KEY' };
    }

    if (!cfToken) {
      return { ok: false, error: true, mensaje: 'No se pudo resolver el captcha de SUNARP (Turnstile)' };
    }

    // 2. Obtener IP
    const ipAddress = await getIpAddress();

    // 3. Construir Payload
    // Nota: dG9rZW4 es 'token' codificado en Base64. SUNARP usa este nombre de campo ofuscado.
    const payload = {
      numPlaca: placa.toUpperCase().trim(),
      regPubId: null,
      oficRegId: null,
      ipAddress: ipAddress,
      appVersion: "1.0",
      dG9rZW4: cfToken
    };

    // 4. Consultar API Gateway
    const r = await axios.post(SUNARP_GATEWAY, payload, {
      httpsAgent,
      headers: HEADERS_JSON,
      timeout: 25000,
      validateStatus: s => s < 500
    });

    console.log(`[SUNARP] ${placa}: ${r.status}`);

    if (r.status !== 200) {
      return { ok: false, error: true, mensaje: 'SUNARP no disponible (Status ' + r.status + ')' };
    }

    return normalizar(r.data);

  } catch (err) {
    console.error('[SUNARP] Error de conexión:', err.message);
    return { ok: false, error: true, mensaje: 'Error de conexión con SUNARP' };
  }
}

module.exports = { consultarSUNARP };
