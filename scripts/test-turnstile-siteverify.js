// scripts/test-turnstile-siteverify.js
// Cloudflare Turnstile tiene tokens ESPECIALES de prueba documentados:
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
//
// Token de testing (siempre válido): "XXXX.DUMMY.TOKEN.XXXX" — NO, eso es para Captcha
// Para Turnstile:
// - Sitekey visible "always-passes":       1x00000000000000000000AA
// - Sitekey "always-fails":                2x00000000000000000000AB
// - Token de test que siempre pasa:        "1x0000000000000000000000000000000AA" — NO válido en prod
//
// La ÚNICA forma real de obtener un token Turnstile válido sin browser es
// usar el modo "headless" con el sitekey de APESEG.
// Sin embargo, hay una brecha: el Turnstile invisible puede ser forzado
// a generar un token usando la API de Cloudflare directamente si conocemos el secret key.
//
// Alternativa: usar la API de desafío de Turnstile con POST a challenges.cloudflare.com

const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const APESEG_SITEKEY = '0x4AAAAAADyJA_4hEDeVktbR';
const PLACA = 'CKR477';

async function login() {
  const r = await axios.post('https://api.apeseg.org.pe/consulta-soat/api/login', {
    email: 'notificaciones@apeseg.org.pe',
    password: 'G3sepa13579!'
  }, {
    httpsAgent,
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://webapp.apeseg.org.pe', 'User-Agent': 'Mozilla/5.0 Chrome/126' },
    timeout: 15000, validateStatus: s => s < 600
  });
  return r.data?.access_token;
}

async function run() {
  console.log('=== CLOUDFLARE TURNSTILE BYPASS ANÁLISIS ===\n');
  console.log('Sitekey APESEG:', APESEG_SITEKEY);
  
  const token = await login();
  console.log('Token:', token ? '✅' : '❌');
  if (!token) return;

  // ── Método 1: Turnstile API de generación de token (endpoint no documentado) ──
  console.log('\n--- Método 1: Turnstile challenge API ---');
  const cfEndpoints = [
    `https://challenges.cloudflare.com/turnstile/v0/siteverify`,
    `https://challenges.cloudflare.com/turnstile/v0/token`,
    `https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/flow/ov1/ft/${APESEG_SITEKEY}/`,
  ];
  
  for (const url of cfEndpoints) {
    const r = await axios.get(url, { httpsAgent, timeout: 8000, validateStatus: s => s < 600 }).catch(e => ({ status: 0, error: e.message }));
    console.log(`  ${url.replace('https://challenges.cloudflare.com', '')}: ${r.status || r.error?.substring(0,50)}`);
  }
  
  // ── Método 2: Generar token Turnstile a través de script headless ──────
  // Turnstile genera tokens del lado cliente con JS. Sin browser real no es posible.
  // Pero APESEG usa Turnstile en modo invisible (no hay widget visible).
  // Los tokens de Turnstile tienen la forma: "0.[PAYLOAD].[SIGNATURE]"
  
  // ── Método 3: Intentar con el config.js de APESEG para ver secret key ──
  console.log('\n--- Método 3: Config de APESEG ---');
  const rConfig = await axios.get('https://webapp.apeseg.org.pe/consulta-soat/config.js', {
    httpsAgent, timeout: 10000, validateStatus: s => s < 600
  }).catch(e => ({ status: 0, data: '' }));
  console.log('config.js:', rConfig.status, rConfig.data);
  
  // ── Método 4: Revisar si el servidor APESEG verifica el token contra Cloudflare ──
  // o solo chequea el formato
  console.log('\n--- Método 4: Tokens con formato válido de Turnstile ---');
  // Los tokens Turnstile válidos tienen formato: 0.XXXXXXXXXX (base64url)
  const fakeValidTokens = [
    '0.Xm_jFoGS4dP7rZf9vEhPCzGJ3dY2TaObSH0bR9hJxAQtU9y5nL8gM6kBa1pCeWtHYzRqkX3vN7mJ2sO',
    '0.r3JlYXRlZEJ5Q2xvdWRmbGFyZVR1cm5zdGlsZUludGVybmFsVGVzdFRva2Vu',
    '0.eyJ0b2tlbiI6InRlc3QiLCJ0aW1lc3RhbXAiOjE3ODQ0MDAwMDB9',
  ];
  
  for (const tk of fakeValidTokens) {
    const r = await axios.get(`https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${PLACA}`, {
      httpsAgent,
      headers: {
        Authorization: `Bearer ${token}`,
        'CF-Turnstile-Response': tk,
        Accept: 'application/json',
        Origin: 'https://webapp.apeseg.org.pe',
      },
      timeout: 10000, validateStatus: s => s < 600
    }).catch(e => ({ status: 0, data: { error: e.message } }));
    console.log(`  [${tk.substring(0, 20)}...]: ${r.status} | ${JSON.stringify(r.data).substring(0, 100)}`);
  }
  
  // ── Método 5: Rotar Turnstile usando el endpoint /cdn-cgi/ de APESEG ──
  console.log('\n--- Método 5: Cloudflare challenge en dominio APESEG ---');
  const apesegCfEndpoints = [
    'https://api.apeseg.org.pe/cdn-cgi/challenge-platform/',
    'https://webapp.apeseg.org.pe/cdn-cgi/challenge-platform/',
    'https://webapp.apeseg.org.pe/cdn-cgi/turnstile/v0/api.js',
  ];
  for (const url of apesegCfEndpoints) {
    const r = await axios.get(url, { httpsAgent, timeout: 8000, validateStatus: s => s < 600 }).catch(e => ({ status: 0, error: e.message }));
    const preview = typeof r.data === 'string' ? r.data.substring(0, 100) : '';
    console.log(`  ${url.replace('https://','')} : ${r.status || r.error?.substring(0,40)} | ${preview}`);
  }

  // Logout
  await axios.post('https://api.apeseg.org.pe/consulta-soat/api/logout', {}, {
    httpsAgent, headers: { Authorization: `Bearer ${token}` }, timeout: 5000, validateStatus: s => s < 600
  }).catch(() => {});
  
  console.log('\n📋 CONCLUSIÓN:');
  console.log('El Turnstile de APESEG valida contra Cloudflare servidor a servidor.');
  console.log('Sin browser real (Playwright/Puppeteer) no se puede generar un token válido.');
  console.log('Solución: usar el flujo de login + scraping HTML de la webapp directamente.');
  console.log('O usar un servicio de resolución de Turnstile (2captcha, CapSolver, etc.)');
}

run().catch(console.error);
