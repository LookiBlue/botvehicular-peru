// api/webhook.js
// Bot Vehicular Perú — Webhook principal Vercel
// Consulta 5 fuentes: SAT Lima, APESEG, MTC, SUNARP, SUTRAN

const { sendMessage, sendTyping } = require('../lib/telegram');
const { getOrCreateUser, deductCredit, getCachedVehicle, saveVehicleCache } = require('../lib/supabase');
const { consultarSAT }    = require('../lib/scrapers/sat');
const { consultarAPESEG } = require('../lib/scrapers/apeseg');
const { consultarMTC }    = require('../lib/scrapers/mtc');
const { consultarSUNARP } = require('../lib/scrapers/sunarp');
const { consultarSUTRAN } = require('../lib/scrapers/sutran');
const { calcularScore }   = require('../lib/score');

// Regex para detectar placa peruana válida en texto libre
const PLACA_REGEX = /^[A-Za-z]{3}[-]?\d{3}$|^[A-Za-z]{2}[-]?\d{4}$/;

// ─────────────────────────────────────────────────────────────────────────────
// FORMATEADOR DEL REPORTE COMPLETO
// ─────────────────────────────────────────────────────────────────────────────

function clasificarNivel(score) {
  if (score >= 80) return { emoji: '🟢', texto: 'BAJO RIESGO' };
  if (score >= 55) return { emoji: '🟡', texto: 'RIESGO MODERADO' };
  if (score >= 30) return { emoji: '🟠', texto: 'ALTO RIESGO' };
  return { emoji: '🔴', texto: 'MUY ALTO RIESGO' };
}

function formatearReporte(placa, sat, apeseg, mtc, sunarp, sutran, scoreData, creditosRestantes) {
  const fecha = new Date().toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Lima',
  });

  const nivel  = scoreData.nivel;
  const llenas = Math.round(scoreData.score / 10);
  const barra  = '🟩'.repeat(llenas) + '⬜'.repeat(10 - llenas);

  // ── SUNARP — Datos del Vehículo ──────────────────────────────────────────
  let vehiculoSection;
  if (sunarp?.error || !sunarp) {
    vehiculoSection = '⚠️ No disponible';
  } else {
    const lineas = [];
    // Propietarios (nuevo formato: array)
    if (sunarp.propietarios && sunarp.propietarios.length > 0) {
      lineas.push(`👤 Propietario: ${sunarp.propietarios[0]}`);
      if (sunarp.propietarios.length > 1) {
        lineas.push(`🔄 Titulares anteriores: ${sunarp.propietarios.length - 1}`);
      }
    }
    // Datos del vehículo (nuevo formato: objeto vehiculo)
    const v = sunarp.vehiculo || {};
    if (v.marca && v.marca !== 'N/D') lineas.push(`🚗 ${[v.marca, v.modelo].filter(x => x && x !== 'N/D').join(' ')}`);
    if (v.color && v.color !== 'N/D') lineas.push(`🎨 Color: ${v.color}`);
    if (v.motor && v.motor !== 'N/D') lineas.push(`⚙️ Motor: ${v.motor}`);
    if (v.vin && v.vin !== 'N/D') lineas.push(`🔢 VIN/Serie: ${v.vin}`);
    if (v.estado && v.estado !== 'N/D') lineas.push(`📌 Estado: ${v.estado}`);
    if (v.anotaciones && v.anotaciones !== 'Ninguna') lineas.push(`📄 Anotaciones: ${v.anotaciones}`);
    if (v.robo && v.robo !== 'No registra') lineas.push(`🚨 ALERTA ROBO: ${v.robo}`);
    if (sunarp.sede && sunarp.sede !== 'N/D') lineas.push(`🏛️ Sede SUNARP: ${sunarp.sede}`);
    vehiculoSection = lineas.length > 0 ? lineas.join('\n   ') : '⚠️ Sin datos disponibles';
  }

  // ── SAT Lima — Multas Administrativas ────────────────────────────────────
  let satSection;
  if (sat?.error) {
    satSection = '⚠️ No disponible';
  } else if (sat.multas_impagas > 0) {
    satSection = `🚨 ${sat.multas_impagas} multa(s) impaga(s)\n   💰 Deuda total: S/. ${Number(sat.deuda_total).toFixed(2)}`;
    if (sat.detalle_multas?.length > 0) {
      sat.detalle_multas.slice(0, 3).forEach(m => {
        satSection += `\n   • ${m.descripcion || m.numero} — S/. ${m.monto}`;
      });
    }
  } else {
    satSection = '✅ Sin multas en Lima';
  }

  // ── SUTRAN — Infracciones Nacionales ─────────────────────────────────────
  let sutranSection;
  if (sutran?.error || !sutran) {
    sutranSection = '⚠️ No disponible';
  } else if (sutran.infracciones > 0) {
    sutranSection = `🚨 ${sutran.infracciones} infracción(es) nacional(es)\n   💰 Monto: S/. ${Number(sutran.monto_total).toFixed(2)}`;
    if (sutran.detalle?.length > 0) {
      sutran.detalle.slice(0, 2).forEach(d => {
        sutranSection += `\n   • ${d.descripcion || 'Infracción'} — ${d.fecha}`;
      });
    }
  } else {
    sutranSection = '✅ Sin infracciones nacionales (SUTRAN)';
  }

  // ── APESEG — SOAT ────────────────────────────────────────────────────────
  let apesegSection;
  if (apeseg?.error || apeseg?.soat_vigente === null) {
    apesegSection = '⚠️ No disponible';
  } else if (apeseg.soat_vigente) {
    const vence = apeseg.fecha_vencimiento
      ? new Date(apeseg.fecha_vencimiento).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'N/D';
    apesegSection = `✅ SOAT Vigente\n   Aseguradora: ${apeseg.aseguradora}\n   Vence: ${vence}`;
  } else {
    apesegSection = '❌ Sin SOAT vigente';
  }

  // ── MTC — Papeletas y Revisión Técnica ───────────────────────────────────
  let mtcSection;
  if (mtc?.error) {
    mtcSection = '⚠️ No disponible';
  } else {
    const lineas = [];
    lineas.push(mtc.reportado_robado ? '🚨 REPORTADO COMO ROBADO' : '✅ Sin reporte de robo');
    lineas.push(mtc.revision_tecnica_vencida ? '❌ Revisión técnica VENCIDA' : '✅ Revisión técnica vigente');
    if (mtc.papeletas_pendientes > 0) lineas.push(`🚨 ${mtc.papeletas_pendientes} papeleta(s) pendiente(s)`);
    mtcSection = lineas.join('\n   ');
  }

  // ── Penalizaciones del Score ──────────────────────────────────────────────
  const penActivas = scoreData.penalizaciones?.filter(p => p.puntos < 0) || [];
  const penSection = penActivas.length > 0
    ? penActivas.map(p => `   ⚠️ ${p.motivo} (${p.puntos} pts)`).join('\n') + '\n'
    : '';

  return `🚗 REPORTE VEHICULAR PERU
Placa: ${placa.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━
🎯 Score de Riesgo: ${scoreData.score}/100 ${nivel.emoji} ${nivel.texto}
${barra}
${penSection}
🏛️ DATOS DEL VEHICULO (SUNARP)
   ${vehiculoSection}

🏙️ SAT LIMA (Multas Municipales)
   ${satSection}

🛣️ SUTRAN (Infracciones Nacionales)
   ${sutranSection}

🛡️ SOAT — APESEG
   ${apesegSection}

📋 MTC (Papeletas / Robo / Tec.)
   ${mtcSection}
━━━━━━━━━━━━━━━━━━━━━━━━
📅 ${fecha} (Lima)
💳 Créditos restantes: ${creditosRestantes}

💡 Para compra/venta de autos usa /ayuda`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER DE CONSULTA
// ─────────────────────────────────────────────────────────────────────────────

