import crypto from "node:crypto";
import { config } from "../config.js";

const NOWPAYMENTS = "https://api.nowpayments.io/v1";
const USDT_TRC20_RATE = 1;
const USDT_PLACEHOLDER = "TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

export function hasManualAddress() {
  const address = String(config.payments.crypto.usdtAddress || "").trim();
  return Boolean(address && address !== USDT_PLACEHOLDER);
}

export function isDemo() {
  return !config.payments.crypto.nowpaymentsKey && !hasManualAddress();
}

export async function createPayment(order) {
  const usdAmount =
    order.currency === "USD"
      ? order.totals.total
      : Math.round((order.totals.total / config.store.arsPerUsd) * 100) / 100;

  if (!config.payments.crypto.nowpaymentsKey) {
    if (!hasManualAddress() && !config.security.demoMode) {
      throw new Error("La dirección USDT no está configurada.");
    }
    /* Monto único con centavos para conciliar el depósito sin API. */
    const unique = Math.round((usdAmount + Math.floor(Math.random() * 9 + 1) / 100) * 100) / 100;
    return {
      type: "instructions",
      providerId: `usdt_${order.id}`,
      demo: !hasManualAddress(),
      instructions: {
        method: "crypto",
        title: "USDT · TRC20",
        address: config.payments.crypto.usdtAddress,
        network: "TRON (TRC20)",
        cryptoAmount: unique.toFixed(2),
        currency: "USDT",
        usdEquivalent: unique,
        note: "Enviá el monto exacto. El pedido se confirma automáticamente al detectar la transacción.",
        expiresInMinutes: 60,
      },
    };
  }

  const response = await fetch(`${NOWPAYMENTS}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": config.payments.crypto.nowpaymentsKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: usdAmount,
      price_currency: "usd",
      order_id: order.id,
      order_description: `Pedido ${order.id} · La Joaquina`,
      ipn_callback_url: `${config.baseUrl}/api/webhooks/crypto`,
      success_url: `${config.baseUrl}/pedido.html?order=${order.id}&token=${order.publicToken}`,
      cancel_url: `${config.baseUrl}/checkout.html?pago=cancelado&order=${order.id}`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`NOWPayments ${response.status}: ${detail.slice(0, 300)}`);
  }

  const invoice = await response.json();
  return {
    type: "redirect",
    url: invoice.invoice_url,
    providerId: String(invoice.id),
    demo: false,
  };
}

export function verifyIpn(rawBody, signature) {
  const secret = config.payments.crypto.ipnSecret;
  if (!secret) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const received = String(signature || "");
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
