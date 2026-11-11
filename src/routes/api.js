import express from "express";
import { config, demoFlags } from "../config.js";
import { getAllProducts, CATEGORIES, BUNDLES, priceFor } from "../catalog.js";
import { quote, COUPONS } from "../pricing.js";
import { methodsForCountry } from "../payments/index.js";
import { createOrder, findOrder, publicOrder, markPaymentApproved, markPaymentRejected } from "../orders.js";
import { createPayment } from "../payments/index.js";
import { verifyReceipt } from "../payments/transfer.js";
import { fetchPayment as fetchMpPayment, searchPaymentsByOrder } from "../payments/mercadopago.js";
import { sendEmail } from "../mailer.js";
import { getDb, save, recordEvent } from "../store.js";
import { getStoreSettings } from "../settings.js";
import { rateLimit } from "../auth.js";
import { safeEqual } from "../auth.js";
import { getStock } from "../inventory.js";
import { customerFromRequest, createCustomerToken } from "../auth.js";
import { registerCustomer, loginCustomer, findCustomerById, updateCustomerProfile, ordersForCustomerEmail } from "../customers.js";
import { lookupBuenosAiresPostalCode } from "../ba-postal-codes.js";

export const api = express.Router();

api.get("/health", (req, res) => {
  res.json({
    ok: true,
    store: config.store.name,
    demoMode: config.security.demoMode,
    time: new Date().toISOString(),
  });
});

api.get("/catalog", (req, res) => {
  res.json({
    store: {
      name: config.store.name,
      whatsapp: getStoreSettings().whatsapp,
      email: config.store.email,
      freeShippingThreshold: config.store.freeShippingThreshold,
      arsPerUsd: config.store.arsPerUsd,
    },
    categories: CATEGORIES,
    products: getAllProducts({ includeUnpublished: false }).map((product) => ({
      ...product,
      stock: getStock(product.id),
      costArs: undefined,
      usd: priceFor(product, "USD", config.store.arsPerUsd),
    })),
    bundle: BUNDLES[0] || null,
    coupons: Object.keys(COUPONS),
    demo: { ...demoFlags, demoMode: config.security.demoMode },
  });
});

api.get("/payments/methods", (req, res) => {
  const country = String(req.query.country || "Argentina");
  res.json({
    country,
    methods: methodsForCountry(country),
    demoMode: config.security.demoMode,
  });
});

api.post("/quote", rateLimit({ key: "quote", max: 90 }), (req, res, next) => {
  try {
    const totals = quote({
      items: req.body.items,
      couponCode: req.body.couponCode,
      country: req.body.country,
      shippingMethod: req.body.shippingMethod,
      paymentMethod: req.body.paymentMethod,
    });
    res.json(totals);
  } catch (error) {
    next(error);
  }
});

