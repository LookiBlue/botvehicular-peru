// api/webhook.js
// Función principal de Vercel — Recibe todos los updates de Telegram
// Endpoint: POST /api/webhook

const { sendMessage, sendTyping } = require('../lib/telegram');
const { getOrCreateUser, deductCredit, getCachedVehicle, saveVehicleCache } = require('../lib/supabase');
const { consultarSAT }    = require('../lib/scrapers/sat');
const { consultarAPESEG } = require('../lib/scrapers/apeseg');
const { consultarMTC }    = require('../lib/scrapers/mtc');
const { calcularScore }   = require('../lib/score');

// Regex para detectar placa peruana válida en texto libre
const PLACA_REGEX = /^[A-Za-z]{3}[-]?\d{3}$|^[A-Za-z]{2}[-]?\d{4}$/;

// ─────────────────────────────────────────────────────────────────────────────
// FORMATEADOR DEL REPORTE
// ─────────────────────────────────────────────────────────────────────────────

function clasificarNivel(score) {
  if (score >= 80) return { emoji: '🟢', texto: 'BAJO RIESGO' };
  if (score >= 55) return { emoji: '🟡', texto: 'RIESGO MODERADO' };
  if (score >= 30) return { emoji: '🟠', texto: 'ALTO RIESGO' };
  return { emoji: '🔴', texto: 'MUY ALTO RIESGO' };
}

