// lib/supabase.js
// Cliente de Supabase para gestión de caché y créditos de usuarios

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const FREE_CREDITS = parseInt(process.env.FREE_CREDITS || '5', 10);
const CACHE_HOURS  = parseInt(process.env.CACHE_HOURS  || '24', 10);

// ─────────────────────────────────────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene un usuario por su telegram_id.
 * Si no existe, lo crea con los créditos gratuitos iniciales.
 */
async function getOrCreateUser(telegramId, username) {
  // Buscar usuario existente
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (existing) return existing;

  // Crear usuario nuevo
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      username: username || null,
      credits: FREE_CREDITS,
    })
    .select()
    .single();

  if (error) throw new Error(`Error creando usuario: ${error.message}`);
  return newUser;
}

/**
 * Descuenta 1 crédito al usuario.
 * Retorna false si no tiene créditos suficientes.
 */
async function deductCredit(telegramId) {
  const user = await getOrCreateUser(telegramId);

  if (user.credits <= 0) return false;

  const { error } = await supabase
    .from('users')
    .update({ credits: user.credits - 1 })
    .eq('telegram_id', telegramId);

  if (error) throw new Error(`Error descontando crédito: ${error.message}`);
  return true;
}

/**
 * Agrega créditos a un usuario (para futura monetización).
 */
async function addCredits(telegramId, amount) {
  const { data: user } = await supabase
    .from('users')
    .select('credits')
    .eq('telegram_id', telegramId)
    .single();

  const { error } = await supabase
    .from('users')
    .update({ credits: (user?.credits || 0) + amount })
    .eq('telegram_id', telegramId);

  if (error) throw new Error(`Error agregando créditos: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHÉ DE VEHÍCULOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca un resultado cacheado para una placa.
 * Retorna null si no existe o si tiene más de CACHE_HOURS horas.
 */
async function getCachedVehicle(placa) {
  const placaNormalizada = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const { data } = await supabase
    .from('vehicle_cache')
    .select('*')
    .eq('placa', placaNormalizada)
    .single();

  if (!data) return null;

  // Verificar si el caché está vigente
  const horasTranscurridas = (Date.now() - new Date(data.queried_at).getTime()) / 3600000;
  if (horasTranscurridas > CACHE_HOURS) return null;

  return data;
}

/**
 * Guarda o actualiza el resultado de una consulta en caché.
 */
async function saveVehicleCache(placa, dataJson, score) {
  const placaNormalizada = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const { error } = await supabase
    .from('vehicle_cache')
    .upsert(
      {
        placa: placaNormalizada,
        data_json: dataJson,
        score: score,
        queried_at: new Date().toISOString(),
      },
      { onConflict: 'placa' }
    );

  if (error) throw new Error(`Error guardando caché: ${error.message}`);
}

module.exports = {
  getOrCreateUser,
  deductCredit,
  addCredits,
  getCachedVehicle,
  saveVehicleCache,
};
