// scripts/show-mtc-js.js
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    });
    r.on('error', reject);
    r.end();
  });
}

async function run() {
  const r = await get('https://recordconductor.mtc.gob.pe/assets/base/Acontroller.js?MTC_V1_2017-0806');
  // Show FIRST 5000 chars
  console.log('=== FIRST 5000 ===\n' + r.data.substring(0, 5000));
  
  // Find all $.getJSON / $.ajax / $http calls
  const ajaxMatches = [...r.data.matchAll(/\$\.getJSON\s*\(\s*["']([^"']+)["']/g)].map(m => m[1]);
  const ajaxMatches2 = [...r.data.matchAll(/\$http\.(?:get|post)\s*\(\s*["']([^"']+)["']/g)].map(m => m[1]);
  const ajaxMatches3 = [...r.data.matchAll(/url\s*:\s*["']([^"'\/][^"']+)["']/g)].map(m => m[1]);
  
  console.log('\n=== $.getJSON endpoints ===');
  ajaxMatches.forEach(u => console.log(' ', u));
  
  console.log('\n=== $http endpoints ===');
  ajaxMatches2.forEach(u => console.log(' ', u));
  
  console.log('\n=== url: endpoints ===');
  ajaxMatches3.forEach(u => console.log(' ', u));
  
  // Find /RecCon/ endpoints
  const recConEndpoints = [...r.data.matchAll(/["']\/RecCon\/([^"']+)["']/g)].map(m => '/RecCon/' + m[1]);
  console.log('\n=== /RecCon/ endpoints ===');
  [...new Set(recConEndpoints)].forEach(u => console.log(' ', u));
  
  // Also search custom.js
  const r2 = await get('https://recordconductor.mtc.gob.pe/assets/js/custom.js?MTC_V1_2017-0806');
  console.log('\n=== custom.js (first 3000) ===\n' + r2.data.substring(0, 3000));
  const recCon2 = [...r2.data.matchAll(/["']\/RecCon\/([^"']+)["']/g)].map(m => '/RecCon/' + m[1]);
  console.log('RecCon in custom.js:', [...new Set(recCon2)]);
}

run().catch(console.error);
