// scripts/probe-sunarp-js-bundles.js
// Descarga los JS bundles del portal Angular de SUNARP para encontrar:
// 1. La clave AES que descifra el captcha
// 2. Cómo se construye el dG9rZW4 real

const axios = require('axios');
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function run() {
  // Descargar el HTML del portal para ver los scripts
  console.log('=== Descargando HTML del portal SUNARP ===');
  try {
    const r = await axios.get('https://consultavehicular.sunarp.gob.pe/consulta-vehicular', {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126 Safari/537.36' },
      validateStatus: s => s < 500
    });
    const html = r.data;
    // Encontrar todos los <script src="...">
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
    console.log('Scripts encontrados:', scripts);

    // Buscar bloques script inline que mencionen la lógica del captcha
    const inlines = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(m => m[1].trim())
      .filter(s => s.length > 10);
    console.log('\nScripts inline encontrados:', inlines.length);
    inlines.forEach((s, i) => {
      if (s.includes('captcha') || s.includes('crypt') || s.includes('AES') || s.includes('token')) {
        console.log(`Script inline ${i}:`, s.substring(0, 500));
      }
    });

    // Descargar cada script y buscar la clave
    for (const src of scripts) {
      const url = src.startsWith('http') ? src : 'https://consultavehicular.sunarp.gob.pe' + src;
      console.log(`\nDescargando: ${url}`);
      try {
        const jsRes = await axios.get(url, {
          timeout: 20000,
          headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126 Safari/537.36' },
          validateStatus: s => s < 500
        });
        if (jsRes.status !== 200) { console.log('Status:', jsRes.status); continue; }
        const js = jsRes.data;
        console.log(`Tamaño: ${js.length} bytes`);

        const keywords = ['dG9rZW4', 'cmVzcG9uc2U', 'generar-crypt', 'AES', 'CryptoJS', 'decrypt', 'passphrase', 'secretKey'];
        keywords.forEach(kw => {
          const idx = js.indexOf(kw);
          if (idx >= 0) {
            console.log(`  [${kw}] encontrado en pos ${idx}:`);
            console.log('  Contexto:', js.substring(Math.max(0, idx-100), idx+200).replace(/\s+/g, ' '));
          }
        });
      } catch(e) { console.log('Error descargando:', e.message); }
    }
  } catch(e) {
    console.error('Error:', e.message);
    if (e.response) console.error('Status:', e.response.status);
  }
}

run();
