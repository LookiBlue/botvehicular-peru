// scripts/probe-captchas-free.js
// Investiga si podemos resolver los captchas gratis:
// 1. SUNARP generar-crypt — ¿es una imagen? ¿es reutilizable?
// 2. APESEG Turnstile — ¿los IPs de servidor la bypasean?

const axios = require('axios');
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const HEADERS_SUNARP = {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json',
  'origin': 'https://consultavehicular.sunarp.gob.pe',
  'referer': 'https://consultavehicular.sunarp.gob.pe/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  'x-ibm-client-id': '70574c7d9194834316a156b1d68fdb90',
};

async function probeSUNARPCaptcha() {
  console.log('\n=== SUNARP generar-crypt ===');
  try {
    const r = await axios.post(
      'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-captcha/captcha/generar-crypt',
      {},
      { httpsAgent, headers: HEADERS_SUNARP, timeout: 15000 }
    );
    console.log('Status:', r.status);
    console.log('Content-Type:', r.headers['content-type']);
    const data = r.data;
    if (typeof data === 'string') {
      console.log('Tipo: STRING, longitud:', data.length);
      console.log('Primeros 200 chars:', data.substring(0, 200));
    } else if (typeof data === 'object') {
      console.log('Tipo: OBJECT, keys:', Object.keys(data));
      console.log('Data completa:', JSON.stringify(data).substring(0, 500));
      // Si tiene imagen base64
      if (data.imagen || data.captcha || data.image || data.img) {
        const imgB64 = data.imagen || data.captcha || data.image || data.img;
        console.log('¡Tiene imagen base64! Longitud:', imgB64.length);
        console.log('Inicio imagen:', imgB64.substring(0, 50));
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data).substring(0, 300));
    }
  }
}

async function probeAPESEGSinTurnstile() {
  console.log('\n=== APESEG — Login (sin Turnstile) ===');
  try {
    const loginRes = await axios.post(
      'https://webapp.apeseg.org.pe/consulta-soat/api/login',
      { email: 'notificaciones@apeseg.org.pe', password: 'G3sepa13579!' },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
          'Origin': 'https://webapp.apeseg.org.pe',
        },
        timeout: 15000, validateStatus: s => s < 500
      }
    );
    console.log('Login status:', loginRes.status);
    const token = loginRes.data?.access_token || loginRes.data?.token;
    if (!token) { console.log('Sin token:', JSON.stringify(loginRes.data).substring(0,200)); return; }
    console.log('Token obtenido:', token.substring(0, 40) + '...');

    // Intentar consulta SIN header Turnstile
    console.log('\n=== APESEG — Certificado SIN Turnstile ===');
    const certRes = await axios.get(
      'https://webapp.apeseg.org.pe/consulta-soat/api/certificados?placa=CKR477',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
          'Origin': 'https://webapp.apeseg.org.pe',
        },
        timeout: 15000, validateStatus: s => s < 600
      }
    );
    console.log('Certificado status:', certRes.status);
    console.log('Data:', JSON.stringify(certRes.data).substring(0, 300));

    // Probar con header vacío
    console.log('\n=== APESEG — Certificado con CF-Turnstile-Response vacío ===');
    const certRes2 = await axios.get(
      'https://webapp.apeseg.org.pe/consulta-soat/api/certificados?placa=CKR477',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'CF-Turnstile-Response': '',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
          'Origin': 'https://webapp.apeseg.org.pe',
        },
        timeout: 15000, validateStatus: s => s < 600
      }
    );
    console.log('Certificado con header vacío status:', certRes2.status);
    console.log('Data:', JSON.stringify(certRes2.data).substring(0, 300));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function probeSUNARPConTokenVacio() {
  console.log('\n=== SUNARP getDatosVehiculo con dG9rZW4 vacío ===');
  try {
    const r = await axios.post(
      'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo',
      { numPlaca: 'CKR477', regPubId: null, oficRegId: null, ipAddress: '181.176.72.5', appVersion: '1.0', dG9rZW4: '' },
      { httpsAgent, headers: HEADERS_SUNARP, timeout: 15000, validateStatus: s => s < 500 }
    );
    console.log('Status:', r.status);
    console.log('Data:', JSON.stringify(r.data).substring(0, 300));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

(async () => {
  await probeSUNARPCaptcha();
  await probeAPESEGSinTurnstile();
  await probeSUNARPConTokenVacio();
})();
