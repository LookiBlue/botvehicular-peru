// scripts/test-scrapers.js
// Prueba los tres scrapers implementados
const { consultarSAT }    = require('../lib/scrapers/sat');
const { consultarAPESEG } = require('../lib/scrapers/apeseg');
const { consultarMTC }    = require('../lib/scrapers/mtc');

async function run() {
  const PLACA = 'BAB215';
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  PRUEBA DE SCRAPERS - PLACA: ${PLACA}`);
  console.log(`${'='.repeat(50)}\n`);
  
  // SAT Lima
  console.log('▶ [SAT Lima] Consultando...');
  const sat = await consultarSAT(PLACA);
  console.log('✅ SAT:', JSON.stringify(sat, null, 2));
  
  // APESEG
  console.log('\n▶ [APESEG] Consultando SOAT...');
  const apeseg = await consultarAPESEG(PLACA);
  console.log('✅ APESEG:', JSON.stringify(apeseg, null, 2));
  
  // MTC
  console.log('\n▶ [MTC] Consultando papeletas...');
  const mtc = await consultarMTC(PLACA);
  console.log('✅ MTC:', JSON.stringify(mtc, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('  RESUMEN');
  console.log('='.repeat(50));
  console.log(`SAT:    ${sat.ok ? '✅ OK' : '❌ Error'} | Multas: ${sat.multas_impagas} | Deuda: S/. ${sat.deuda_total}`);
  console.log(`APESEG: ${apeseg.ok ? '✅ OK' : '⚠️  No disponible'} | SOAT vigente: ${apeseg.soat_vigente}`);
  console.log(`MTC:    ${mtc.ok ? '✅ OK' : '⚠️  No disponible'} | Papeletas: ${mtc.papeletas_pendientes}`);
}

run().catch(console.error);
