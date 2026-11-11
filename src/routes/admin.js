import express from "express";
import { config, demoFlags } from "../config.js";
import { adminRequired, createAdminToken, rateLimit, safeEqual } from "../auth.js";
import { metrics, recentOrders } from "../analytics.js";
import { getDb, save } from "../store.js";
import { getStoreSettings, updateStoreSettings } from "../settings.js";
import { findOrder, markPaymentApproved, summaryForAdmin } from "../orders.js";
import {
  advanceFulfillment,
  processFulfillmentQueue,
  retryOrder,
  supplierStatus,
  syncOpenOrders,
} from "../fulfillment.js";
import { emailLog, sendEmail } from "../mailer.js";
import {
  inventoryItem,
  inventoryList,
  inventorySummary,
  restoreStockForOrder,
  setStock,
  stockMovements,
} from "../inventory.js";
import { methodsForCountry } from "../payments/index.js";
import { getAutomationStatus, runAutomations } from "../automations.js";
import { listBackups, createBackup, restoreBackup, backupStatus } from "../backups.js";

export const admin = express.Router();

admin.post("/login", rateLimit({ key: "admin-login", max: 10 }), (req, res) => {
  const password = String(req.body.password || "");
  if (!safeEqual(password, config.security.adminPassword)) {
    return res.status(401).json({ error: "Contraseña incorrecta." });
  }
  res.json({
    token: createAdminToken(),
    expiresIn: config.security.adminTokenTtlMs / 1000,
  });
});

admin.use(adminRequired);

admin.get("/overview", (req, res) => {
  const days = [7, 30, 90, 120].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const settings = getStoreSettings();
  res.json({
    metrics: metrics(days),
    orders: recentOrders(25),
    emails: emailLog(),
    settings,
    flags: {
      demoMode: config.security.demoMode,
      gateways: demoFlags,
      methods: methodsForCountry("Argentina"),
      bank: {
        alias: settings.bank.alias,
        holder: settings.bank.holder,
      },
      emailProvider: config.email.resendKey ? "resend" : "log",
      env: config.env,
      supplier: supplierStatus(),
    },
    leads: getDb().leads.length,
    returns: getDb().returns.length,
  });
});

admin.get("/settings", (req, res) => {
  res.json({ settings: getStoreSettings() });
});

admin.post("/settings", (req, res, next) => {
  try {
    res.json({ settings: updateStoreSettings(req.body) });
  } catch (error) {
    next(Object.assign(error, { status: 400 }));
  }
});

admin.get("/orders", (req, res) => {
  const status = String(req.query.status || "all");
  const q = String(req.query.q || "").toLowerCase().trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
  let orders = getDb().orders;
  if (status !== "all") {
    orders = orders.filter((order) =>
      status === "open" ? ["pending", "pending_transfer", "pending_cash", "pending_crypto", "payment_review"].includes(order.status) : order.status === status,
    );
  }
  if (q) {
    orders = orders.filter(
      (order) =>
        order.id.toLowerCase().includes(q) ||
        order.customer.name.toLowerCase().includes(q) ||
        order.customer.email.toLowerCase().includes(q),
    );
  }
  res.json({
    total: orders.length,
    orders: orders.slice(0, limit).map(summaryForAdmin),
  });
});