async function handleStart(chatId, user, telegramUser) {
  const nombre = telegramUser.first_name || 'amigo';
  await sendMessage(chatId,
    `🚗 Bienvenido al Bot Vehicular Perú, ${nombre}!\n\n` +
    `Tienes ${user.credits} consultas gratuitas.\n\n` +
    `Como consultar:\n` +
    `/consulta ABC-123\n` +
    `O escribe la placa directamente: ABC123\n\n` +
    `El informe incluye:\n` +
    `🏛️ Datos del vehículo (SUNARP)\n` +
    `👤 Propietario y nro. de dueños\n` +
    `🔒 Gravámenes y embargos\n` +
    `🏙️ Multas SAT Lima\n` +
    `🛣️ Infracciones SUTRAN (nacional)\n` +
    `🛡️ SOAT vigente (APESEG)\n` +
    `🚨 Reporte de robo (PNP/MTC)\n` +
    `🔧 Revisión técnica\n` +
    `🎯 Score de Riesgo Vehicular\n\n` +
    `Comandos:\n` +
    `/consulta [PLACA]\n` +
    `/creditos\n` +
    `/ayuda`
  );
}

async function handleCreditos(chatId, user) {
  await sendMessage(chatId,
    `💳 Tus Créditos\n\n` +
    `Tienes ${user.credits} consulta(s) disponible(s).\n` +
    `Cada consulta consume 1 crédito.\n` +
    `Los resultados se guardan 24h en caché.`
  );
}

async function handleAyuda(chatId) {
  await sendMessage(chatId,
    `📖 Ayuda — Bot Vehicular Perú\n\n` +
    `COMO USAR:\n` +
    `/consulta ABC-123\n` +
    `O simplemente escribe la placa.\n\n` +
    `QUE INCLUYE EL REPORTE:\n` +
    `🏛️ Datos SUNARP: propietario, nro de dueños anteriores, marca, modelo, año, color, motor, serie\n` +
    `🔒 Gravámenes y embargos activos\n` +
    `🏙️ Multas SAT Lima (municipales)\n` +
    `🛣️ Infracciones SUTRAN a nivel nacional\n` +
    `🛡️ Estado del SOAT (APESEG)\n` +
    `🚨 Reporte de robo (PNP)\n` +
    `🔧 Revisión técnica vehicular\n` +
    `🎯 Score de Riesgo (0-100)\n\n` +
    `PARA COMPRA DE VEHICULOS:\n` +
    `Verifica que no tenga gravámenes, embargos, multas ni robo reportado antes de comprar.\n\n` +
    `SCORE DE RIESGO:\n` +
    `🟢 80-100: Bajo Riesgo\n` +
    `🟡 55-79: Riesgo Moderado\n` +
    `🟠 30-54: Alto Riesgo\n` +
    `🔴 0-29: Muy Alto Riesgo`
  );
}

