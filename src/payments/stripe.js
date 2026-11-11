import { config } from "../config.js";

const STRIPE_API = "https://api.stripe.com/v1";

export function isDemo() {
  return !config.payments.stripe.secretKey;
}

export async function createPayment(order) {
  if (isDemo()) {
    return {
      type: "redirect",
      url: `/pago/demo.html?order=${order.id}&token=${order.publicToken}&method=stripe`,
      providerId: `demo_stripe_${order.id}`,
      demo: true,
    };
  }

  const currency = order.currency.toLowerCase();
  const unitAmount = Math.round(order.totals.total * 100);
  const description = order.items.map((item) => `${item.name} ×${item.qty}`).join(", ");

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${config.baseUrl}/pedido.html?order=${order.id}&token=${order.publicToken}&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${config.baseUrl}/checkout.html?pago=cancelado&order=${order.id}`);
  params.set("customer_email", order.customer.email);
  params.set("client_reference_id", order.id);
  params.set("metadata[order_id]", order.id);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", currency);
  params.set("line_items[0][price_data][unit_amount]", String(unitAmount));
  params.set("line_items[0][price_data][product_data][name]", `Pedido ${order.id} · La Joaquina`);
  params.set("line_items[0][price_data][product_data][description]", description.slice(0, 240));
  params.set("payment_method_types[0]", "card");
  params.set("allow_promotion_codes", "false");
  params.set("locale", order.currency === "ARS" ? "es" : "auto");

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.payments.stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `stripe-${order.id}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Stripe ${response.status}: ${detail.slice(0, 300)}`);
  }

  const session = await response.json();
  return {
    type: "redirect",
    url: session.url,
    providerId: session.id,
    demo: false,
  };
}

export async function fetchSession(sessionId) {
  const response = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${config.payments.stripe.secretKey}` },
  });
  if (!response.ok) throw new Error(`No se pudo leer la sesión ${sessionId}`);
  return response.json();
}
