// scripts/crack-sunarp-captcha.js
// El captcha de SUNARP retorna:
//   { cmVzcG9uc2U: "U2FsdGVkX1+UXgkurPpd..." }
//   cmVzcG9uc2U = base64("response")
//   El valor está cifrado con CryptoJS AES (Salted__ prefix en base64 → "U2FsdGVkX1+" = "Salted__")
//
// Plan: Buscar la SECRET KEY de descifrado en el JS bundle de SUNARP
//       y si no, probar si el token es reutilizable (mismo token funciona múltiples veces)

const axios = require('axios');
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'origin': 'https://consultavehicular.sunarp.gob.pe',
  'referer': 'https://consultavehicular.sunarp.gob.pe/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  'x-ibm-client-id': '70574c7d9194834316a156b1d68fdb90',
};

async function obtenerTokenSUNARP() {
  const r = await axios.post(
    'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-captcha/captcha/generar-crypt',
    {},
    { httpsAgent, headers: HEADERS, timeout: 15000 }
  );
  return r.data?.cmVzcG9uc2U;
}

async function consultarConToken(token, placa = 'CKR477') {
  const r = await axios.post(
    'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo',
    { numPlaca: placa, regPubId: null, oficRegId: null, ipAddress: '181.176.72.5', appVersion: '1.0', dG9rZW4: token },
    { httpsAgent, headers: { ...HEADERS, 'content-type': 'application/json' }, timeout: 15000, validateStatus: s => s < 500 }
  );
  return r.data;
}

async function buscarClaveCifradoEnJS() {
  console.log('\n=== Buscando clave de cifrado AES en el JS de SUNARP ===');
  // Intentar bajar el main.js del portal de consulta vehicular
  const urls = [
    'https://consultavehicular.sunarp.gob.pe/main.js',
    'https://consultavehicular.sunarp.gob.pe/consulta-vehicular/main.js',
  ];

  for (const url of urls) {
    try {
      const r = await axios.get(url, {
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36' },
        validateStatus: s => s < 500
      });
      if (r.status === 200 && typeof r.data === 'string') {
        console.log(`Descargado ${url} (${r.data.length} bytes)`);
        // Buscar claves candidatas: strings de 8-64 chars cerca de "decrypt", "AES", "CryptoJS"
        const matches = [];
        // Buscar patrones como: key="...", passphrase="...", secretKey="..."
        const patterns = [
          /(?:key|secret|pass(?:phrase)?|clave)\s*[:=]\s*["']([A-Za-z0-9+/=_\-]{8,64})["']/gi,
          /CryptoJS\.AES\.decrypt[^"']*["']([^"']{4,32})["']/gi,
          /decrypt\([^"']*["']([^"']{4,32})["']/gi,
        ];
        for (const pattern of patterns) {
          let m;
          while ((m = pattern.exec(r.data)) !== null) {
            matches.push({ pattern: pattern.source.substring(0, 30), value: m[1] });
          }
        }
        if (matches.length > 0) {
          console.log('Posibles claves encontradas:', matches.slice(0, 10));
        } else {
          // Buscar contexto alrededor de "AES" o "decrypt"
          const idx = r.data.indexOf('AES');
          if (idx > 0) {
            console.log('Contexto AES:', r.data.substring(idx - 100, idx + 200));
          }
          const idx2 = r.data.indexOf('cmVzcG9uc2U');
          if (idx2 > 0) {
            console.log('Contexto cmVzcG9uc2U:', r.data.substring(idx2 - 100, idx2 + 200));
          }
          const idx3 = r.data.indexOf('dG9rZW4');
          if (idx3 > 0) {
            console.log('Contexto dG9rZW4:', r.data.substring(idx3 - 100, idx3 + 200));
          }
        }
      }
    } catch (e) { console.log(`Error ${url}:`, e.message); }
  }
}

async function testTokenReutilizable() {
  console.log('\n=== Test: ¿El mismo token funciona múltiples veces? ===');
  // Tomar el token que ya conocemos del payload del usuario
  const tokenConocido = '1.aeAEyTmCrDiboGt7wTsyVRInoYy4pi0IDxNAVauhIoMJqDAHBPo_Zr9IZWYnwEoUXMYGgzpqYOZvu4V399vAH6I-ZNQSforGJtL-5n2F5zv2piS3_zPrSoDwQGghHiULmeThHfkytfwXXJgPL3qPf3FRGxDTnOUtrjf_zY_yM4YT4y5KjDeoV9qnT9poHeZjpNdyBwoo-sASi0DSJomizwvexzqRimRz2NNRbAnrFFH6SE-c45PffdQF5CUHcpITMUji6jvBZyqgt_dxcFAyPUS6aTYWYj4lSD07vwUeRmbHCUWw1lP_Qw69eM5kL_SdiEMi4ecXzB_q9f5IjJCLkL5VU3fYRwpkgoWaxdOn0LJrFmjXKegpP8uG-pb99Csjfsn3qEwmaLlNo004SUn9iTNbh-ziohuGwxrPYbh2GZVQI6-j8RQuwlZ_-mWhSC03aqvpYNiy-TProgP4scx5CDf5bZOjs6TJ8974rPdTS1AjnzVNGsiAdaTGSPDEbXNnTFo4d30taprYAibaM4umwJlJfwak2hQdcnWqRc5eiNTaUkp7z96J_RBUPK3c-qAJWXLy0Bw9aomHA7GJnhsPsogSnNYSC4mahEYvZR8qvTZXcLkttcSPoKfYhV7VTZ9jPhwUFRTgfC9dsjSxkNTPORSajTrJg31f3tjdse_wtxQ.lhOGMBVC4AZRB4UcweCrog.8b7fe0ef269ef053690b93151f78c0c83c981ff023cce27d989dcf79da51d7d5';
  
  const res = await consultarConToken(tokenConocido);
  console.log('Resultado con token antiguo:', JSON.stringify(res).substring(0, 200));
}

async function testCryptTokenDirecto() {
  console.log('\n=== Test: ¿El cmVzcG9uc2U se puede usar directamente como dG9rZW4? ===');
  try {
    const cryptToken = await obtenerTokenSUNARP();
    console.log('cmVzcG9uc2U obtenido:', cryptToken ? cryptToken.substring(0, 60) + '...' : 'null');
    
    // Probar usarlo directamente
    const res1 = await consultarConToken(cryptToken);
    console.log('Usando cmVzcG9uc2U directo:', JSON.stringify(res1).substring(0, 200));
    
    // Probar en base64 decoded
    const decoded = Buffer.from(cryptToken, 'base64').toString('utf8');
    console.log('Decoded (primeros 100):', decoded.substring(0, 100));
    
  } catch(e) { console.error('Error:', e.message); }
}

(async () => {
  await buscarClaveCifradoEnJS();
  await testTokenReutilizable();
  await testCryptTokenDirecto();
})();
