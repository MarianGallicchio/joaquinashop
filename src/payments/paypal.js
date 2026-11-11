import { config } from "../config.js";

const LIVE = "https://api-m.paypal.com";
const SANDBOX = "https://api-m.sandbox.paypal.com";

export function isDemo() {
  return !config.payments.paypal.clientId || !config.payments.paypal.secret;
}

function apiBase() {
  return config.payments.paypal.mode === "live" ? LIVE : SANDBOX;
}

async function accessToken() {
  const auth = Buffer.from(
    `${config.payments.paypal.clientId}:${config.payments.paypal.secret}`,
  ).toString("base64");
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("PayPal: no se pudo autenticar");
  const data = await response.json();
  return data.access_token;
}

export async function createPayment(order) {
  if (isDemo()) {
    return {
      type: "redirect",
      url: `/pago/demo.html?order=${order.id}&token=${order.publicToken}&method=paypal`,
      providerId: `demo_paypal_${order.id}`,
      demo: true,
    };
  }

  /* PayPal no opera ARS: si la orden está en pesos, se convierte a USD. */
  const value =
    order.currency === "USD"
      ? order.totals.total
      : Math.round((order.totals.total / config.store.arsPerUsd) * 100) / 100;

  const token = await accessToken();
  const response = await fetch(`${apiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `paypal-${order.id}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: order.id,
          description: `Pedido ${order.id} · La Joaquina`,
          amount: { currency_code: "USD", value: value.toFixed(2) },
        },
      ],
      application_context: {
        brand_name: "La Joaquina",
        user_action: "PAY_NOW",
        return_url: `${config.baseUrl}/pedido.html?order=${order.id}&token=${order.publicToken}&paypal=ok`,
        cancel_url: `${config.baseUrl}/checkout.html?pago=cancelado&order=${order.id}`,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`PayPal ${response.status}: ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const approve = data.links?.find((link) => link.rel === "approve")?.href;
  return {
    type: "redirect",
    url: approve,
    providerId: data.id,
    demo: false,
  };
}

export async function captureOrder(providerId) {
  const token = await accessToken();
  const response = await fetch(`${apiBase()}/v2/checkout/orders/${providerId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`PayPal capture ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json();
}

export async function verifyWebhook(headers, body) {
  const token = await accessToken();
  const response = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: config.payments.paypal.webhookId,
      webhook_event: body,
    }),
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data.verification_status === "SUCCESS";
}
