// scripts/test-sunarp-ocr-bypass.js
// Bypass GRATUITO completo de SUNARP:
// 1. POST generar-crypt → cifrado AES
// 2. Descifrar con cryptKeyCaptcha → JSON con { model: { img: "<base64 jpeg>" } }
// 3. Usar Tesseract.js (OCR gratuito) para leer el texto del captcha
// 4. POST getDatosVehiculo con dG9rZW4 = texto OCR

const axios = require('axios');
const https = require('https');
const CryptoJS = require('crypto-js');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CRYPT_KEY_CAPTCHA = '!$5kVX5LqcGWQ%ZqV#4mX&rMbSf8Zg';

const HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json',
  'origin': 'https://consultavehicular.sunarp.gob.pe',
  'referer': 'https://consultavehicular.sunarp.gob.pe/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  'x-ibm-client-id': '70574c7d9194834316a156b1d68fdb90',
};

async function obtenerIP() {
  try {
    const r = await axios.get('https://api.ipify.org/?format=json', { timeout: 5000 });
    return r.data.ip;
  } catch { return '181.176.72.5'; }
}

async function obtenerCaptchaImagen() {
  const r = await axios.post(
    'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-captcha/captcha/generar-crypt',
    {},
    { httpsAgent, headers: HEADERS, timeout: 15000 }
  );
  const cifrado = r.data?.cmVzcG9uc2U;
  if (!cifrado) throw new Error('No se obtuvo cmVzcG9uc2U');

  // Descifrar
  const bytes = CryptoJS.AES.decrypt(cifrado, CRYPT_KEY_CAPTCHA);
  const json = bytes.toString(CryptoJS.enc.Utf8);
  const parsed = JSON.parse(json);
  const imgBase64 = parsed?.model?.img;
  if (!imgBase64) throw new Error('No hay imagen en el captcha descifrado');

  return imgBase64;
}

async function resolverOCR(imgBase64) {
  // Convertir base64 a Buffer
  const imgBuffer = Buffer.from(imgBase64, 'base64');

  // Preprocesar con Sharp: escalar, convertir a escala de grises, aumentar contraste
  const processedBuffer = await sharp(imgBuffer)
    .resize({ width: 300, kernel: 'lanczos3' }) // escalar para mejor OCR
    .greyscale()
    .normalize() // aumentar contraste
    .sharpen()
    .toBuffer();

  // Guardar para debug
  fs.writeFileSync(path.join(__dirname, '../captcha_debug.jpg'), processedBuffer);
  console.log('Imagen guardada en captcha_debug.jpg (ábrela para ver qué dice el captcha)');

  // OCR con Tesseract
  console.log('Ejecutando OCR...');
  const result = await Tesseract.recognize(processedBuffer, 'eng', {
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    tessedit_pageseg_mode: '7', // Modo: línea única
  });

  const texto = result.data.text.trim().replace(/\s+/g, '');
  console.log('OCR confidence:', result.data.confidence);
  console.log('Texto OCR:', texto);
  return texto;
}

async function consultarSUNARP(placa, token, ip) {
  const r = await axios.post(
    'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo',
    { numPlaca: placa, regPubId: null, oficRegId: null, ipAddress: ip, appVersion: '1.0', dG9rZW4: token },
    { httpsAgent, headers: HEADERS, timeout: 20000, validateStatus: s => s < 500 }
  );
  return r.data;
}

async function main() {
  console.log('=== SUNARP OCR Bypass — 100% GRATUITO ===\n');

  const ip = await obtenerIP();
  console.log('IP:', ip);

  // Intentar hasta 3 veces (por si el OCR falla en un captcha difícil)
  for (let intento = 1; intento <= 3; intento++) {
    console.log(`\n--- Intento ${intento}/3 ---`);
    try {
      const imgBase64 = await obtenerCaptchaImagen();
      console.log('Imagen captcha obtenida, tamaño base64:', imgBase64.length);

      const textoOCR = await resolverOCR(imgBase64);

      if (!textoOCR || textoOCR.length < 3) {
        console.log('OCR no detectó texto, reintentando...');
        continue;
      }

      const resultado = await consultarSUNARP('CKR477', textoOCR, ip);
      console.log('\nRespuesta SUNARP:', JSON.stringify(resultado).substring(0, 400));

      if (resultado?.cod === 1) {
        console.log('\n🎉🎉🎉 ¡BYPASS GRATUITO EXITOSO! 🎉🎉🎉');
        console.log('Propietarios:', resultado.model?.propietarios?.map(p => p.nombre).join(', '));
        console.log('Marca:', resultado.model?.marca);
        console.log('Modelo:', resultado.model?.modelo);
        break;
      } else {
        console.log(`Intento ${intento} fallido:`, resultado?.mensaje);
      }
    } catch(e) {
      console.error(`Error en intento ${intento}:`, e.message);
    }
  }
}

main().catch(console.error);
