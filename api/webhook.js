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

  // ── Barra de score visual ──────────────────────────────────────────────
  const barraLlena  = Math.round(scoreData.score / 10);
  const barraVacia  = 10 - barraLlena;
  const barraVisual = '█'.repeat(barraLlena) + '░'.repeat(barraVacia);

  // ── Sección SAT ────────────────────────────────────────────────────────
  let satSeccion;
  if (sat?.error) {
    satSeccion = `⚠️ _Servicio no disponible_`;
  } else {
    const multasStr = sat.multas_impagas > 0
      ? `❌ ${sat.multas_impagas} multa(s) impaga(s)\n  💰 Deuda: S/. ${Number(sat.deuda_total).toFixed(2)}`
      : `✅ Sin multas pendientes`;
    satSeccion = multasStr;
  }

  // ── Sección APESEG / SOAT ──────────────────────────────────────────────
  let apesegSeccion;
  if (apeseg?.error || apeseg?.soat_vigente === null) {
    apesegSeccion = `⚠️ _Servicio no disponible_`;
  } else if (apeseg.soat_vigente) {
    const vence = apeseg.fecha_vencimiento
      ? new Date(apeseg.fecha_vencimiento).toLocaleDateString('es-PE')
      : 'N/D';
    apesegSeccion = `✅ SOAT Vigente\n  🏢 Aseguradora: ${apeseg.aseguradora}\n  📅 Vence: ${vence}`;
  } else {
    apesegSeccion = `❌ Sin SOAT vigente`;
  }

  // ── Sección MTC ────────────────────────────────────────────────────────
  let mtcSeccion;
  if (mtc?.error) {
    mtcSeccion = `⚠️ _Servicio no disponible_`;
  } else {
    const lineas = [];
    if (mtc.propietario && mtc.propietario !== 'No disponible')
      lineas.push(`👤 Propietario: ${mtc.propietario}`);
    if (mtc.marca && mtc.marca !== 'No disponible')
      lineas.push(`🚙 ${mtc.marca} ${mtc.modelo} ${mtc.año}`);
    if (mtc.color && mtc.color !== 'No disponible')
      lineas.push(`🎨 Color: ${mtc.color}`);
    lineas.push(mtc.reportado_robado
      ? `🚨 REPORTADO COMO ROBADO`
      : `✅ Sin reporte de robo`);
    lineas.push(mtc.revision_tecnica_vencida
      ? `❌ Revisión técnica VENCIDA`
      : `✅ Revisión técnica vigente`);
    if (mtc.papeletas_pendientes > 0)
      lineas.push(`⚠️ ${mtc.papeletas_pendientes} papeleta(s) pendiente(s)`);
    mtcSeccion = lineas.join('\n  ');
  }

  // ── Penalizaciones ─────────────────────────────────────────────────────
  let penalizacionesStr = '';
  const penalizacionesReales = scoreData.penalizaciones.filter(p => p.puntos < 0);
  if (penalizacionesReales.length > 0) {
    penalizacionesStr = '\n\n⚠️ *Factores de riesgo:*\n' +
      penalizacionesReales.map(p => `  • ${p.motivo} (${p.puntos} pts)`).join('\n');
  }

  // ── Reporte final ──────────────────────────────────────────────────────
  return (
`🚗 *REPORTE VEHICULAR*
━━━━━━━━━━━━━━━━━━━━━━━
🔢 Placa: \`${placa.toUpperCase()}\`

📊 *Score de Riesgo: ${scoreData.score}/100* ${scoreData.nivel.emoji}
\`[${barraVisual}]\`
${scoreData.nivel.texto}${penalizacionesStr}

━━━━━━━━━━━━━━━━━━━━━━━
🏛️ *SAT LIMA*
  ${satSeccion}

🛡️ *APESEG / SOAT*
  ${apesegSeccion}

🏢 *MTC / SUNARP*
  ${mtcSeccion}

━━━━━━━━━━━━━━━━━━━━━━━
⏱ _Consulta: ${fecha} (Lima)_
💳 _Créditos restantes: ${creditosRestantes}_`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MANEJADORES DE COMANDOS
// ─────────────────────────────────────────────────────────────────────────────

async function handleStart(chatId, user, telegramUser) {
  const nombre = telegramUser.first_name || 'amigo';
  await sendMessage(chatId,
`🤖 *¡Bienvenido al Bot Vehicular Perú!*

Hola, *${nombre}*. Consulta el historial completo de cualquier vehículo peruano al instante.

🎁 Tienes *${user.credits} consultas gratuitas* para comenzar.

*¿Cómo consultar?*
Escribe: \`/consulta ABC-123\`

*Comandos disponibles:*
• \`/consulta [PLACA]\` — Consultar un vehículo
• \`/creditos\` — Ver tus créditos
• \`/ayuda\` — Instrucciones

_Los datos provienen de SAT Lima, APESEG y MTC en tiempo real._`
  );
}

async function handleCreditos(chatId, user) {
  await sendMessage(chatId,
`💳 *Tus Créditos*

Tienes *${user.credits} consulta(s)* disponible(s).

_Cada consulta de placa consume 1 crédito._`
  );
}

async function handleAyuda(chatId) {
  await sendMessage(chatId,
`❓ *Ayuda — Bot Vehicular Perú*

*¿Cómo hacer una consulta?*
Escribe el comando seguido de la placa:
\`/consulta ABC-123\`
\`/consulta ABC123\`

El bot acepta placas con o sin guión.

*¿Qué datos obtengo?*
✅ Multas impagas (SAT Lima)
✅ Estado del SOAT (APESEG)
✅ Papeletas MTC
✅ Datos del propietario (SUNARP)
✅ Revisión técnica
✅ Reporte de robo (PNP)
✅ Score de Riesgo (0-100)

*¿Por qué no aparecen todos los datos?*
Algunos servicios del gobierno pueden estar temporalmente fuera de línea.

*¿Cuánto dura el caché?*
Los resultados se guardan 24 horas. Si consultas la misma placa antes de ese tiempo, no se gasta un crédito adicional.`
  );
}

async function handleConsulta(chatId, user, placaRaw, telegramId) {
  // Normalizar placa: quitar espacios, guiones, convertir a mayúsculas
  const placa = placaRaw.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Validar formato de placa peruana (3 letras + 3 números, o formato antiguo)
  if (!/^[A-Z]{3}\d{3}$/.test(placa) && !/^[A-Z]{2}\d{4}$/.test(placa)) {
    return sendMessage(chatId,
      `❌ *Formato de placa inválido*\n\nEjemplos válidos:\n• \`/consulta ABC-123\`\n• \`/consulta AB1234\``
    );
  }

  // ── Verificar caché primero ──────────────────────────────────────────
  const cached = await getCachedVehicle(placa);
  if (cached) {
    const creditos = user.credits;
    return sendMessage(chatId,
      formatearReporte(
        placa,
        cached.data_json.sat,
        cached.data_json.apeseg,
        cached.data_json.mtc,
        { score: cached.score, nivel: clasificarNivelExportado(cached.score), penalizaciones: cached.data_json.penalizaciones || [] },
        creditos
      ) + '\n\n_📦 Resultado desde caché (< 24h)_'
    );
  }

  // ── Verificar créditos ───────────────────────────────────────────────
  if (user.credits <= 0) {
    return sendMessage(chatId,
      `❌ *Sin créditos disponibles*\n\nNo tienes consultas disponibles.\n\n_Próximamente: recarga de créditos._`
    );
  }

  // ── Indicador de progreso ────────────────────────────────────────────
  await sendTyping(chatId);
  await sendMessage(chatId,
    `🔍 Consultando \`${placa}\` en bases de datos...\n_SAT Lima · APESEG · MTC/SUNARP_\n\n⏳ Esto toma unos segundos...`
  );

  // ── Consultas en paralelo ────────────────────────────────────────────
  const [sat, apeseg, mtc] = await Promise.all([
    consultarSAT(placa),
    consultarAPESEG(placa),
    consultarMTC(placa),
  ]);

  // ── Calcular score ───────────────────────────────────────────────────
  const scoreData = calcularScore(sat, apeseg, mtc);

  // ── Descontar crédito ────────────────────────────────────────────────
  await deductCredit(telegramId);
  const creditosRestantes = user.credits - 1;

  // ── Guardar en caché ─────────────────────────────────────────────────
  await saveVehicleCache(placa, { sat, apeseg, mtc, penalizaciones: scoreData.penalizaciones }, scoreData.score);

  // ── Enviar reporte ───────────────────────────────────────────────────
  await sendMessage(chatId, formatearReporte(placa, sat, apeseg, mtc, scoreData, creditosRestantes));
}

// Helper exportable para el caché
function clasificarNivelExportado(score) {
  if (score >= 80) return { emoji: '🟢', texto: 'BAJO RIESGO' };
  if (score >= 55) return { emoji: '🟡', texto: 'RIESGO MODERADO' };
  if (score >= 30) return { emoji: '🟠', texto: 'ALTO RIESGO' };
  return { emoji: '🔴', texto: 'MUY ALTO RIESGO' };
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL DE VERCEL
// ─────────────────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Solo aceptar POST (los updates de Telegram)
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, info: 'Bot Vehicular Peru activo' });
  }

  // Verificar el token secreto del webhook (seguridad)
  const webhookSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (process.env.WEBHOOK_SECRET && webhookSecret !== process.env.WEBHOOK_SECRET) {
    console.error('[Webhook] Token secreto inválido:', webhookSecret);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── IMPORTANTE: Procesar ANTES de responder ──────────────────────────────
  // En Vercel Serverless, res.json() termina la ejecución de la función.
  // Todo el procesamiento async debe completarse ANTES de enviar el 200.
  try {
    const update = req.body;
    console.log('[Webhook] Update recibido:', JSON.stringify(update).slice(0, 200));

    const message = update?.message;

    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId     = message.chat.id;
    const telegramId = message.from.id;
    const text       = message.text.trim();

    console.log(`[Webhook] Mensaje de ${telegramId}: ${text}`);

    // Registrar o recuperar usuario
    const user = await getOrCreateUser(telegramId, message.from.username);
    console.log('[Webhook] Usuario:', user);

    // ── Router de comandos ──────────────────────────────────────────────
    if (text === '/start' || text.startsWith('/start ')) {
      await handleStart(chatId, user, message.from);

    } else if (text === '/creditos') {
      await handleCreditos(chatId, user);

    } else if (text === '/ayuda' || text === '/help') {
      await handleAyuda(chatId);

    } else if (text.startsWith('/consulta')) {
      const partes = text.split(/\s+/);
      if (partes.length < 2) {
        await sendMessage(chatId, `❌ Debes indicar una placa.\nEjemplo: \`/consulta ABC-123\``);
      } else {
        await handleConsulta(chatId, user, partes[1], telegramId);
      }

    } else {
      await sendMessage(chatId,
        `No entendí ese comando. Escribe /ayuda para ver las opciones disponibles.`
      );
    }
  } catch (err) {
    console.error('[Webhook] Error inesperado:', err.message, err.stack);
    // No relanzar el error — siempre responder 200 a Telegram para evitar reintentos
  }

  // Responder 200 al FINAL, después de procesar todo
  return res.status(200).json({ ok: true });
};