api.post("/checkout", rateLimit({ key: "checkout", max: 20 }), async (req, res, next) => {
  try {
    const {
      customer,
      items,
      couponCode,
      country,
      shippingMethod,
      paymentMethod,
      channel,
      sessionId,
      meta,
    } = req.body || {};

    const order = createOrder({
      customer,
      items,
      couponCode,
      country,
      shippingMethod,
      paymentMethod,
      channel: ["meta", "google", "organic", "email", "influencer"].includes(channel)
        ? channel
        : "organic",
      sessionId,
      meta: {
        userAgent: String(req.headers["user-agent"] || "").slice(0, 240),
        ip: req.ip,
        ...(meta || {}),
      },
    });

    let result;
    try {
      result = await createPayment(order, paymentMethod);
    } catch (error) {
      /* No dejamos pedidos huérfanos si la pasarela rechaza el alta. */
      order.status = "cancelled";
      order.payment.status = "failed";
      order.timeline.push({
        at: new Date().toISOString(),
        status: "cancelled",
        label: `No se pudo iniciar el pago: ${String(error.message).slice(0, 180)}`,
      });
      save();
      throw error;
    }
    save();

    if (paymentMethod === "transfer") {
      await sendEmail(order, "transfer_instructions").catch(() => {});
    }
    if (paymentMethod === "cash") {
      await sendEmail(order, "cash_instructions").catch(() => {});
    }

    res.status(201).json({
      order: publicOrder(order),
      token: order.publicToken,
      payment: {
        type: result.type,
        url: result.url || null,
        demo: Boolean(result.demo),
        instructions: result.instructions || order.payment.instructions || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

api.get("/orders/:id", (req, res) => {
  const order = findOrder(req.params.id);
  if (!order || !safeEqual(order.publicToken, String(req.query.token || ""))) {
    return res.status(404).json({ error: "Pedido no encontrado." });
  }
  res.json({ order: publicOrder(order) });
});

api.post("/orders/:id/receipt", rateLimit({ key: "receipt", max: 12 }), (req, res, next) => {
  try {
    const order = findOrder(req.params.id);
    if (!order || !safeEqual(order.publicToken, String(req.body.token || ""))) {
      return res.status(404).json({ error: "Pedido no encontrado." });
    }
    if (order.payment.method !== "transfer") {
      return res.status(400).json({ error: "Este pedido no es por transferencia." });
    }
    if (order.payment.status === "approved") {
      return res.json({ order: publicOrder(order), approved: true });
    }

    const check = verifyReceipt(order, {
      amount: req.body.amount,
      reference: req.body.reference,
    });

    order.receipt = {
      uploadedAt: new Date().toISOString(),
      amount: Number(req.body.amount) || 0,
      reference: String(req.body.reference || "").slice(0, 80),
      fileName: String(req.body.fileName || "").slice(0, 120),
      autoCheck: check,
    };

    if (check.approved) {
      markPaymentApproved(order, { provider: "transfer", providerId: `tr_${order.id}` });
    } else {
      order.payment.status = "verifying";
      order.status = "payment_review";
      order.timeline.push({
        at: new Date().toISOString(),
        status: "payment_review",
        label: "Comprobante recibido · revisión manual",
      });
      save();
    }
    sendEmail(order, "receipt_received").catch(() => {});
    res.json({ order: publicOrder(order), approved: check.approved, check });
  } catch (error) {
    next(error);
  }
});


api.post("/leads", rateLimit({ key: "leads", max: 20 }), (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Email inválido." });
  }
  const db = getDb();
  if (!db.leads.some((lead) => lead.email === email)) {
    db.leads.unshift({
      email,
      at: new Date().toISOString(),
      source: String(req.body.source || "newsletter").slice(0, 60),
      coupon: "BIENVENIDA15",
    });
    save();
  }
  res.json({ ok: true, coupon: "BIENVENIDA15" });
});

api.post("/track", rateLimit({ key: "track", max: 180 }), (req, res) => {
  const allowed = ["session_start", "page_view", "view_item", "add_to_cart", "begin_checkout"];
  const type = String(req.body.type || "");
  if (!allowed.includes(type)) return res.status(204).end();
  recordEvent(type, {
    channel: ["meta", "google", "organic", "email", "influencer"].includes(req.body.channel)
      ? req.body.channel
      : "organic",
  });
  res.status(204).end();
});

api.post("/returns", rateLimit({ key: "returns", max: 10 }), (req, res) => {
  const db = getDb();
  const orderId = String(req.body.orderId || "").toUpperCase().slice(0, 30);
  const email = String(req.body.email || "").trim().toLowerCase();
  const order = findOrder(orderId);
  if (!order || order.customer.email !== email) {
    return res.status(404).json({ error: "No encontramos un pedido con esos datos." });
  }
  db.returns.unshift({
    id: `RET-${Date.now()}`,
    at: new Date().toISOString(),
    orderId,
    email,
    reason: String(req.body.reason || "").slice(0, 600),
    status: "requested",
  });
  save();
  res.json({ ok: true, message: "Recibimos tu solicitud. Tenés 10 días para devolver el producto." });
});

api.post("/orders/:id/sync-payment", rateLimit({ key: "sync-payment", max: 30 }), async (req, res, next) => {
  try {
    const order = findOrder(req.params.id);
    const token = String(req.query.token || req.body?.token || "");
    if (!order || !safeEqual(order.publicToken, token)) {
      return res.status(404).json({ error: "Pedido no encontrado." });
    }
    if (order.payment?.status === "approved" || ["paid", "shipped", "delivered"].includes(order.status)) {
      return res.json({ order: publicOrder(order), approved: true, synced: false });
    }
    if (order.payment?.method !== "mercadopago") {
      return res.json({ order: publicOrder(order), approved: false, synced: false, ignored: "method" });
    }
    if (!config.payments.mercadopago.accessToken) {
      return res.status(503).json({ error: "MercadoPago no está configurado." });
    }

    const hintedId = String(req.body?.payment_id || req.body?.collection_id || req.query.payment_id || req.query.collection_id || "").trim();
    let payment = null;
    if (hintedId) {
      try { payment = await fetchMpPayment(hintedId); } catch (_) { payment = null; }
      if (payment && String(payment.external_reference || "") !== String(order.id)) payment = null;
    }
    if (!payment) {
      const search = await searchPaymentsByOrder(order.id);
      const results = Array.isArray(search?.results) ? search.results : [];
      payment = results.find((p) => p.status === "approved") || results[0] || null;
    }
    if (!payment) {
      return res.json({ order: publicOrder(order), approved: false, synced: false, ignored: "no_payment" });
    }

    if (payment.status === "approved") {
      markPaymentApproved(order, {
        provider: "mercadopago",
        providerId: String(payment.id),
        amount: payment.transaction_amount,
        label: "Pago confirmado (sincronización)",
      });
    } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status)) {
      markPaymentRejected(order, { reason: `MercadoPago: ${payment.status}` });
    }
    const fresh = findOrder(order.id) || order;
    res.json({ order: publicOrder(fresh), approved: fresh.payment?.status === "approved", synced: true, paymentStatus: payment.status });
  } catch (error) {
    next(error);
  }
});



/* ── Cuentas de compradores ──────────────────────────────────── */
function publicCustomerSafe(c) {
  if (!c) return null;
  const { passwordHash, ...safe } = c;
  return safe;
}

function requireCustomer(req, res) {
  const tokenData = customerFromRequest(req);
  if (!tokenData) {
    res.status(401).json({ error: "Iniciá sesión para continuar." });
    return null;
  }
  const customer = findCustomerById(tokenData.id);
  if (!customer) {
    res.status(401).json({ error: "Sesión inválida. Volvé a iniciar sesión." });
    return null;
  }
  return customer;
}

api.post("/account/register", rateLimit({ key: "register", max: 20 }), (req, res, next) => {
  try {
    const customer = registerCustomer(req.body || {});
    const token = createCustomerToken(customer.id);
    res.json({ ok: true, token, customer });
  } catch (error) {
    next(error);
  }
});

api.post("/account/login", rateLimit({ key: "login", max: 20 }), (req, res, next) => {
  try {
    const customer = loginCustomer(req.body || {});
    const token = createCustomerToken(customer.id);
    res.json({ ok: true, token, customer });
  } catch (error) {
    next(error);
  }
});

api.get("/account/me", (req, res) => {
  const customer = requireCustomer(req, res);
  if (!customer) return;
  res.json({ customer: publicCustomerSafe(customer) });
});

api.put("/account/profile", (req, res, next) => {
  try {
    const customer = requireCustomer(req, res);
    if (!customer) return;
    const updated = updateCustomerProfile(customer.id, req.body || {});
    res.json({ ok: true, customer: updated });
  } catch (error) {
    next(error);
  }
});

api.get("/account/orders", (req, res) => {
  const customer = requireCustomer(req, res);
  if (!customer) return;
  const orders = ordersForCustomerEmail(customer.email)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(publicOrder);
  res.json({ orders });
});

api.get("/shipping/postal-code", (req, res) => {
  const { city, province } = req.query || {};
  const cp = lookupBuenosAiresPostalCode(String(city || ""), String(province || "Buenos Aires"));
  res.json({ city: String(city || ""), province: String(province || ""), postalCode: cp || null });
});
