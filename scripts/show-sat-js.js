// scripts/show-sat-js.js
const https = require('https');

function getUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*',
      },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    r.on('error', reject);
    r.end();
  });
}

async function run() {
  console.log('=== codigoSAT.js ===');
  const js = await getUrl('https://www.sat.gob.pe/VirtualSAT/js/codigoSAT.js');
  console.log(js);
  
  console.log('\n=== main.js ===');
  const js2 = await getUrl('https://www.sat.gob.pe/VirtualSAT/js/main.js');
  console.log(js2);
}

run().catch(console.error);
