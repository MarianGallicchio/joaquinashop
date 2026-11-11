import crypto from "node:crypto";
import { getDb, save, nextOrderId, recordEvent } from "./store.js";
import { quote, paymentFee } from "./pricing.js";
import { findProduct } from "./catalog.js";
import { startFulfillment } from "./fulfillment.js";
import { sendEmail } from "./mailer.js";
import { checkStock, reserveStockForOrder } from "./inventory.js";

const VALID_METHODS = ["mercadopago", "transfer", "cash"];

export function createOrder({ customer, items, couponCode, country, shippingMethod, paymentMethod, channel = "organic", sessionId, meta = {} }) {
  if (!VALID_METHODS.includes(paymentMethod)) {
    const error = new Error("Método de pago inválido.");
    error.status = 400;
    throw error;
  }
  if (!customer?.name || !customer?.email || !customer?.phone) {
    const error = new Error("Faltan datos del comprador.");
    error.status = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    const error = new Error("El email no es válido.");
    error.status = 400;
    throw error;
  }
  if (!items?.length) {
    const error = new Error("El carrito está vacío.");
    error.status = 400;
    throw error;
  }

  const totals = quote({ items, couponCode, country, shippingMethod, paymentMethod });
  const shortages = checkStock(totals.items);
  if (shortages.length) {
    const detail = shortages
      .map((item) => `${item.name}: pediste ${item.requested}, hay ${item.available}`)
      .join(" · ");
    const error = new Error(`Sin stock suficiente. ${detail}`);
    error.status = 409;
    throw error;
  }
  const { id } = nextOrderId();

  const order = {
    id,
    publicToken: cryptoRandom(),
    createdAt: new Date().toISOString(),
    paidAt: null,
    customer: {
      name: String(customer.name).slice(0, 80),
      email: String(customer.email).slice(0, 120).toLowerCase(),
      phone: String(customer.phone).slice(0, 40),
      address: String(customer.address || "").slice(0, 160),
      city: String(customer.city || "").slice(0, 80),
      province: String(customer.province || "").slice(0, 80),
      country: totals.country,
      postal: String(customer.postal || "").slice(0, 20),
      notes: String(customer.notes || "").slice(0, 300),
    },
    items: totals.items,
    currency: totals.currency,
    fx: totals.fx,
    totals: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shipping,
      total: totals.total,
      priceMode: totals.priceMode,
    },
    coupon: totals.coupon,
    shippingMethod: totals.shippingMethod,
    shippingEta: totals.shippingEta,
    payment: {
      method: paymentMethod,
      status: "pending",
      providerId: null,
      fee: paymentFee(totals, totals.currency),
      instructions: null,
    },
    status: "pending",
    channel,
    sessionId: sessionId || null,
    meta,
    fulfillment: {
      status: "not_started",
      supplierRef: null,
      tracking: null,
      trackingUrl: null,
      carrier: null,
      events: [],
    },
    demo: false,
    timeline: [
      { at: new Date().toISOString(), status: "pending", label: "Pedido creado" },
    ],
  };

  const database = getDb();
  database.orders.unshift(order);
  save();

  sendEmail(order, "order_created").catch(() => {});
  return order;
}

export function findOrder(id) {
  return getDb().orders.find((order) => order.id === id);
}

export function publicOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    customer: {
      name: order.customer.name,
      email: order.customer.email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
      city: order.customer.city,
      province: order.customer.province,
      country: order.customer.country,
      address: order.customer.address,
      postal: order.customer.postal,
    },
    items: order.items,
    currency: order.currency,
    totals: order.totals,
    payment: {
      method: order.payment.method,
      status: order.payment.status,
      instructions: order.payment.instructions,
    },
    status: order.status,
    shippingMethod: order.shippingMethod,
    shippingEta: order.shippingEta,
    fulfillment: {
      status: order.fulfillment.status,
      provider: order.fulfillment.provider || null,
      supplierRef: order.fulfillment.supplierRef || null,
      tracking: order.fulfillment.tracking || null,
      trackingUrl: order.fulfillment.trackingUrl || null,
      carrier: order.fulfillment.carrier || null,
      paymentStatus: order.fulfillment.paymentStatus || null,
      events: order.fulfillment.events || [],
    },
    timeline: order.timeline,
    demo: order.demo,
  };
}

export function markPaymentApproved(order, { provider = null, providerId = null, amount = null, label = null } = {}) {
  if (!order) return null;
  if (["paid", "shipped", "delivered"].includes(order.status) && order.payment.status === "approved") {
    return order;
  }

  if (amount !== null) {
    const expected = order.totals.total;
    const tolerance = order.currency === "ARS" ? 1 : 0.01;
    if (Math.abs(Number(amount) - expected) > tolerance) {
      order.payment.status = "review";
      order.status = "payment_review";
      order.timeline.push({
        at: new Date().toISOString(),
        status: "payment_review",
        label: "El monto recibido no coincide. Revisión manual.",
      });
      save();
      return order;
    }
  }

  const reservation = reserveStockForOrder(order);
  if (!reservation.ok) {
    const detail = reservation.shortages
      .map((item) => `${item.name}: pediste ${item.requested}, hay ${item.available}`)
      .join(" · ");
    order.payment.status = "approved";
    order.status = "payment_review";
    order.inventoryShortage = reservation.shortages;
    order.timeline.push({
      at: new Date().toISOString(),
      status: "payment_review",
      label: `Pago recibido, stock insuficiente. ${detail}`,
    });
    save();
    return order;
  }
  order.inventoryShortage = null;

  const now = new Date().toISOString();
  order.payment.status = "approved";
  order.payment.providerId = providerId || order.payment.providerId;
  if (provider) order.payment.provider = provider;
  order.status = "paid";
  order.paidAt = now;
  order.timeline.push({ at: now, status: "paid", label: label || "Pago confirmado automáticamente" });
  startFulfillment(order);
  save();

  recordEvent("purchase", {
    value: order.currency === "ARS" ? order.totals.total : order.totals.total * order.fx,
    channel: order.channel,
    at: now,
  });

  sendEmail(order, "payment_approved").catch(() => {});
  return order;
}

export function markPaymentRejected(order, { reason = "Pago rechazado por la pasarela" } = {}) {
  if (!order) return null;
  /* Un evento tardío de rechazo no puede cancelar un pedido ya cobrado. */
  if (["paid", "shipped", "delivered"].includes(order.status)) return order;
  order.payment.status = "rejected";
  order.status = "cancelled";
  order.timeline.push({
    at: new Date().toISOString(),
    status: "cancelled",
    label: reason,
  });
  save();
  sendEmail(order, "payment_rejected").catch(() => {});
  return order;
}

export function summaryForAdmin(order) {
  return {
    id: order.id,
    createdAt: order.createdAt,
    customer: order.customer,
    items: order.items,
    currency: order.currency,
    totals: order.totals,
    status: order.status,
    payment: order.payment,
    fulfillment: order.fulfillment,
    inventoryShortage: order.inventoryShortage || null,
    channel: order.channel,
    demo: order.demo,
    timeline: order.timeline,
  };
}

export function orderCost(order) {
  return order.items.reduce((acc, item) => {
    const product = findProduct(item.id);
    return acc + (product?.costArs || 0) * item.qty;
  }, 0);
}

function cryptoRandom() {
  return crypto.randomBytes(16).toString("hex");
}

