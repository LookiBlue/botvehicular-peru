// scripts/test-sunarp-full-bypass.js
// Flujo COMPLETO descubierto del JS bundle de SUNARP (100% GRATIS):
//
// 1. POST /captcha/generar-crypt → descifrar cmVzcG9uc2U con cryptKeyCaptcha → { model: { img, id } }
// 2. OCR sobre la imagen → texto captcha
// 3. POST /captcha/validar-crypt con dmFsdWU = encrypt({ id, valor: textoOCR }, cryptKeyCaptcha)
//    → descifrar respuesta → { model: { token } }  (este es el dG9rZW4 real, cifrado con cryptKey)
// 4. POST getDatosVehiculo con dG9rZW4 = token

const axios = require('axios');
const https = require('https');
const CryptoJS = require('crypto-js');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CRYPT_KEY        = 'sV2zUWiuNo@3uv8nu9ir4';        // index 0
const CRYPT_KEY_CAPTCHA = '!$5kVX5LqcGWQ%ZqV#4mX&rMbSf8Zg'; // index 1

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

function encrypt(str, keyIdx = 0) {
  const key = keyIdx === 1 ? CRYPT_KEY_CAPTCHA : CRYPT_KEY;
  return CryptoJS.AES.encrypt(str, key).toString();
}

function decrypt(str, keyIdx = 0) {
  const key = keyIdx === 1 ? CRYPT_KEY_CAPTCHA : CRYPT_KEY;
  try {
    const bytes = CryptoJS.AES.decrypt(str, key);
    const result = bytes.toString(CryptoJS.enc.Utf8);
    return result !== '' ? result.replace(/"null"/g, 'null') : '';
  } catch { return ''; }
}

async function obtenerIP() {
  try {
    const r = await axios.get('https://api.ipify.org/?format=json', { timeout: 5000 });
    return r.data.ip;
  } catch { return '181.176.72.5'; }
}

// PASO 1: Generar captcha y extraer imagen
async function generarCaptcha() {
  const r = await axios.post(`${CAPTCHA_BASE}/generar-crypt`, null, {
    httpsAgent, headers: HEADERS, timeout: 15000
  });
  const decrypted = decrypt(r.data?.cmVzcG9uc2U, 1);
  const parsed = JSON.parse(decrypted);
  console.log('Captcha generado, model keys:', Object.keys(parsed?.model || {}));
  return parsed?.model; // { img, id, ... }
}

// PASO 2: OCR sobre la imagen JPEG base64
async function resolverOCR(imgBase64) {
  const imgBuffer = Buffer.from(imgBase64, 'base64');
  
  // Preprocesar imagen para mejor OCR
  const processed = await sharp(imgBuffer)
    .resize({ width: 400, kernel: 'lanczos3' })
    .greyscale()
    .normalize()
    .sharpen({ sigma: 2 })
    .toBuffer();

  fs.writeFileSync('captcha_debug.jpg', processed);

  const result = await Tesseract.recognize(processed, 'eng', {
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    tessedit_pageseg_mode: '7',
    tessedit_ocr_engine_mode: '1',
  });

  const texto = result.data.text.trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
  console.log(`OCR: "${texto}" (confianza: ${result.data.confidence.toFixed(0)}%)`);
  return texto;
}

// PASO 3: Validar captcha y obtener token real
async function validarCaptcha(captchaId, valorOCR) {
  // Cifrar el valor del captcha para enviarlo
  const payload = JSON.stringify({ id: captchaId, valor: valorOCR });
  const dmFsdWU = encrypt(payload, 1); // cifrado con cryptKeyCaptcha

  const r = await axios.post(`${CAPTCHA_BASE}/validar-crypt`, { dmFsdWU }, {
    httpsAgent, headers: HEADERS, timeout: 15000, validateStatus: s => s < 500
  });

  console.log('validar-crypt status:', r.status);
  console.log('validar-crypt raw:', JSON.stringify(r.data).substring(0, 200));

  const decrypted = decrypt(r.data?.cmVzcG9uc2U, 1);
  console.log('validar-crypt decrypted:', decrypted?.substring(0, 200));
  
  if (!decrypted) return null;
  const parsed = JSON.parse(decrypted);
  return parsed?.model?.token || parsed?.model || parsed?.token || null;
}

// PASO 4: Consultar vehículo con el token
async function consultarVehiculo(placa, token, ip) {
  const r = await axios.post(CONSULTA_URL,
    { numPlaca: placa, regPubId: null, oficRegId: null, ipAddress: ip, appVersion: '1.0', dG9rZW4: token },
    { httpsAgent, headers: HEADERS, timeout: 20000, validateStatus: s => s < 500 }
  );
  return r.data;
}

async function main() {
  console.log('=== SUNARP Full Bypass (100% GRATIS) ===\n');
  const ip = await obtenerIP();
  console.log('IP:', ip);

  for (let i = 1; i <= 3; i++) {
    console.log(`\n--- Intento ${i}/3 ---`);
    try {
      const captchaModel = await generarCaptcha();
      console.log('Captcha model:', JSON.stringify(captchaModel).replace(/"img":"[^"]{20}[^"]*"/,'img:"..."').substring(0,150));

      const imgBase64 = captchaModel?.img;
      const captchaId = captchaModel?.id || captchaModel?.captchaId;
      console.log('Captcha ID:', captchaId);

      if (!imgBase64) { console.log('Sin imagen'); continue; }

      const textoOCR = await resolverOCR(imgBase64);
      if (!textoOCR || textoOCR.length < 3) { console.log('OCR insuficiente'); continue; }

      const token = await validarCaptcha(captchaId, textoOCR);
      console.log('Token obtenido:', token ? String(token).substring(0, 60) + '...' : 'null');

      if (!token) { console.log('Sin token'); continue; }

      const resultado = await consultarVehiculo('CKR477', token, ip);
      console.log('\nRespuesta:', JSON.stringify(resultado).substring(0, 400));

      if (resultado?.cod === 1) {
        console.log('\n🎉🎉🎉 ¡BYPASS GRATUITO EXITOSO! 🎉🎉🎉');
        console.log('Placa:', resultado.model?.placa);
        console.log('Propietarios:', resultado.model?.propietarios?.map(p => p.nombre).join(', '));
        console.log('Marca:', resultado.model?.marca, resultado.model?.modelo);
        break;
      }
    } catch(e) {
      console.error('Error:', e.message);
    }
  }
}

main().catch(console.error);
