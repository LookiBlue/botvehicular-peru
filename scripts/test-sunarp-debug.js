// scripts/test-sunarp-debug.js
// Depuración completa del flujo de captcha SUNARP
// Objetivo: entender qué ID y estructura espera validar-crypt

const axios = require('axios');
const https = require('https');
const CryptoJS = require('crypto-js');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
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

function decrypt(str, keyIdx) {
  const key = keyIdx === 1 ? CRYPT_KEY_CAPTCHA : CRYPT_KEY;
  try {
    const b = CryptoJS.AES.decrypt(str, key);
    const r = b.toString(CryptoJS.enc.Utf8);
    return r !== '' ? r.replace(/"null"/g, 'null') : null;
  } catch { return null; }
}

function encrypt(str, keyIdx) {
  const key = keyIdx === 1 ? CRYPT_KEY_CAPTCHA : CRYPT_KEY;
  return CryptoJS.AES.encrypt(str, key).toString();
}

async function main() {
  console.log('=== DEPURACIÓN CAPTCHA SUNARP ===\n');

  // 1. Obtener captcha
  const r = await axios.post(`${CAPTCHA_BASE}/generar-crypt`, null, {
    httpsAgent, headers: HEADERS, timeout: 15000
  });

  const cifrado = r.data?.cmVzcG9uc2U;
  console.log('cmVzcG9uc2U (cifrado):', cifrado?.substring(0, 60));

  const dec1 = decrypt(cifrado, 1);
  console.log('\nDecrypt con cryptKeyCaptcha:', dec1 ? dec1.substring(0, 200) : 'FALLO');

  const dec0 = decrypt(cifrado, 0);
  console.log('Decrypt con cryptKey:', dec0 ? dec0.substring(0, 200) : 'FALLO');

  const parsed = JSON.parse(dec1 || dec0 || '{}');
  const model = parsed?.model || parsed;
  console.log('\nModel keys:', Object.keys(model));
  console.log('Model (sin img):', JSON.stringify({ ...model, img: model.img ? '<img:' + model.img.length + 'chars>' : undefined }));

  // 2. Descifrar el campo 'data' si existe
  if (model.data) {
    console.log('\nDescrifrando model.data...');
    const d0 = decrypt(model.data, 0);
    const d1 = decrypt(model.data, 1);
    console.log('model.data con cryptKey:', d0);
    console.log('model.data con cryptKeyCaptcha:', d1);
  }

  // 3. Ver la imagen del captcha
  if (model.img) {
    const imgBuf = Buffer.from(model.img, 'base64');
    const proc = await sharp(imgBuf).resize({ width: 400 }).greyscale().normalize().sharpen().toBuffer();
    fs.writeFileSync('captcha_debug.jpg', proc);
    console.log('\nImagen guardada: captcha_debug.jpg');

    // OCR
    const ocr = await Tesseract.recognize(proc, 'eng', {
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      tessedit_pageseg_mode: '7',
    });
    const texto = ocr.data.text.trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
    console.log('Texto OCR:', texto, '| Confianza:', ocr.data.confidence.toFixed(0) + '%');
  }

  // 4. Probar estructuras posibles para validar-crypt
  console.log('\n=== Probando estructuras para validar-crypt ===');
  const estructuras = [
    { id: model.id, valor: 'TEST' },
    { id: model.captchaId, valor: 'TEST' },
    { data: model.data, valor: 'TEST' },
    { codigo: 'TEST' },
    { respuesta: 'TEST' },
    { valor: 'TEST' },
    { captcha: 'TEST', id: model.id || model.data },
  ];

  for (const struct of estructuras) {
    const dmFsdWU = encrypt(JSON.stringify(struct), 1);
    try {
      const vr = await axios.post(`${CAPTCHA_BASE}/validar-crypt`, { dmFsdWU }, {
        httpsAgent, headers: HEADERS, timeout: 10000, validateStatus: s => s < 500
      });
      const vdec = decrypt(vr.data?.cmVzcG9uc2U, 1);
      const vdec0 = decrypt(vr.data?.cmVzcG9uc2U, 0);
      const vresult = vdec || vdec0;
      console.log(`\nEstructura: ${JSON.stringify(struct).substring(0,60)}`);
      console.log('Respuesta:', vresult?.substring(0, 150) || JSON.stringify(vr.data).substring(0, 100));
    } catch(e) { console.log('Error:', e.message); }
  }
}

main().catch(console.error);
