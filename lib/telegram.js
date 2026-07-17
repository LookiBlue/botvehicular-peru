// lib/telegram.js
// Helper para enviar mensajes y acciones a la API de Telegram

const axios = require('axios');

const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/**
 * Envía un mensaje de texto a un chat.
 * Soporta formato Markdown v2.
 */
async function sendMessage(chatId, text, extra = {}) {
  try {
    await axios.post(`${BASE_URL}/sendMessage`, {
      chat_id: chatId,
      text: text,
      // Sin parse_mode por defecto: evita errores silenciosos con caracteres especiales
      ...extra,
    });
  } catch (err) {
    console.error('[Telegram] Error enviando mensaje:', err.response?.data || err.message);
  }
}

/**
 * Muestra el indicador "escribiendo..." al usuario.
 */
async function sendTyping(chatId) {
  try {
    await axios.post(`${BASE_URL}/sendChatAction`, {
      chat_id: chatId,
      action: 'typing',
    });
  } catch (_) {
    // Silencioso — no es crítico
  }
}

/**
 * Edita un mensaje ya enviado (útil para actualizaciones de progreso).
 */
async function editMessage(chatId, messageId, text) {
  try {
    await axios.post(`${BASE_URL}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('[Telegram] Error editando mensaje:', err.response?.data || err.message);
  }
}

/**
 * Registra el webhook de Telegram apuntando a la URL de Vercel.
 * Llama a esta función una sola vez después del deploy.
 */
async function setWebhook(webhookUrl, secret) {
  const res = await axios.post(`${BASE_URL}/setWebhook`, {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
  });
  return res.data;
}

module.exports = { sendMessage, sendTyping, editMessage, setWebhook };