async function handleConsulta(chatId, user, placaRaw, telegramId) {
  const placa = placaRaw.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!/^[A-Z]{3}\d{3}$/.test(placa) && !/^[A-Z]{2}\d{4}$/.test(placa)) {
    return sendMessage(chatId,
      '❌ Formato de placa invalido.\n\n' +
      'Ejemplos validos:\n' +
      '/consulta ABC-123\n' +
      '/consulta AB1234'
    );
  }

  // Verificar caché
  try {
    const cached = await getCachedVehicle(placa);
    if (cached) {
      return sendMessage(chatId,
        formatearReporte(
          placa,
          cached.data_json.sat,
          cached.data_json.apeseg,
          cached.data_json.mtc,
          cached.data_json.sunarp,
          cached.data_json.sutran,
          { score: cached.score, nivel: clasificarNivel(cached.score), penalizaciones: cached.data_json.penalizaciones || [] },
          user.credits
        ) + '\n\n📦 Desde cache (menos de 24h)'
      );
    }
  } catch (_) {}

  if (user.credits <= 0) {
    return sendMessage(chatId, '❌ Sin creditos disponibles.');
  }

  // Notificar que está procesando
  await sendTyping(chatId);
  await sendMessage(chatId,
    `🔍 Consultando ${placa}...\n\n` +
    `Accediendo a:\n` +
    `🏛️ SUNARP (propietario/datos)\n` +
    `🏙️ SAT Lima (multas)\n` +
    `🛣️ SUTRAN (infracciones nac.)\n` +
    `🛡️ APESEG (SOAT)\n` +
    `📋 MTC (papeletas/robo)\n\n` +
    `Esto toma unos segundos...`
  );

  // Consultar las 5 fuentes en paralelo
  const [sat, apeseg, mtc, sunarp, sutran] = await Promise.all([
    consultarSAT(placa),
    consultarAPESEG(placa),
    consultarMTC(placa),
    consultarSUNARP(placa),
    consultarSUTRAN(placa),
  ]);

  const scoreData = calcularScore(sat, apeseg, mtc, sutran, sunarp);

  // Descontar crédito y guardar caché
  try { await deductCredit(telegramId); } catch (_) {}
  const creditosRestantes = Math.max(0, user.credits - 1);
  try {
    await saveVehicleCache(placa, { sat, apeseg, mtc, sunarp, sutran, penalizaciones: scoreData.penalizaciones }, scoreData.score);
  } catch (_) {}

  await sendMessage(chatId, formatearReporte(placa, sat, apeseg, mtc, sunarp, sutran, scoreData, creditosRestantes));
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL VERCEL
// ─────────────────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, info: 'Bot Vehicular Peru activo v2' });
  }

  const webhookSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (process.env.WEBHOOK_SECRET && webhookSecret !== process.env.WEBHOOK_SECRET) {
    return res.status(200).json({ ok: true });
  }

  let chatId = null;

  try {
    const update = req.body;
    const message = update?.message;
    if (!message || !message.text) return res.status(200).json({ ok: true });

    chatId           = message.chat.id;
    const telegramId = message.from.id;
    const text       = message.text.trim();

    console.log(`[Webhook] ${telegramId}: ${text}`);

    let user = { credits: 5, telegram_id: telegramId };
    try { user = await getOrCreateUser(telegramId, message.from.username); } catch (_) {}

    // Router
    if (text === '/start' || text.startsWith('/start ')) {
      await handleStart(chatId, user, message.from);
    } else if (text === '/creditos') {
      await handleCreditos(chatId, user);
    } else if (text === '/ayuda' || text === '/help') {
      await handleAyuda(chatId);
    } else if (text.startsWith('/consulta')) {
      const partes = text.split(/\s+/);
      if (partes.length < 2) {
        await sendMessage(chatId, '❌ Debes indicar una placa.\nEjemplo: /consulta ABC-123');
      } else {
        await handleConsulta(chatId, user, partes[1], telegramId);
      }
    } else if (PLACA_REGEX.test(text.replace(/-/g, ''))) {
      // Consulta directa sin comando
      await handleConsulta(chatId, user, text, telegramId);
    } else {
      await sendMessage(chatId,
        '❓ No entendi ese comando.\nEscribe /ayuda o simplemente la placa: ABC-123'
      );
    }

  } catch (err) {
    console.error('[Webhook] Error:', err.message, err.stack);
    if (chatId) {
      try { await sendMessage(chatId, '⚠️ Error interno. Intenta nuevamente.'); } catch (_) {}
    }
  }

  return res.status(200).json({ ok: true });
};