function formatearReporte(placa, sat, apeseg, mtc, scoreData, creditosRestantes) {
  const fecha = new Date().toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Lima',
  });

  const nivel  = scoreData.nivel;
  const llenas = Math.round(scoreData.score / 10);
  const vacias = 10 - llenas;
  const barra  = '🟩'.repeat(llenas) + '⬜'.repeat(vacias);

  // ── Sección SAT ─────────────────────────────────────────────────────────
  let satText;
  if (sat?.error) {
    satText = '⚠️ Servicio no disponible';
  } else if (sat.multas_impagas > 0) {
    satText = `🚨 ${sat.multas_impagas} multa(s) — Deuda: S/. ${Number(sat.deuda_total).toFixed(2)}`;
    if (sat.detalle_multas?.length > 0) {
      sat.detalle_multas.slice(0, 3).forEach(m => {
        satText += `\n     • ${m.descripcion || m.numero} S/. ${m.monto}`;
      });
    }
  } else {
    satText = '✅ Sin multas pendientes';
  }

  // ── Sección APESEG ───────────────────────────────────────────────────────
  let apesegText;
  if (apeseg?.error || apeseg?.soat_vigente === null) {
    apesegText = '⚠️ Servicio no disponible';
  } else if (apeseg.soat_vigente) {
    const vence = apeseg.fecha_vencimiento
      ? new Date(apeseg.fecha_vencimiento).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'N/D';
    apesegText = `✅ SOAT Vigente\n     Aseguradora: ${apeseg.aseguradora}\n     Vence: ${vence}`;
  } else {
    apesegText = '❌ Sin SOAT vigente';
  }

  // ── Sección MTC ──────────────────────────────────────────────────────────
  let mtcText;
  if (mtc?.error) {
    mtcText = '⚠️ Servicio no disponible';
  } else {
    const lineas = [];
    if (mtc.propietario && mtc.propietario !== 'No disponible') lineas.push(`👤 ${mtc.propietario}`);
    if (mtc.marca && mtc.marca !== 'No disponible') {
      lineas.push(`🚗 ${[mtc.marca, mtc.modelo, mtc.ano].filter(x => x && x !== 'No disponible').join(' ')}`);
    }
    if (mtc.color && mtc.color !== 'No disponible') lineas.push(`🎨 ${mtc.color}`);
    lineas.push(mtc.reportado_robado ? '🚨 REPORTADO COMO ROBADO' : '✅ Sin reporte de robo');
    lineas.push(mtc.revision_tecnica_vencida ? '❌ Revisión técnica VENCIDA' : '✅ Revisión técnica vigente');
    if (mtc.papeletas_pendientes > 0) lineas.push(`🚨 ${mtc.papeletas_pendientes} papeleta(s) pendiente(s)`);
    mtcText = lineas.join('\n     ');
  }

  // ── Penalizaciones ────────────────────────────────────────────────────────
  const penActivas = scoreData.penalizaciones.filter(p => p.puntos < 0);
  const penText = penActivas.length > 0
    ? '\n⚠️ Penalizaciones:\n' + penActivas.map(p => `   ${p.motivo} (${p.puntos} pts)`).join('\n') + '\n'
    : '';

  return `🚗 REPORTE VEHICULAR — Placa: ${placa.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━
🎯 Score de Riesgo: ${scoreData.score}/100 ${nivel.emoji} ${nivel.texto}
${barra}
${penText}
━━━━━━━━━━━━━━━━━━━━━━━
🏛️ SAT LIMA (Multas Adm.)
   ${satText}

🛡️ APESEG (SOAT)
   ${apesegText}

📋 MTC / SUNARP
   ${mtcText}
━━━━━━━━━━━━━━━━━━━━━━━
🕐 ${fecha} (Lima)
💳 Créditos restantes: ${creditosRestantes}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANEJADORES DE COMANDOS
// ─────────────────────────────────────────────────────────────────────────────

async function handleStart(chatId, user, telegramUser) {
  const nombre = telegramUser.first_name || 'amigo';
  await sendMessage(chatId,
    `🚗 Bienvenido al Bot Vehicular Perú, ${nombre}!\n\n` +
    `Tienes ${user.credits} consultas gratuitas para comenzar.\n\n` +
    `¿Cómo consultar?\n` +
    `/consulta ABC-123\n` +
    `O simplemente escribe la placa: ABC123\n\n` +
    `Comandos disponibles:\n` +
    `/consulta [PLACA] — Consultar un vehículo\n` +
    `/creditos — Ver tus créditos\n` +
    `/ayuda — Instrucciones\n\n` +
    `El reporte incluye: SAT Lima, SOAT, MTC/SUNARP y Score de Riesgo 🎯`
  );
}

async function handleCreditos(chatId, user) {
  await sendMessage(chatId,
    `💳 Tus Créditos\n\n` +
    `Tienes ${user.credits} consulta(s) disponible(s).\n` +
    `Cada consulta de placa consume 1 crédito.\n` +
    `Los resultados se guardan en caché 24 horas.`
  );
}

async function handleAyuda(chatId) {
  await sendMessage(chatId,
    `📖 Ayuda — Bot Vehicular Perú\n\n` +
    `Cómo hacer una consulta:\n` +
    `/consulta ABC-123\n` +
    `/consulta ABC123\n` +
    `O escribe la placa directamente.\n\n` +
    `Qué datos obtienes:\n` +
    `🏛️ Multas administrativas (SAT Lima)\n` +
    `🛡️ Estado del SOAT (APESEG)\n` +
    `📋 Papeletas de tránsito (MTC)\n` +
    `🚨 Reporte de robo (SUNARP/PNP)\n` +
    `🔧 Revisión técnica (MTC)\n` +
    `🎯 Score de Riesgo Vehicular (0-100)\n\n` +
    `Interpretación del Score:\n` +
    `🟢 80-100: Bajo Riesgo\n` +
    `🟡 55-79: Riesgo Moderado\n` +
    `🟠 30-54: Alto Riesgo\n` +
    `🔴 0-29: Muy Alto Riesgo\n\n` +
    `Los resultados se guardan 24h en caché.`
  );
}

async function handleConsulta(chatId, user, placaRaw, telegramId) {
  const placa = placaRaw.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!/^[A-Z]{3}\d{3}$/.test(placa) && !/^[A-Z]{2}\d{4}$/.test(placa)) {
    return sendMessage(chatId,
      '❌ Formato de placa inválido.\n\n' +
      'Ejemplos válidos:\n' +
      '/consulta ABC-123\n' +
      '/consulta AB1234'
    );
  }

  // Verificar caché primero
  try {
    const cached = await getCachedVehicle(placa);
    if (cached) {
      return sendMessage(chatId,
        formatearReporte(
          placa,
          cached.data_json.sat,
          cached.data_json.apeseg,
          cached.data_json.mtc,
          { score: cached.score, nivel: clasificarNivel(cached.score), penalizaciones: cached.data_json.penalizaciones || [] },
          user.credits
        ) + '\n\n📦 Resultado desde caché (menos de 24h)'
      );
    }
  } catch (_) { /* continuar si falla el caché */ }

  if (user.credits <= 0) {
    return sendMessage(chatId,
      '❌ Sin créditos disponibles.\n\nActualmente no tienes consultas disponibles.'
    );
  }

  // Notificar que está procesando
  await sendTyping(chatId);
  await sendMessage(chatId,
    `🔍 Consultando ${placa}...\n\n` +
    `Accediendo a:\n` +
    `• 🏛️ SAT Lima\n` +
    `• 🛡️ APESEG\n` +
    `• 📋 MTC / SUNARP\n\n` +
    `Esto toma unos segundos...`
  );

  // Consultar las 3 fuentes en paralelo
  const [sat, apeseg, mtc] = await Promise.all([
    consultarSAT(placa),
    consultarAPESEG(placa),
    consultarMTC(placa),
  ]);

  const scoreData = calcularScore(sat, apeseg, mtc);

  // Descontar crédito y guardar en caché
  try { await deductCredit(telegramId); } catch (_) {}
  const creditosRestantes = Math.max(0, user.credits - 1);

  try { await saveVehicleCache(placa, { sat, apeseg, mtc, penalizaciones: scoreData.penalizaciones }, scoreData.score); } catch (_) {}

  await sendMessage(chatId, formatearReporte(placa, sat, apeseg, mtc, scoreData, creditosRestantes));
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL DE VERCEL
// ─────────────────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, info: 'Bot Vehicular Peru activo' });
  }

  // Verificar token secreto del webhook
  const webhookSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (process.env.WEBHOOK_SECRET && webhookSecret !== process.env.WEBHOOK_SECRET) {
    console.error('[Webhook] Token secreto inválido recibido');
    return res.status(200).json({ ok: true });
  }

  let chatId = null;

  try {
    const update = req.body;
    const message = update?.message;

    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    chatId           = message.chat.id;
    const telegramId = message.from.id;
    const text       = message.text.trim();

    console.log(`[Webhook] Msg de ${telegramId}: ${text}`);

    // Obtener usuario con fallback si Supabase falla
    let user = { credits: 5, telegram_id: telegramId };
    try {
      user = await getOrCreateUser(telegramId, message.from.username);
    } catch (dbErr) {
      console.error('[Supabase] Error al obtener usuario:', dbErr.message);
    }

    // Router de comandos
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
      // Consulta directa escribiendo la placa sin comando
      await handleConsulta(chatId, user, text, telegramId);

    } else {
      await sendMessage(chatId,
        '❓ No entendí ese comando.\n\n' +
        'Escribe /ayuda para ver las opciones,\n' +
        'o simplemente escribe una placa como ABC-123.'
      );
    }

  } catch (err) {
    console.error('[Webhook] Error inesperado:', err.message, err.stack);
    if (chatId) {
      try {
        await sendMessage(chatId, '⚠️ Ocurrió un error interno. Por favor intenta nuevamente.');
      } catch (_) {}
    }
  }

  return res.status(200).json({ ok: true });
};
