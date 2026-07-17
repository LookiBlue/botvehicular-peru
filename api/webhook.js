// api/webhook.js
// Función principal de Vercel — Recibe todos los updates de Telegram
// Endpoint: POST /api/webhook

const { sendMessage, sendTyping } = require('../lib/telegram');
const { getOrCreateUser, deductCredit, getCachedVehicle, saveVehicleCache } = require('../lib/supabase');
const { consultarSAT }    = require('../lib/scrapers/sat');
const { consultarAPESEG } = require('../lib/scrapers/apeseg');
const { consultarMTC }    = require('../lib/scrapers/mtc');
const { calcularScore }   = require('../lib/score');

// ─────────────────────────────────────────────────────────────────────────────
// FORMATEADOR DEL REPORTE
// ─────────────────────────────────────────────────────────────────────────────

function formatearReporte(placa, sat, apeseg, mtc, scoreData, creditosRestantes) {
  const fecha = new Date().toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Lima',
  });

  const barraLlena  = Math.round(scoreData.score / 10);
  const barraVacia  = 10 - barraLlena;
  const barraVisual = '[' + '#'.repeat(barraLlena) + '-'.repeat(barraVacia) + ']';

  let satSeccion;
  if (sat?.error) {
    satSeccion = 'Servicio no disponible';
  } else {
    satSeccion = sat.multas_impagas > 0
      ? `${sat.multas_impagas} multa(s) impaga(s) | Deuda: S/. ${Number(sat.deuda_total).toFixed(2)}`
      : 'Sin multas pendientes';
  }

  let apesegSeccion;
  if (apeseg?.error || apeseg?.soat_vigente === null) {
    apesegSeccion = 'Servicio no disponible';
  } else if (apeseg.soat_vigente) {
    const vence = apeseg.fecha_vencimiento
      ? new Date(apeseg.fecha_vencimiento).toLocaleDateString('es-PE')
      : 'N/D';
    apesegSeccion = `SOAT Vigente | Aseguradora: ${apeseg.aseguradora} | Vence: ${vence}`;
  } else {
    apesegSeccion = 'Sin SOAT vigente';
  }

  let mtcSeccion;
  if (mtc?.error) {
    mtcSeccion = 'Servicio no disponible';
  } else {
    const lineas = [];
    if (mtc.propietario && mtc.propietario !== 'No disponible') lineas.push(`Propietario: ${mtc.propietario}`);
    if (mtc.marca && mtc.marca !== 'No disponible') lineas.push(`${mtc.marca} ${mtc.modelo} ${mtc.ano}`);
    lineas.push(mtc.reportado_robado ? 'REPORTADO COMO ROBADO' : 'Sin reporte de robo');
    lineas.push(mtc.revision_tecnica_vencida ? 'Revision tecnica VENCIDA' : 'Revision tecnica vigente');
    if (mtc.papeletas_pendientes > 0) lineas.push(`${mtc.papeletas_pendientes} papeleta(s) pendiente(s)`);
    mtcSeccion = lineas.join(' | ');
  }

  const nivel = scoreData.nivel;

  return `REPORTE VEHICULAR
========================
Placa: ${placa.toUpperCase()}
Score de Riesgo: ${scoreData.score}/100 ${nivel.emoji} ${nivel.texto}
${barraVisual}

SAT LIMA: ${satSeccion}

APESEG / SOAT: ${apesegSeccion}

MTC / SUNARP: ${mtcSeccion}

========================
Consulta: ${fecha} (Lima)
Creditos restantes: ${creditosRestantes}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANEJADORES DE COMANDOS
// ─────────────────────────────────────────────────────────────────────────────

async function handleStart(chatId, user, telegramUser) {
  const nombre = telegramUser.first_name || 'amigo';
  await sendMessage(chatId,
    `Bienvenido al Bot Vehicular Peru, ${nombre}!\n\n` +
    `Tienes ${user.credits} consultas gratuitas para comenzar.\n\n` +
    `Como consultar: /consulta ABC-123\n\n` +
    `Comandos disponibles:\n` +
    `/consulta [PLACA] - Consultar un vehiculo\n` +
    `/creditos - Ver tus creditos\n` +
    `/ayuda - Instrucciones`
  );
}

async function handleCreditos(chatId, user) {
  await sendMessage(chatId,
    `Tus Creditos\n\nTienes ${user.credits} consulta(s) disponible(s).\n\nCada consulta de placa consume 1 credito.`
  );
}

async function handleAyuda(chatId) {
  await sendMessage(chatId,
    `Ayuda - Bot Vehicular Peru\n\n` +
    `Como hacer una consulta:\n` +
    `/consulta ABC-123\n` +
    `/consulta ABC123\n\n` +
    `El bot acepta placas con o sin guion.\n\n` +
    `Que datos obtienes:\n` +
    `- Multas impagas (SAT Lima)\n` +
    `- Estado del SOAT (APESEG)\n` +
    `- Papeletas MTC\n` +
    `- Datos del propietario (SUNARP)\n` +
    `- Revision tecnica\n` +
    `- Score de Riesgo (0-100)\n\n` +
    `Los resultados se guardan 24 horas en cache.`
  );
}

async function handleConsulta(chatId, user, placaRaw, telegramId) {
  const placa = placaRaw.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!/^[A-Z]{3}\d{3}$/.test(placa) && !/^[A-Z]{2}\d{4}$/.test(placa)) {
    return sendMessage(chatId,
      'Formato de placa invalido.\nEjemplos validos:\n/consulta ABC-123\n/consulta AB1234'
    );
  }

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
      ) + '\n\n(Resultado desde cache - menos de 24h)'
    );
  }

  if (user.credits <= 0) {
    return sendMessage(chatId, 'Sin creditos disponibles. Actualmente no tienes consultas disponibles.');
  }

  await sendTyping(chatId);
  await sendMessage(chatId, `Consultando ${placa} en bases de datos...\nSAT Lima, APESEG y MTC/SUNARP\nEsto toma unos segundos...`);

  const [sat, apeseg, mtc] = await Promise.all([
    consultarSAT(placa),
    consultarAPESEG(placa),
    consultarMTC(placa),
  ]);

  const scoreData = calcularScore(sat, apeseg, mtc);

  await deductCredit(telegramId);
  const creditosRestantes = user.credits - 1;

  await saveVehicleCache(placa, { sat, apeseg, mtc, penalizaciones: scoreData.penalizaciones }, scoreData.score);

  await sendMessage(chatId, formatearReporte(placa, sat, apeseg, mtc, scoreData, creditosRestantes));
}

function clasificarNivel(score) {
  if (score >= 80) return { emoji: '(V)', texto: 'BAJO RIESGO' };
  if (score >= 55) return { emoji: '(!)', texto: 'RIESGO MODERADO' };
  if (score >= 30) return { emoji: '(!!)', texto: 'ALTO RIESGO' };
  return { emoji: '(X)', texto: 'MUY ALTO RIESGO' };
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
    console.error('[Webhook] Token secreto invalido recibido');
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

    console.log(`[Webhook] Mensaje de ${telegramId}: ${text}`);

    // Obtener usuario con fallback si Supabase falla
    let user = { credits: 5, telegram_id: telegramId };
    try {
      user = await getOrCreateUser(telegramId, message.from.username);
      console.log(`[Webhook] Usuario cargado: credits=${user.credits}`);
    } catch (dbErr) {
      console.error('[Supabase] Error al obtener usuario:', dbErr.message);
      // Continuar con usuario temporal para que /start y /ayuda funcionen igual
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
        await sendMessage(chatId, 'Debes indicar una placa. Ejemplo: /consulta ABC-123');
      } else {
        await handleConsulta(chatId, user, partes[1], telegramId);
      }

    } else {
      await sendMessage(chatId, 'No entendi ese comando. Escribe /ayuda para ver las opciones.');
    }

  } catch (err) {
    console.error('[Webhook] Error inesperado:', err.message);
    if (chatId) {
      try {
        await sendMessage(chatId, 'Ocurrio un error interno. Por favor intenta nuevamente en unos segundos.');
      } catch (_) { /* silencioso */ }
    }
  }

  return res.status(200).json({ ok: true });
};
