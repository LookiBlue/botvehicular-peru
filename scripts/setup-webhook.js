// scripts/setup-webhook.js
// Ejecutar UNA SOLA VEZ después del deploy en Vercel para registrar el webhook.
//
// USO:
//   node scripts/setup-webhook.js https://TU-PROYECTO.vercel.app
//
// Este script le dice a Telegram que envíe todos los updates a tu URL de Vercel.

require('dotenv').config();
const { setWebhook } = require('../lib/telegram');

async function main() {
  const vercelUrl = process.argv[2];

  if (!vercelUrl) {
    console.error('❌ Debes pasar la URL de Vercel como argumento.');
    console.error('   Uso: node scripts/setup-webhook.js https://mi-bot.vercel.app');
    process.exit(1);
  }

  const webhookUrl = `${vercelUrl}/api/webhook`;
  const secret     = process.env.WEBHOOK_SECRET;

  console.log(`⚙️  Registrando webhook en Telegram...`);
  console.log(`   URL: ${webhookUrl}`);

  const result = await setWebhook(webhookUrl, secret);
  console.log(`✅ Respuesta de Telegram:`, JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
