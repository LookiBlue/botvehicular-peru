// scripts/test-sunarp-final.js
// DESCUBRIMIENTO CLAVE:
// model.data (descifrado con cryptKeyCaptcha) = texto del captcha en CLARO (ej: "CC85MW")
// NO necesitamos OCR. El texto ya está en model.data descifrado.
//
// Ahora probar todas las estructuras posibles para validar-crypt

const axios = require('axios');
const https = require('https');
const CryptoJS = require('crypto-js');
const fs = require('fs');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const CRYPT_KEY        = 'sV2zUWiuNo@3uv8nu9ir4';
const CRYPT_KEY_CAPTCHA = '!$5kVX5LqcGWQ%ZqV#4mX&rMbSf8Zg';

const HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json',
  'origin': 'https://consultavehicular.sunarp.gob.pe',
  'referer': 'https://consultavehicular.sunarp.gob.pe/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  'x-ibm-client-id': '70574c7d9194834316a156b1d68fdb90',
};

const CAPTCHA_BASE = 'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-captcha/captcha';
const CONSULTA_URL = 'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo';

const decrypt = (str, keyIdx) => {
  const key = keyIdx === 1 ? CRYPT_KEY_CAPTCHA : CRYPT_KEY;
  try { const b = CryptoJS.AES.decrypt(str, key); return b.toString(CryptoJS.enc.Utf8) || null; } catch { return null; }
};
const encrypt = (str, keyIdx) => {
  const key = keyIdx === 1 ? CRYPT_KEY_CAPTCHA : CRYPT_KEY;
  return CryptoJS.AES.encrypt(str, key).toString();
};

async function getIP() {
  try { return (await axios.get('https://api.ipify.org/?format=json', { timeout: 5000 })).data.ip; } catch { return '181.176.72.5'; }
}

async function main() {
  const ip = await getIP();
  console.log('IP:', ip);

  // Paso 1: Generar captcha
  const r = await axios.post(`${CAPTCHA_BASE}/generar-crypt`, null, {
    httpsAgent, headers: HEADERS, timeout: 15000
  });
  const modelo = JSON.parse(decrypt(r.data.cmVzcG9uc2U, 1) || '{}');
  const model = modelo?.model || modelo;

  const dataCifrado = model?.data; // Cifrado con cryptKeyCaptcha
  const textoRespuesta = decrypt(dataCifrado, 1); // "CC85MW" o similar
  console.log('\nTexto del captcha (sin OCR!):', textoRespuesta);
  console.log('Data cifrada:', dataCifrado);

  // Paso 2: Probar distintas estructuras para validar-crypt
  console.log('\n=== Probando estructuras para validar-crypt ===');

  const estructuras = [
    // Con el texto en claro
    { valor: textoRespuesta },
    { respuesta: textoRespuesta },
    { codigo: textoRespuesta },
    { captcha: textoRespuesta },
    { token: textoRespuesta },
    // Con el cifrado original data
    { data: dataCifrado },
    { valor: textoRespuesta, data: dataCifrado },
    // Passando solo el texto en claro como string (no objeto)
  ];

  for (const struct of estructuras) {
    try {
      const dmFsdWU = encrypt(JSON.stringify(struct), 1);
      const vr = await axios.post(`${CAPTCHA_BASE}/validar-crypt`, { dmFsdWU }, {
        httpsAgent, headers: HEADERS, timeout: 10000, validateStatus: s => s < 500
      });
      const dec = decrypt(vr.data?.cmVzcG9uc2U, 1) || decrypt(vr.data?.cmVzcG9uc2U, 0);
      const parsed = dec ? JSON.parse(dec) : null;
      console.log(`\n${JSON.stringify(struct).substring(0, 50)} →`, dec?.substring(0, 150));
      
      if (parsed?.cod === 1 || parsed?.model?.token) {
        console.log('🎉 ÉXITO! Token:', parsed?.model?.token || JSON.stringify(parsed?.model));
        // Usar el token
        const token = parsed?.model?.token || parsed?.model;
        const cres = await axios.post(CONSULTA_URL,
          { numPlaca: 'CKR477', regPubId: null, oficRegId: null, ipAddress: ip, appVersion: '1.0', dG9rZW4: token },
          { httpsAgent, headers: HEADERS, timeout: 20000, validateStatus: s => s < 500 }
        );
        console.log('CONSULTA:', JSON.stringify(cres.data).substring(0, 400));
        break;
      }
    } catch(e) { console.error('Error:', e.message); }
  }

  // Paso 3: Probar enviar el dataCifrado directamente como dG9rZW4 (sin validar-crypt)
  console.log('\n=== Probando dataCifrado directamente como dG9rZW4 ===');
  const d1 = await axios.post(CONSULTA_URL,
    { numPlaca: 'CKR477', regPubId: null, oficRegId: null, ipAddress: ip, appVersion: '1.0', dG9rZW4: dataCifrado },
    { httpsAgent, headers: HEADERS, timeout: 20000, validateStatus: s => s < 500 }
  );
  console.log('Con dataCifrado:', JSON.stringify(d1.data).substring(0, 200));

  // Paso 4: Probar el textoRespuesta directamente como dG9rZW4
  console.log('\n=== Probando textoRespuesta directamente como dG9rZW4 ===');
  const d2 = await axios.post(CONSULTA_URL,
    { numPlaca: 'CKR477', regPubId: null, oficRegId: null, ipAddress: ip, appVersion: '1.0', dG9rZW4: textoRespuesta },
    { httpsAgent, headers: HEADERS, timeout: 20000, validateStatus: s => s < 500 }
  );
  console.log('Con texto claro:', JSON.stringify(d2.data).substring(0, 200));
}

main().catch(console.error);
