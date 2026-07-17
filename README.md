# 🚗 Bot Vehicular Perú

Bot de Telegram serverless que consulta el historial completo de vehículos peruanos en tiempo real.

**Stack:** Vercel Serverless Functions + Supabase + Telegram Bot API

---

## 🛠️ Instalación paso a paso

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
copy .env.example .env
```

Edita `.env` con tus credenciales:

| Variable | Dónde obtenerla |
|---|---|
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/newbot` → token |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → `anon public` |
| `WEBHOOK_SECRET` | Genera uno: `openssl rand -hex 32` |

### 3. Crear tablas en Supabase

1. Entra a [supabase.com](https://supabase.com) → tu proyecto → **SQL Editor**
2. Copia y pega el contenido de `supabase_schema.sql`
3. Clic en **Run** ✅

### 4. Deploy en Vercel

```bash
npm run deploy
```

Copia la URL que te da Vercel (ejemplo: `https://botvehicular.vercel.app`)

### 5. Registrar el Webhook

```bash
node scripts/setup-webhook.js https://botvehicular.vercel.app
```

Solo necesitas hacer esto una vez.

---

## 🔄 Completar los Scrapers (F12)

Los scrapers en `lib/scrapers/` tienen endpoints placeholder. Para completarlos:

1. Abre la web objetivo en Chrome (SAT / APESEG / MTC)
2. Presiona **F12** → pestaña **Network** → filtro **Fetch/XHR**
3. Realiza una consulta en la web
4. Busca la petición que retorna los datos del vehículo
5. Clic derecho → **Copy as cURL** o anota la URL y Headers
6. Reemplaza `ENDPOINT` y `HEADERS` en el scraper correspondiente

---

## 📁 Estructura del Proyecto

```
BOTVEHICULAR/
├── api/
│   └── webhook.js          ← Función principal de Vercel
├── lib/
│   ├── telegram.js         ← Helper Telegram API
│   ├── supabase.js         ← Caché y créditos
│   ├── score.js            ← Calculadora de riesgo
│   └── scrapers/
│       ├── sat.js          ← Multas SAT Lima
│       ├── apeseg.js       ← SOAT APESEG
│       └── mtc.js          ← MTC / SUNARP
├── scripts/
│   └── setup-webhook.js    ← Registra el webhook (1 vez)
├── supabase_schema.sql     ← SQL para crear las tablas
├── .env.example            ← Template de variables
├── vercel.json             ← Configuración Vercel
└── package.json
```

---

## 💬 Comandos del Bot

| Comando | Descripción |
|---|---|
| `/start` | Bienvenida + créditos gratis |
| `/consulta ABC-123` | Consultar placa (gasta 1 crédito) |
| `/creditos` | Ver créditos disponibles |
| `/ayuda` | Instrucciones |

---

## 💡 Variables de Entorno en Vercel (Producción)

En el dashboard de Vercel → tu proyecto → **Settings → Environment Variables**, agrega:
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `WEBHOOK_SECRET`
- `FREE_CREDITS` = `5`
- `CACHE_HOURS` = `24`