admin.get("/logistics", (req, res) => {
  const orders = getDb().orders;
  const inventory = inventoryList();
  const lowStock = inventory.filter((item) => item.stock > 0 && item.stock <= item.lowStockThreshold);
  const outOfStock = inventory.filter((item) => item.stock <= 0);
  const toShipAll = orders
    .filter((order) => order.status === "paid")
    .sort((a, b) => String(a.paidAt || a.createdAt).localeCompare(String(b.paidAt || b.createdAt)));
  const inTransitAll = orders
    .filter((order) => order.status === "shipped")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const pendingPaymentsAll = orders
    .filter((order) => ["pending", "pending_transfer", "pending_cash", "pending_crypto", "payment_review"].includes(order.status))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const queue = toShipAll.slice(0, 12).map(summaryForAdmin);
  const inTransit = inTransitAll.slice(0, 12).map(summaryForAdmin);
  const pendingPayments = pendingPaymentsAll.slice(0, 12).map(summaryForAdmin);

  res.json({
    summary: {
      ...inventorySummary(),
      toShip: toShipAll.length,
      inTransit: inTransitAll.length,
      pendingPayments: pendingPaymentsAll.length,
    },
    inventory,
    lowStock,
    outOfStock,
    movements: stockMovements(30),
    queues: { toShip: queue, inTransit, pendingPayments },
  });
});

admin.get("/orders/:id", (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });
  res.json({ order });
});

admin.post("/orders/:id/fulfill", (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });
  if (!["paid", "shipped"].includes(order.status)) {
    return res.status(400).json({ error: "El pedido todavía no está pago." });
  }
  if (order.fulfillment?.provider === "cj" && order.fulfillment?.remoteOrderId) {
    return res.status(400).json({
      error: "El pedido se sincroniza automáticamente con CJ. Usá “Sincronizar tracking”.",
    });
  }
  advanceFulfillment(order, req.body.step === "delivered" ? "delivered" : "shipped");
  res.json({ order: summaryForAdmin(order) });
});

admin.post("/orders/:id/confirm-payment", (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });
  if (!["pending", "pending_transfer", "pending_cash", "pending_crypto", "payment_review"].includes(order.status)) {
    return res.status(400).json({ error: "El pedido no está pendiente de confirmación." });
  }

  const updated = markPaymentApproved(order, {
    provider: "manual",
    providerId: `manual_${order.id}`,
    label: "Pago confirmado manualmente por el equipo",
  });

  if (updated.status !== "paid") {
    const detail = (updated.inventoryShortage || [])
      .map((item) => `${item.name}: hay ${item.available}`)
      .join(" · ");
    return res.status(409).json({
      error: `Pago registrado, pero falta stock. ${detail || "Revisá el inventario."}`,
      order: summaryForAdmin(updated),
    });
  }
  res.json({ order: summaryForAdmin(updated) });
});

admin.post("/orders/:id/shipment", (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });
  if (!["paid", "shipped", "delivered"].includes(order.status)) {
    return res.status(400).json({ error: "Primero confirmá el pago del pedido." });
  }
  if (order.fulfillment?.provider === "cj" && order.fulfillment?.remoteOrderId) {
    return res.status(400).json({
      error: "El pedido se sincroniza automáticamente con CJ. Usá “Sincronizar tracking”.",
    });
  }

  const carrier = String(req.body.carrier || "").trim().slice(0, 60);
  const tracking = String(req.body.tracking || "").trim().slice(0, 100);
  const trackingUrl = String(req.body.trackingUrl || "").trim().slice(0, 500);
  if (!carrier || !tracking) {
    return res.status(400).json({ error: "Completá transporte y código de seguimiento." });
  }
  if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) {
    return res.status(400).json({ error: "La URL de seguimiento debe empezar con http:// o https://." });
  }

  const wasShipped = ["shipped", "delivered"].includes(order.status);
  const now = new Date().toISOString();
  order.fulfillment ??= {};
  order.fulfillment.provider ??= "manual";
  order.fulfillment.carrier = carrier;
  order.fulfillment.tracking = tracking;
  order.fulfillment.trackingUrl = trackingUrl || null;

  if (!wasShipped) {
    order.status = "shipped";
    order.fulfillment.status = "shipped";
    order.fulfillment.events ??= [];
    order.fulfillment.events.push({
      at: now,
      type: "shipped",
      label: `Despachado con ${carrier} · ${tracking}`,
    });
    order.timeline.push({
      at: now,
      status: "shipped",
      label: `Pedido despachado con ${carrier} · ${tracking}`,
    });
  } else {
    order.fulfillment.events ??= [];
    order.fulfillment.events.push({ at: now, type: "tracking_updated", label: "Seguimiento actualizado" });
    order.timeline.push({ at: now, status: order.status, label: "Seguimiento actualizado" });
  }

  save();
  if (req.body.notify !== false) sendEmail(order, "shipped").catch(() => {});
  res.json({ order: summaryForAdmin(order) });
});

