import crypto from "node:crypto";
import { config } from "../config.js";

/**
 * Adaptador real de CJ Dropshipping (API v2.0).
 *
 * - Autenticación: POST /authentication/getAccessToken con CJ_API_KEY.
 * - Alta de pedido: POST /shopping/order/createOrderV2.
 * - Pago automático: payType=2 (saldo CJ) o /shopping/pay/payBalance.
 * - Tracking: GET /shopping/order/getOrderDetail.
 * - Webhook: HMAC-SHA256(Base64) del cuerpo crudo, secreto = openId.
 *
 * Sin CJ_API_KEY el módulo no hace red: la tienda usa el proveedor demo.
 */
const cj = config.suppliers.cj;
const OFFICIAL_HOST = /cjdropshipping\.com/i;
let accessToken = null;
let tokenExpiresAt = 0;
let openId = cj.openId || null;
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function configured() {
  if (!cj.apiKey) {
    const error = new Error("CJ_API_KEY no está configurada.");
    error.code = "CJ_NOT_CONFIGURED";
    throw error;
  }
}

async function throttle() {
  if (!OFFICIAL_HOST.test(cj.baseUrl)) return;
  const wait = 1050 - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

class CjError extends Error {
  constructor(message, { code, requestId, status, retryable = false } = {}) {
    super(message);
    this.name = "CjError";
    this.code = code;
    this.requestId = requestId;
    this.status = status;
    this.retryable = retryable;
  }
}

async function raw(path, { method = "GET", body, auth = true, token = null } = {}) {
  configured();
  await throttle();

  const headers = { "Content-Type": "application/json" };
  const bearer = token || (auth ? await getAccessToken() : null);
  if (bearer) headers["CJ-Access-Token"] = bearer;

  let response;
  try {
    response = await fetch(`${cj.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    throw new CjError(`No se pudo conectar con CJ: ${error.message}`, {
      code: "CJ_NETWORK",
      retryable: true,
    });
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new CjError(`CJ devolvió una respuesta inválida (HTTP ${response.status}).`, {
      status: response.status,
      retryable: response.status >= 500,
    });
  }

  if (response.status === 401 && auth) {
    accessToken = null;
    tokenExpiresAt = 0;
    return raw(path, { method, body, auth, token: await getAccessToken() });
  }

  const failed =
    !response.ok ||
    payload.result === false ||
    (typeof payload.code === "number" && payload.code !== 200);

  if (failed) {
    const message = payload.message || `CJ HTTP ${response.status}`;
    throw new CjError(String(message).slice(0, 300), {
      code: payload.code || response.status,
      requestId: payload.requestId,
      status: response.status,
      retryable:
        response.status === 429 ||
        response.status >= 500 ||
        [1600200, 1600300].includes(payload.code),
    });
  }

  return payload.data;
}

export async function getAccessToken() {
  if (!cj.apiKey) configured();
  if (accessToken && Date.now() < tokenExpiresAt - 3_600_000) return accessToken;

  const data = await raw("/authentication/getAccessToken", {
    method: "POST",
    auth: false,
    body: { apiKey: cj.apiKey },
  });

  if (!data?.accessToken) {
    throw new CjError("CJ no devolvió un access token. Revisá la API key.", {
      code: "CJ_AUTH",
    });
  }

  accessToken = data.accessToken;
  openId = data.openId ? String(data.openId) : openId;
  const expiry = Date.parse(data.accessTokenExpiryDate || "");
  tokenExpiresAt = Number.isFinite(expiry) ? expiry : Date.now() + 30 * 24 * 3600_000;
  return accessToken;
}

export function getOpenId() {
  return openId;
}

export function isConfigured() {
  return Boolean(cj.apiKey);
}

export function webhookReady() {
  return Boolean(cj.apiKey && (cj.webhookSecret || openId));
}

export function describe() {
  return {
    provider: "cj",
    configured: isConfigured(),
    sandbox: cj.sandbox,
    autoPay: config.suppliers.autoPay,
    logisticName: cj.logisticName,
    baseUrl: cj.baseUrl,
    webhookReady: webhookReady(),
    openIdKnown: Boolean(openId),
  };
}

const COUNTRY_CODES = {
  argentina: "AR",
  chile: "CL",
  uruguay: "UY",
  "méxico": "MX",
  mexico: "MX",
  colombia: "CO",
  "españa": "ES",
  espana: "ES",
  "estados unidos": "US",
  "united states": "US",
  "perú": "PE",
  peru: "PE",
  brasil: "BR",
  brazil: "BR",
};

export function countryCode(country = "") {
  const value = String(country).trim();
  if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  return COUNTRY_CODES[value.toLowerCase()] || "AR";
}

function skuFor(item) {
  const map = cj.skuMap || {};
  const keys = [
    item.color ? `${item.id}::${item.color}` : null,
    item.color && item.supplierSku ? `${item.supplierSku}::${item.color}` : null,
    item.id,
    item.supplierSku,
  ].filter(Boolean);
  return keys.map((key) => map[key]).find(Boolean) || item.supplierSku;
}

function houseNumber(address = "") {
  const match = String(address).match(/\b(\d{1,6})\b/);
  return match ? match[1] : undefined;
}

/**
 * Crea el pedido en CJ. Devuelve el id remoto; nunca devuelve datos sensibles.
 * El pago automático se pide con payType=2 (saldo CJ) cuando SUPPLIER_AUTO_PAY=true.
 */
export async function createOrder(order) {
  const items = order.items
    .map((item) => ({
      sku: skuFor(item),
      quantity: Number(item.qty) || 1,
      storeProductName: item.name,
      storeSku: item.supplierSku || item.id,
    }))
    .filter((item) => item.sku);

  if (!items.length) {
    throw new CjError("Ningún producto tiene SKU de CJ configurado.", {
      code: "CJ_SKU_MISSING",
    });
  }

  const payload = {
    orderNumber: order.id,
    shippingCountryCode: countryCode(order.customer.country),
    shippingCountry: order.customer.country || "Argentina",
    shippingProvince: order.customer.province || order.customer.city || "N/A",
    shippingCity: order.customer.city || order.customer.province || "N/A",
    shippingAddress: order.customer.address || "N/A",
    shippingCustomerName: order.customer.name,
    shippingZip: order.customer.postal || "0000",
    shippingPhone: order.customer.phone,
    remark: `La Joaquina ${order.id}${order.customer.notes ? ` · ${order.customer.notes}` : ""}`.slice(0, 500),
    fromCountryCode: cj.fromCountryCode,
    logisticName: cj.logisticName,
    payType: config.suppliers.autoPay ? 2 : 1,
    isSandbox: cj.sandbox ? 1 : 0,
    products: items,
  };

  const number = houseNumber(order.customer.address);
  if (number) payload.houseNumber = number;

  const data = await raw("/shopping/order/createOrderV2", {
    method: "POST",
    body: payload,
  });

  const remoteOrderId =
    data?.orderId || data?.shipmentOrderId || data?.cjOrderId || data?.orderNumber;
  if (!remoteOrderId) {
    throw new CjError("CJ creó el pedido pero no devolvió un identificador.", {
      code: "CJ_NO_ORDER_ID",
    });
  }

  return {
    remoteOrderId: String(remoteOrderId),
    remoteOrderNumber: String(data.orderNumber || order.id),
    cjPayUrl: data.cjPayUrl || null,
    raw: {
      orderStatus: data.orderStatus || null,
      orderAmount: data.orderAmount ?? null,
    },
  };
}

/** Pago desde el saldo de CJ (o simulación si el pedido es sandbox). */
export async function payOrder(remoteOrderId) {
  if (cj.sandbox) {
    await raw("/shopping/sandbox/simulatePay", {
      method: "POST",
      body: { orderId: remoteOrderId },
    });
    return { paid: true, sandbox: true };
  }

  await raw("/shopping/pay/payBalance", {
    method: "POST",
    body: { orderId: remoteOrderId },
  });
  return { paid: true, sandbox: false };
}

export async function fetchOrder(remoteOrderId) {
  const query = new URLSearchParams({ orderId: String(remoteOrderId) });
  const data = await raw(`/shopping/order/getOrderDetail?${query.toString()}`);
  if (!data) {
    throw new CjError("CJ no devolvió el detalle del pedido.", { code: "CJ_NO_DETAIL" });
  }
  return data;
}

/** Verifica el header `sign` de CJ contra el cuerpo crudo. */
export function verifyWebhook(rawBody, signature) {
  const secret = cj.webhookSecret || openId;
  if (!secret || !rawBody || !signature) return false;
  const expected = crypto
    .createHmac("sha256", String(secret))
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody)))
    .digest("base64");
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
