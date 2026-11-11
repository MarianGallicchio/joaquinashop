import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

/* Cargador de .env sin dependencias externas. No pisa variables ya definidas. */
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnv();

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const str = (value, fallback = "") => (value && String(value).trim()) || fallback;
const bool = (value, fallback = false) =>
  value === undefined || value === null || String(value).trim() === ""
    ? fallback
    : String(value).trim().toLowerCase() === "true";

function jsonEnv(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    console.warn("[config] JSON inválido en variable de entorno; se usa el valor por defecto.");
    return fallback;
  }
}

const nodeEnv = str(process.env.NODE_ENV, "development");
const cjApiKey = str(process.env.CJ_API_KEY);
const demoRaw = str(process.env.DEMO_MODE, "auto").toLowerCase();

export const config = {
  port: num(process.env.PORT, 4173),
  baseUrl: str(process.env.BASE_URL, `http://localhost:${num(process.env.PORT, 4173)}`).replace(/\/$/, ""),
  env: nodeEnv,

  store: {
    name: str(process.env.STORE_NAME, "La Joaquina"),
    email: str(process.env.STORE_EMAIL, "hola@lajoaquina.shop"),
    whatsapp: str(process.env.WHATSAPP, "5491126730077"),
    instagram: "@lajoaquina.shop",
    freeShippingThreshold: num(process.env.FREE_SHIPPING_THRESHOLD, 80000),
    arsPerUsd: num(process.env.ARS_PER_USD, 1250),
    currency: "ARS",
  },

  security: {
    adminPassword: str(process.env.ADMIN_PASSWORD, "lajoaquina2026"),
    sessionSecret: str(process.env.SESSION_SECRET, "dev-secret-no-usar-en-produccion"),
    adminTokenTtlMs: 8 * 60 * 60 * 1000,
    /* auto = demo en desarrollo, apagado en producción; true/false fuerzan el modo. */
    demoMode: demoRaw === "auto" ? nodeEnv !== "production" : demoRaw === "true",
  },

  payments: {
    mercadopago: {
      accessToken: str(process.env.MP_ACCESS_TOKEN),
      publicKey: str(process.env.MP_PUBLIC_KEY),
      webhookSecret: str(process.env.MP_WEBHOOK_SECRET),
    },
    stripe: {
      secretKey: str(process.env.STRIPE_SECRET_KEY),
      webhookSecret: str(process.env.STRIPE_WEBHOOK_SECRET),
    },
    paypal: {
      clientId: str(process.env.PAYPAL_CLIENT_ID),
      secret: str(process.env.PAYPAL_SECRET),
      webhookId: str(process.env.PAYPAL_WEBHOOK_ID),
      mode: str(process.env.PAYPAL_MODE, "sandbox"),
    },
    crypto: {
      nowpaymentsKey: str(process.env.NOWPAYMENTS_API_KEY),
      ipnSecret: str(process.env.NOWPAYMENTS_IPN_SECRET),
      usdtAddress: str(process.env.USDT_TRC20_ADDRESS, "TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
    },
    bank: {
      holder: str(process.env.BANK_HOLDER, "Daiana Gallicchio"),
      name: str(process.env.BANK_NAME, "Mercado Pago"),
      cbu: str(process.env.BANK_CBU, ""),
      alias: str(process.env.BANK_ALIAS, "joaquina.shop.mp"),
      cuit: str(process.env.BANK_CUIT, ""),
    },
  },

  email: {
    resendKey: str(process.env.RESEND_API_KEY),
    from: str(process.env.EMAIL_FROM, "La Joaquina <pedidos@lajoaquina.shop>"),
  },

  /* Dropshipping: demo (simulado), cj (API real) o manual. */
  suppliers: {
    provider: str(
      process.env.SUPPLIER_PROVIDER,
      cjApiKey ? "cj" : "demo",
    ).toLowerCase(),
    autoPay: bool(process.env.SUPPLIER_AUTO_PAY, false),
    syncMinutes: num(process.env.SUPPLIER_SYNC_MINUTES, 15),
    maxAttempts: num(process.env.SUPPLIER_MAX_ATTEMPTS, 8),
    cj: {
      apiKey: cjApiKey,
      openId: str(process.env.CJ_OPEN_ID),
      webhookSecret: str(process.env.CJ_WEBHOOK_SECRET),
      baseUrl: str(
        process.env.CJ_BASE_URL,
        "https://developers.cjdropshipping.com/api2.0/v1",
      ).replace(/\/$/, ""),
      sandbox: bool(process.env.CJ_SANDBOX, true),
      logisticName: str(process.env.CJ_LOGISTIC_NAME, "CJPacket Ordinary"),
      fromCountryCode: str(process.env.CJ_FROM_COUNTRY_CODE, "CN").toUpperCase(),
      skuMap: jsonEnv(process.env.CJ_SKU_MAP, {}),
    },
  },

  /* Costos internos de operación usados por el dashboard (en ARS). */
  ops: {
    paymentFeePct: 0.042,
    paymentFeeFixed: 450,
    fulfillmentCost: 5200,
    adSpendDailyArs: 400000,
  },
};

export const demoFlags = {
  mercadopago: !config.payments.mercadopago.accessToken,
  stripe: !config.payments.stripe.secretKey,
  paypal: !config.payments.paypal.clientId,
  crypto: !config.payments.crypto.nowpaymentsKey,
};

export function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function isProduction() {
  return config.env === "production";
}
