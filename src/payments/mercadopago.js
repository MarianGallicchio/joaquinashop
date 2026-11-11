import { config } from "../config.js";

const MP_API = "https://api.mercadopago.com";

export function isDemo() {
  return !config.payments.mercadopago.accessToken;
}

export async function createPayment(order) {
  if (isDemo()) {
    return {
      type: "redirect",
      url: `/pago/demo.html?order=${order.id}&token=${order.publicToken}&method=mercadopago`,
      providerId: `demo_mp_${order.id}`,
      demo: true,
    };
  }

  const amountArs =
    order.currency === "ARS" ? order.totals.total : Math.round(order.totals.total * config.store.arsPerUsd);

  /* Repartimos el total exacto (con descuentos) para que el webhook concilie. */
  const weights = order.items.map((item) => {
    const line = item.lineTotal ?? item.unitPrice * item.qty;
    return order.currency === "ARS" ? line : line * config.store.arsPerUsd;
  });
  const weightTotal = weights.reduce((acc, value) => acc + value, 0);
  if (amountArs < order.items.length) {
    throw new Error("El total del pedido es demasiado bajo para procesarlo con MercadoPago.");
  }

  /* Cada línea vale al menos 1 ARS y la suma cierra exacta contra el total. */
  let remaining = amountArs;
  const items = order.items.map((item, index) => {
    const left = order.items.length - index;
    let amount;
    if (left === 1) {
      amount = remaining;
    } else {
      const ideal = weightTotal
        ? Math.round((amountArs * weights[index]) / weightTotal)
        : Math.round(amountArs / order.items.length);
      const max = remaining - (left - 1);
      amount = Math.max(1, Math.min(ideal, max));
    }
    remaining -= amount;
    return {
      id: item.id,
      title: `${item.name}${item.color ? ` · ${item.color}` : ""} ×${item.qty}`,
      quantity: 1,
      unit_price: amount,
      currency_id: "ARS",
    };
  });

  const payload = {
    items,
    payer: {
      name: order.customer.name,
      email: order.customer.email,
    },
    external_reference: order.id,
    statement_descriptor: "La Joaquina",
    metadata: { order_id: order.id },
    back_urls: {
      success: `${config.baseUrl}/pedido.html?order=${order.id}&token=${order.publicToken}`,
      failure: `${config.baseUrl}/checkout.html?pago=fallido&order=${order.id}`,
      pending: `${config.baseUrl}/pedido.html?order=${order.id}&token=${order.publicToken}`,
    },
    auto_return: "approved",
    notification_url: `${config.baseUrl}/api/webhooks/mercadopago`,
  };

  const response = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.payments.mercadopago.accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `pref-${order.id}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`MercadoPago ${response.status}: ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  return {
    type: "redirect",
    url: data.init_point,
    providerId: String(data.id),
    demo: false,
  };
}

export async function fetchPayment(paymentId) {
  const response = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${config.payments.mercadopago.accessToken}` },
  });
  if (!response.ok) throw new Error(`No se pudo leer el pago ${paymentId}`);
  return response.json();
}

export async function searchPaymentsByOrder(orderId) {
  const url = new URL(`${MP_API}/v1/payments/search`);
  url.searchParams.set("external_reference", String(orderId));
  url.searchParams.set("sort", "date_created");
  url.searchParams.set("criteria", "desc");
  url.searchParams.set("limit", "10");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.payments.mercadopago.accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo buscar pagos (${response.status}): ${detail.slice(0, 120)}`);
  }
  return response.json();
}
