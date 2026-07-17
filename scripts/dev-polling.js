// scripts/dev-polling.js
// Este script permite probar tu bot de Vercel localmente usando Long Polling.
// Recibe los mensajes de Telegram y los pasa a tu api/webhook.js simulando a Vercel.

require('dotenv').config();
const axios = require('axios');
const webhookHandler = require('../api/webhook');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN || TOKEN === 'TU_TOKEN_AQUI') {
  console.error('❌ ERROR: Debes configurar TELEGRAM_BOT_TOKEN en tu archivo .env');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
let lastUpdateId = 0;

console.log('🚗 Iniciando Bot Vehicular en modo local (Polling)...');
console.log('Esperando mensajes en Telegram...\n');

async function getUpdates() {
  try {
    const response = await axios.get(`${TELEGRAM_API}/getUpdates`, {
      params: {
        offset: lastUpdateId + 1,
        timeout: 30, // Long polling
      }
    });

    const updates = response.data.result;

    for (const update of updates) {
      lastUpdateId = update.update_id;
      
      if (update.message) {
        console.log(`\n💬 Mensaje recibido de @${update.message.from.username || update.message.from.first_name}: ${update.message.text}`);
      }

      // Simulamos los objetos 'req' y 'res' de Vercel (Next.js / Express)
      const req = {
        method: 'POST',
        headers: {},
        body: update
      };

      const res = {
        status: (code) => ({
          json: (data) => {
            // Silenciamos la respuesta OK para no ensuciar la consola
          }
        })
      };

      // Pasamos el mensaje a nuestro webhook real
      await webhookHandler(req, res);
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.error('❌ ERROR: El Token de Telegram es inválido.');
      process.exit(1);
    }
    // Ignorar timeouts de red
    if (error.code !== 'ECONNABORTED' && error.code !== 'ETIMEDOUT') {
      console.error('⚠️ Error de conexión:', error.message);
    }
  }

  // Bucle infinito
  setTimeout(getUpdates, 1000);
}

// Asegurarnos de que no haya un Webhook activo en Telegram que interfiera con el polling
axios.post(`${TELEGRAM_API}/deleteWebhook`).then(() => {
  getUpdates();
}).catch(err => {
  console.error('Error limpiando webhook previo:', err.message);
  getUpdates();
});
