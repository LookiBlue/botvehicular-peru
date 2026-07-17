// scripts/test-sunarp-consulta.js
// Busca el endpoint real de SUNARP para consulta vehicular por placa
const https = require('https');
const cheerio = require('cheerio');

function get(url, headers = {}, jar = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const ck = Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'es-PE,es;q=0.9', 'Cookie': ck, ...headers },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        (res.headers['set-cookie'] || []).forEach(c => { const eq=c.indexOf('='),semi=c.indexOf(';'); if(eq>0) jar[c.substring(0,eq).trim()]=(semi>eq?c.substring(eq+1,semi):c.substring(eq+1)).trim(); });
        resolve({ status: res.statusCode, headers: res.headers, data: d });
      });
    });
    r.on('error', reject); r.end();
  });
}

function post(url, body, headers = {}, jar = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const ck = Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json, text/html, */*', 'Content-Type': 'application/json', 'Cookie': ck, 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
      rejectUnauthorized: false,
    };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: d }));
    });
    r.on('error', reject); r.write(bodyStr); r.end();
  });
}

async function run() {
  const PLACA = 'BAB215';
  
  // ── TEST 1: Portal consultasvehiculos.gob.pe ───────────────────────────────
  console.log('=== TEST 1: consultasvehiculos.gob.pe ===');
  try {
    const r = await get('https://consultasvehiculos.gob.pe/', {}, {});
    console.log('Status:', r.status, '| Size:', r.data.length);
    if (r.data.length > 100) {
      const $ = cheerio.load(r.data);
      console.log('Title:', $('title').text());
      $('script[src]').each((i,el) => console.log('  Script:', $(el).attr('src')));
      const inlineAjax = [];
      $('script:not([src])').each((i,el) => { const t=$(el).text(); if(t.includes('ajax')||t.includes('fetch')||t.includes('api')||t.includes('placa')) inlineAjax.push(t.substring(0,400)); });
      if(inlineAjax.length) console.log('Inline scripts:', inlineAjax);
    }
  } catch(e) { console.log('Error:', e.message); }
  
  // ── TEST 2: SUNARP API JSON para vehicular ─────────────────────────────────
  console.log('\n=== TEST 2: SUNARP endpoints ===');
  const sunarpEndpoints = [
    `https://www.sunarp.gob.pe/Servicios/Vehicular/ConsultaVehicular?placa=${PLACA}`,
    `https://www.sunarp.gob.pe/seccion/servicios/post/consulta-vehicular.html`,
    `https://serviciosweb.sunarp.gob.pe/SRVLIBRE/rest/vehiculo/consulta?placa=${PLACA}`,
    `https://serviciosweb.sunarp.gob.pe/SRVLIBRE/rest/vehiculo/placa/${PLACA}`,
  ];
  for (const ep of sunarpEndpoints) {
    try {
      const r = await get(ep, {'Accept': 'application/json, text/html, */*'});
      console.log(`${ep.replace('https://','').substring(0,65)} -> ${r.status} | ${r.data.substring(0,120).replace(/\n/g,' ')}`);
    } catch(e) { console.log(`${ep.replace('https://','').substring(0,65)} -> ERR: ${e.message}`); }
  }
  
  // ── TEST 3: GobPe servicios vehiculares ───────────────────────────────────
  console.log('\n=== TEST 3: Servicios gob.pe ===');
  const gobEndpoints = [
    `https://www.gob.pe/institucion/sunarp/servicios/vehicular`,
    `https://servicios.gob.pe/api/vehicular/${PLACA}`,
  ];
  for (const ep of gobEndpoints) {
    try {
      const r = await get(ep, {'Accept': 'application/json, text/html, */*'});
      console.log(`${ep.replace('https://','').substring(0,65)} -> ${r.status} | ${r.data.substring(0,120).replace(/\n/g,' ')}`);
    } catch(e) { console.log(`${ep.replace('https://','').substring(0,65)} -> ERR: ${e.message}`); }
  }
  
  // ── TEST 4: SUNARP consulta vehicular publica ──────────────────────────────
  console.log('\n=== TEST 4: SUNARP Consulta Vehicular publica ===');
  const jar4 = {};
  try {
    const r1 = await get('https://www.sunarp.gob.pe/seccion/servicios/post/consulta-vehicular.html', {}, jar4);
    console.log('Status:', r1.status, '| Size:', r1.data.length);
    if (r1.status === 200) {
      const $ = cheerio.load(r1.data);
      console.log('Title:', $('title').text());
      $('form').each((i,el) => console.log(`Form action: ${$(el).attr('action')}`));
      $('script:not([src])').each((i,el) => {
        const t = $(el).text();
        if (t.includes('placa') || t.includes('ajax') || t.includes('api')) console.log('Script inline:', t.substring(0,500));
      });
    }
  } catch(e) { console.log('Error:', e.message); }
  
  // ── TEST 5: MTC consulta vehicular externa ────────────────────────────────
  console.log('\n=== TEST 5: APIs alternativas vehiculares Peru ===');
  const altEndpoints = [
    `https://apiplaca.pe/api/v1/placa/${PLACA}`,
    `https://api.miplaca.pe/consulta/${PLACA}`,
    `https://consultaplaca.pe/api/placa/${PLACA}`,
  ];
  for (const ep of altEndpoints) {
    try {
      const r = await get(ep, {'Accept': 'application/json'});
      console.log(`${ep.replace('https://','').substring(0,60)} -> ${r.status} | ${r.data.substring(0,200).replace(/\n/g,' ')}`);
    } catch(e) { console.log(`${ep.replace('https://','').substring(0,60)} -> ERR: ${e.message}`); }
  }
}

run().catch(console.error);
