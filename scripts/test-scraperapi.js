// scripts/test-scraperapi.js
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const SCRAPER_API_KEY = '255f2267a65f2ac1bba6af4a9329b738';
// Usamos el proxy HTTP de ScraperAPI
const proxyUrl = `http://scraperapi:${SCRAPER_API_KEY}@proxy-server.scraperapi.com:8001`;
const httpsAgent = new HttpsProxyAgent(proxyUrl);
// NOTA: Para no perder rejectUnauthorized: false, HttpsProxyAgent acepta opciones:
// const httpsAgent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });

async function testMTC() {
  console.log('--- Probando MTC ---');
  try {
    const r = await axios.get('https://licencias.mtc.gob.pe/api/v1/vehiculo?placa=CKR477', {
      httpsAgent: new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false }),
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36'
      }
    });
    console.log('MTC Status:', r.status);
    console.log('MTC Data:', JSON.stringify(r.data).substring(0, 200));
  } catch (e) {
    console.log('MTC Error:', e.response?.status || e.message);
  }
}

async function testSAT() {
  console.log('\n--- Probando SAT ---');
  try {
    const agent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });
    const r = await axios.get('https://www.sat.gob.pe/VirtualSAT/iniciolibre.aspx?uid=Invitado', {
      httpsAgent: agent,
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: s => s < 500,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log('SAT Status:', r.status);
    console.log('SAT URL:', r.request?.res?.responseUrl || r.config?.url);
    console.log('SAT Cookies:', r.headers['set-cookie']);
  } catch (e) {
    console.log('SAT Error:', e.message);
  }
}

async function main() {
  await testMTC();
  await testSAT();
}
main();
