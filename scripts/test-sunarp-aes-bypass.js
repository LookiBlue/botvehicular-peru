// scripts/test-sunarp-aes-bypass.js
// Prueba el bypass GRATUITO del captcha de SUNARP:
// Clave AES encontrada hardcodeada en el JS del portal:
//   cryptKey: "sV2zUWiuNo@3uv8nu9ir4"
//   cryptKeyCaptcha: "!$5kVX5LqcGWQ%ZqV#4mX&rMbSf8Zg"
// 
// El flujo correcto:
// 1. POST generar-crypt → retorna { cmVzcG9uc2U: <cifrado AES> }
// 2. Descifrar con cryptKeyCaptcha → obtiene el token real
// 3. POST getDatosVehiculo con dG9rZW4 = token descifrado

const axios = require('axios');
const https = require('https');
const CryptoJS = require('crypto-js');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CRYPT_KEY = 'sV2zUWiuNo@3uv8nu9ir4';
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

async function testBypass(placa = 'CKR477') {
  console.log(`\n=== Bypass GRATUITO SUNARP — Placa: ${placa} ===`);

  // 1. Obtener el captcha cifrado
  console.log('\n1. Obteniendo captcha cifrado...');
  const captchaRes = await axios.post(
    'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-captcha/captcha/generar-crypt',
    {},
    { httpsAgent, headers: { ...HEADERS, 'x-ibm-client-id': '70574c7d9194834316a156b1d68fdb90' }, timeout: 15000 }
  );
  const cifrado = captchaRes.data?.cmVzcG9uc2U;
  console.log('Cifrado obtenido:', cifrado ? cifrado.substring(0, 60) + '...' : 'null');

  if (!cifrado) { console.error('No se obtuvo token cifrado'); return; }

  // 2. Descifrar con las dos claves (probar ambas)
  console.log('\n2. Descifrando con cryptKey...');
  let tokenDescifrado = null;
  
  for (const [nombre, clave] of [['cryptKey', CRYPT_KEY], ['cryptKeyCaptcha', CRYPT_KEY_CAPTCHA]]) {
    try {
      const bytes = CryptoJS.AES.decrypt(cifrado, clave);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      console.log(`  [${nombre}] Resultado: "${decrypted.substring(0, 100)}"`);
      if (decrypted && decrypted.length > 5) {
        tokenDescifrado = decrypted;
        console.log(`  ✅ Éxito con ${nombre}!`);
        break;
      }
    } catch(e) { console.log(`  [${nombre}] Error:`, e.message); }
  }

  if (!tokenDescifrado) {
    console.log('\n⚠️ Desciframiento fallido. Probando enviar el cifrado directo como dG9rZW4...');
    tokenDescifrado = cifrado;
  }

  // 3. Consultar con el token
  const ip = await obtenerIP();
  console.log(`\n3. Consultando getDatosVehiculo con token (IP: ${ip})...`);
  const consultaRes = await axios.post(
    'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo',
    { numPlaca: placa, regPubId: null, oficRegId: null, ipAddress: ip, appVersion: '1.0', dG9rZW4: tokenDescifrado },
    { httpsAgent, headers: { ...HEADERS, 'content-type': 'application/json', 'x-ibm-client-id': '70574c7d9194834316a156b1d68fdb90' }, timeout: 20000, validateStatus: s => s < 500 }
  );
  
  console.log('\nStatus:', consultaRes.status);
  console.log('Respuesta:', JSON.stringify(consultaRes.data).substring(0, 500));
  
  if (consultaRes.data?.cod === 1) {
    console.log('\n🎉 ¡ÉXITO! Datos obtenidos sin pagar ni un centavo!');
  }
}

testBypass('CKR477').catch(console.error);