admin.post("/orders/:id/deliver", (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });
  if (order.status !== "shipped") {
    return res.status(400).json({ error: "El pedido tiene que estar enviado para marcarlo entregado." });
  }

  const now = new Date().toISOString();
  order.status = "delivered";
  order.fulfillment.status = "delivered";
  order.fulfillment.events ??= [];
  order.fulfillment.events.push({ at: now, type: "delivered", label: "Pedido entregado" });
  order.timeline.push({ at: now, status: "delivered", label: "Pedido entregado" });
  save();
  if (req.body.notify !== false) sendEmail(order, "delivered").catch(() => {});
  res.json({ order: summaryForAdmin(order) });
});

admin.patch("/inventory/:id", (req, res, next) => {
  try {
    const item = setStock(req.params.id, req.body.stock, req.body.reason || "Ajuste manual desde el backoffice");
    res.json({
      inventory: item,
      summary: inventorySummary(),
      movements: stockMovements(10),
    });
  } catch (error) {
    next(error);
  }
});

admin.post("/orders/:id/retry", async (req, res, next) => {
  try {
    const order = findOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Pedido no encontrado." });
    await retryOrder(order);
    res.json({ order: summaryForAdmin(order), supplier: supplierStatus() });
  } catch (error) {
    next(error);
  }
});

admin.post("/fulfillment/sync", async (req, res, next) => {
  try {
    const result = await syncOpenOrders();
    res.json({ result, supplier: supplierStatus() });
  } catch (error) {
    next(error);
  }
});

admin.post("/fulfillment/queue", async (req, res, next) => {
  try {
    const result = await processFulfillmentQueue();
    res.json({ result, supplier: supplierStatus() });
  } catch (error) {
    next(error);
  }
});

admin.post("/orders/:id/refund", (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });
  restoreStockForOrder(order);
  order.status = "refunded";
  order.payment.status = "refunded";
  order.timeline.push({
    at: new Date().toISOString(),
    status: "refunded",
    label: String(req.body.reason || "Reembolso manual").slice(0, 200),
  });
  save();
  res.json({ order: summaryForAdmin(order) });
});

admin.get("/export.csv", (req, res) => {
  const rows = [
    ["id", "fecha", "cliente", "email", "pais", "items", "moneda", "total", "estado", "pago", "canal"],
    ...getDb().orders.map((order) => [
      order.id,
      order.createdAt,
      order.customer.name,
      order.customer.email,
      order.customer.country,
      order.items.map((item) => `${item.name} x${item.qty}`).join(" | "),
      order.currency,
      order.totals.total,
      order.status,
      order.payment.method,
      order.channel,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="la-joaquina-pedidos.csv"');
  res.send(`\uFEFF${csv}`);
});

admin.get("/automations", (req, res) => {
  res.json(getAutomationStatus());
});

admin.post("/automations/run", async (req, res) => {
  const result = await runAutomations({ manual: true });
  res.json({ ok: Boolean(result.ok), result });
});

admin.get("/backups", (req, res) => {
  res.json({ status: backupStatus(), backups: listBackups() });
});

admin.post("/backups", (req, res) => {
  try {
    const backup = createBackup(String(req.body?.reason || "manual"));
    res.json({ ok: true, backup, status: backupStatus(), backups: listBackups() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

admin.post("/backups/restore", (req, res) => {
  try {
    const name = String(req.body?.name || "");
    if (!name) return res.status(400).json({ error: "Falta el nombre del backup." });
    const result = restoreBackup(name);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
