import { config } from "./config.js";
import { getDb, save } from "./store.js";
import { sendEmail } from "./mailer.js";
import * as cj from "./suppliers/cj.js";

/**
 * Capa de fulfillment (dropshipping).
 *
 * Proveedores:
 * - demo:   simula el despacho a los 25 s (sin red, sin claves).
 * - cj:     crea y paga la orden en CJ Dropshipping, sincroniza tracking y
 *           procesa webhooks firmados. Requiere CJ_API_KEY.
 * - manual: deja el pedido listo para cargarlo a mano en el proveedor.
 *
 * La cola es persistente: si CJ falla o el proceso se reinicia, el pedido
 * queda en `retry` con backoff y el admin puede reintentarlo.
 */
const provider = config.suppliers.provider;
const MAX_ATTEMPTS = config.suppliers.maxAttempts;
const nowIso = () => new Date().toISOString();

let processing = false;
let rerun = false;
let syncing = false;
let lastSyncAt = null;

function retryDelayMs(attempt) {
  return Math.min(30, 2 ** Math.max(1, attempt)) * 60_000;
}

function pushEvent(order, type, label, extra = {}) {
  order.fulfillment.events ??= [];
  order.fulfillment.events.push({ at: nowIso(), type, label, ...extra });
  if (order.fulfillment.events.length > 60) order.fulfillment.events = order.fulfillment.events.slice(-50);
}

function pushTimeline(order, status, label) {
  order.timeline ??= [];
  const last = order.timeline[order.timeline.length - 1];
  if (last?.label === label) return;
  order.timeline.push({ at: nowIso(), status, label });
}

function mailOnce(order, template) {
  order.fulfillment.emailsSent ??= [];
  if (order.fulfillment.emailsSent.includes(template)) return;
  order.fulfillment.emailsSent.push(template);
  sendEmail(order, template).catch(() => {});
}

function demoSupplierRef(order) {
  return `SUP-${order.id.replace("AUR-", "")}-${Math.floor(Math.random() * 900 + 100)}`;
}

/** Inicia el fulfillment de un pedido pagado. No lanza: la cola maneja errores. */
export function startFulfillment(order) {
  const previous = order.fulfillment || {};
  order.fulfillment = {
    status: "queued",
    provider,
    supplierRef: null,
    remoteOrderId: null,
    remoteOrderNumber: null,
    remoteStatus: null,
    paymentStatus: null,
    tracking: null,
    trackingUrl: null,
    carrier: null,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    lastError: null,
    errorCode: null,
    lastAttemptAt: null,
    lastSyncAt: null,
    nextRetryAt: null,
    events: previous.events || [],
    emailsSent: [],
  };

  if (provider === "demo") {
    const ref = demoSupplierRef(order);
    order.fulfillment.supplierRef = ref;
    order.fulfillment.status = "processing";
    pushEvent(order, "supplier_order_created", `Orden de prueba enviada al proveedor · ${ref}`);
    pushTimeline(order, "processing", "Pedido enviado al proveedor automáticamente");
    if (config.security.demoMode) {
      const timer = setTimeout(() => advanceFulfillment(order, "shipped"), 25_000);
      timer.unref?.();
    }
    return order.fulfillment;
  }

  if (provider === "cj") {
    order.fulfillment.status = "queued";
    pushEvent(order, "queued", "Pago confirmado · orden en cola para CJ");
    pushTimeline(order, "processing", "Pedido en cola para el proveedor CJ");
    const timer = setTimeout(() => processFulfillmentQueue().catch(() => {}), 0);
    timer.unref?.();
    return order.fulfillment;
  }

  order.fulfillment.status = "manual";
  pushEvent(order, "manual", "Pedido listo para cargar manualmente en el proveedor");
  pushTimeline(order, "processing", "Pedido listo para carga manual en el proveedor");
  return order.fulfillment;
}

/** Estado operativo para el backoffice. */
export function supplierStatus() {
  const counts = {
    queued: 0,
    retry: 0,
    failed: 0,
    processing: 0,
    submitted: 0,
    shipped: 0,
    delivered: 0,
    manual: 0,
  };

  for (const order of getDb().orders) {
    const status = order.fulfillment?.status;
    if (status && status in counts) counts[status] += 1;
  }

  return {
    provider,
    configured:
      provider === "demo" ? true : provider === "cj" ? cj.isConfigured() : true,
    mode: provider === "cj" ? (config.suppliers.cj.sandbox ? "sandbox" : "live") : provider,
    autoPay: config.suppliers.autoPay,
    syncMinutes: config.suppliers.syncMinutes,
    maxAttempts: MAX_ATTEMPTS,
    queue: counts,
    pending: counts.queued + counts.retry,
    failed: counts.failed,
    lastSyncAt,
    webhookReady: provider === "cj" ? cj.webhookReady() : null,
    callbackUrl: `${config.baseUrl}/api/webhooks/cj`,
    details: provider === "cj" ? cj.describe() : null,
  };
}

function mapOrderStatus(detail) {
  const status = String(detail.orderStatus || "").toUpperCase();
  if (status === "CANCELLED") return "cancelled";
  if (status === "DELIVERED") return "delivered";
  if (status === "SHIPPED") return "shipped";
  if (status === "UNSHIPPED") return "processing";
  if (["CREATED", "IN_CART", "UNPAID"].includes(status)) return "submitted";
  return null;
}

function applyDetail(order, detail, { source = "sync" } = {}) {
  const f = order.fulfillment;
  const previousStatus = f.status;
  const previousTracking = f.tracking;
  const mapped = mapOrderStatus(detail);

  f.provider = "cj";
  f.remoteStatus = detail.orderStatus || f.remoteStatus;
  f.remoteOrderNumber = detail.orderNum || detail.orderNumber || f.remoteOrderNumber;
  f.tracking = detail.trackNumber || detail.trackingNumber || f.tracking || null;
  f.trackingUrl = detail.trackingUrl || f.trackingUrl || null;
  f.carrier = detail.logisticName || f.carrier || null;
  f.lastSyncAt = nowIso();
  const paidByStatus = ["UNSHIPPED", "SHIPPED", "DELIVERED"].includes(
    String(detail.orderStatus || "").toUpperCase(),
  );
  f.paymentStatus = detail.paymentDate || paidByStatus ? "paid" : "unpaid";
  f.lastError = null;
  f.errorCode = null;

  if (mapped) {
    /* Los webhooks pueden llegar desordenados: nunca retrocedemos un estado. */
    const rank = { queued: 0, submitted: 1, processing: 2, shipped: 3, delivered: 4, cancelled: 5 };
    const currentRank = rank[f.status] ?? -1;
    const nextRank = rank[mapped] ?? 0;
    if (nextRank >= currentRank) f.status = mapped;
  }
  if (f.status === "processing" || f.status === "submitted") {
    f.paymentStatus = f.paymentStatus || "unpaid";
  }

  const statusChanged = f.status !== previousStatus;
  const trackingChanged = f.tracking && f.tracking !== previousTracking;

  if (statusChanged) {
    pushEvent(
      order,
      f.status,
      source === "webhook"
        ? `Actualización del proveedor: ${f.status}`
        : `Proveedor: ${detail.orderStatus || f.status}`,
    );
  }

  if (f.status === "shipped" && order.status !== "shipped" && order.status !== "delivered") {
    order.status = "shipped";
    pushTimeline(
      order,
      "shipped",
      `Pedido despachado · ${f.carrier || "proveedor"}${f.tracking ? ` · ${f.tracking}` : ""}`,
    );
    mailOnce(order, "shipped");
  }

  if (f.status === "delivered" && order.status !== "delivered") {
    order.status = "delivered";
    pushTimeline(order, "delivered", "Pedido entregado");
    mailOnce(order, "delivered");
  }

  if (f.status === "cancelled" && !["delivered", "refunded"].includes(order.status)) {
    order.status = "cancelled";
    pushTimeline(order, "cancelled", "El proveedor canceló el pedido");
  }

  return { statusChanged, trackingChanged };
}

/** Sincroniza un pedido con CJ y persiste cambios. */
export async function syncSupplierOrder(order, { persist = true } = {}) {
  const f = order.fulfillment;
  if (!f || f.provider !== "cj" || !f.remoteOrderId) return order;

  const detail = await cj.fetchOrder(f.remoteOrderId);
  const before = `${f.status}|${f.tracking}|${order.status}|${f.remoteStatus}`;
  applyDetail(order, detail);
  const after = `${f.status}|${f.tracking}|${order.status}|${f.remoteStatus}`;
  if (persist && before !== after) save();
  return order;
}

async function attemptFulfillment(order) {
  const f = order.fulfillment;
  f.attempts = (f.attempts || 0) + 1;
  f.lastAttemptAt = nowIso();

  try {
    if (!f.remoteOrderId) {
      const created = await cj.createOrder(order);
      f.remoteOrderId = created.remoteOrderId;
      f.remoteOrderNumber = created.remoteOrderNumber;
      f.supplierRef = created.remoteOrderId;
      f.paymentStatus = "unpaid";
      f.status = "submitted";
      f.lastError = null;
      f.nextRetryAt = null;
      pushEvent(order, "supplier_order_created", `Orden creada en CJ · ${created.remoteOrderId}`);
      pushTimeline(order, "processing", `Orden creada en CJ · ${created.remoteOrderId}`);
      save();
    }

    await syncSupplierOrder(order, { persist: false });
    save();

    if (config.suppliers.autoPay && f.paymentStatus === "unpaid" && f.status !== "cancelled") {
      try {
        await cj.payOrder(f.remoteOrderId);
        f.paymentStatus = "paid";
        pushEvent(order, "supplier_paid", "Pago al proveedor confirmado desde el saldo CJ");
        save();
        await syncSupplierOrder(order);
      } catch (error) {
        f.paymentStatus = "failed";
        f.lastError = `Pago al proveedor: ${error.message}`.slice(0, 300);
        f.errorCode = error.code || null;
        pushEvent(order, "payment_error", f.lastError);
        save();
        throw error;
      }
    }

    if (f.status === "processing" || f.status === "submitted") {
      f.nextRetryAt = null;
    }
  } catch (error) {
    f.lastError = String(error.message || "Error de fulfillment").slice(0, 300);
    f.errorCode = error.code || null;
    f.status = f.attempts >= MAX_ATTEMPTS ? "failed" : "retry";
    f.nextRetryAt = new Date(Date.now() + retryDelayMs(f.attempts)).toISOString();
    pushEvent(order, "error", `CJ: ${f.lastError}`);
    pushTimeline(
      order,
      "processing",
      f.status === "failed"
        ? "El proveedor rechazó la orden · requiere revisión manual"
        : "Reintentando el alta en el proveedor",
    );
    save();
  }
}

/** Procesa altas pendientes con un lock simple y re-ejecución al terminar. */
export async function processFulfillmentQueue() {
  if (provider !== "cj") return { skipped: true, reason: "provider_not_cj" };
  if (processing) {
    rerun = true;
    return { skipped: true, reason: "busy" };
  }

  processing = true;
  let processed = 0;
  try {
    const now = Date.now();
    const orders = getDb().orders.filter((order) => {
      const f = order.fulfillment;
      if (!f || f.provider !== "cj") return false;
      if (!["queued", "retry"].includes(f.status)) return false;
      if (f.nextRetryAt && Date.parse(f.nextRetryAt) > now) return false;
      return true;
    });

    for (const order of orders) {
      await attemptFulfillment(order);
      processed += 1;
    }
  } finally {
    processing = false;
    if (rerun) {
      rerun = false;
      const timer = setTimeout(() => processFulfillmentQueue().catch(() => {}), 0);
      timer.unref?.();
    }
  }

  return { processed, supplier: supplierStatus() };
}

/** Poll de tracking para pedidos CJ abiertos (batch pequeño por rate limit). */
export async function syncOpenOrders({ limit = 20 } = {}) {
  if (provider !== "cj") return { skipped: true, reason: "provider_not_cj" };
  if (syncing) return { skipped: true, reason: "busy" };

  syncing = true;
  const orders = getDb()
    .orders.filter(
      (order) =>
        order.fulfillment?.provider === "cj" &&
        order.fulfillment?.remoteOrderId &&
        !["delivered", "cancelled", "refunded"].includes(order.status),
    )
    .slice(0, limit);

  let updated = 0;
  let failed = 0;

  try {
    for (const order of orders) {
      const before = `${order.fulfillment.status}|${order.fulfillment.tracking}|${order.status}`;
      try {
        await syncSupplierOrder(order);
        const after = `${order.fulfillment.status}|${order.fulfillment.tracking}|${order.status}`;
        if (before !== after) updated += 1;
      } catch (error) {
        failed += 1;
        order.fulfillment.lastError = `Sync: ${String(error.message).slice(0, 260)}`;
        order.fulfillment.lastSyncAt = nowIso();
        save();
      }
    }
  } finally {
    syncing = false;
    lastSyncAt = nowIso();
  }

  return { checked: orders.length, updated, failed, at: lastSyncAt };
}

/** Actualiza un pedido desde un webhook ORDER / LOGISTIC de CJ. */
export async function applySupplierUpdate(order, params = {}, type = "ORDER") {
  const f = order.fulfillment;
  if (!f) return order;

  f.provider = "cj";
  f.remoteOrderId = String(params.cjOrderId || params.orderId || f.remoteOrderId || "") || f.remoteOrderId;
  f.remoteOrderNumber = params.orderNumber || params.orderNum || f.remoteOrderNumber;

  if (type === "LOGISTIC" && !params.orderStatus) {
    const trackingStatus = Number(params.trackingStatus);
    params.orderStatus =
      trackingStatus === 12 ? "DELIVERED" : trackingStatus > 0 ? "SHIPPED" : "UNSHIPPED";
  }

  applyDetail(order, {
    orderStatus: params.orderStatus || params.status,
    trackNumber: params.trackNumber || params.trackingNumber,
    trackingUrl: params.trackingUrl,
    logisticName: params.logisticName,
    paymentDate: params.payDate || params.paymentDate,
    orderNum: params.orderNumber || params.orderNum,
  }, { source: "webhook" });

  save();

  /* Si el webhook no trae tracking pero el pedido sí, refrescamos el detalle. */
  if (!f.tracking && f.remoteOrderId) {
    await syncSupplierOrder(order).catch(() => {});
  }

  return order;
}

export async function retryOrder(order) {
  if (order.fulfillment?.provider !== "cj") {
    const error = new Error("Este pedido no usa el proveedor CJ.");
    error.status = 400;
    throw error;
  }
  order.fulfillment.status = "retry";
  order.fulfillment.attempts = 0;
  order.fulfillment.nextRetryAt = null;
  order.fulfillment.lastError = null;
  order.fulfillment.errorCode = null;
  save();
  return processFulfillmentQueue();
}

/** Avance manual (demo / proveedor manual). Para CJ no inventa tracking. */
export function advanceFulfillment(order, step = "shipped") {
  if (!order) return null;
  if (order.fulfillment?.provider === "cj" && order.fulfillment?.remoteOrderId) {
    return order;
  }

  const now = nowIso();
  if (step === "shipped") {
    if (["shipped", "delivered"].includes(order.fulfillment.status)) return order;
    order.fulfillment.status = "shipped";
    order.fulfillment.tracking =
      order.fulfillment.tracking || `AR${Date.now().toString().slice(-9)}AR`;
    order.fulfillment.carrier = order.fulfillment.carrier || "Andreani";
    order.status = "shipped";
    order.fulfillment.events.push({
      at: now,
      type: "shipped",
      label: `Despachado con ${order.fulfillment.carrier} · ${order.fulfillment.tracking}`,
    });
    order.timeline.push({ at: now, status: "shipped", label: "Pedido despachado" });
    save();
    sendEmail(order, "shipped").catch(() => {});
  }

  if (step === "delivered") {
    order.fulfillment.status = "delivered";
    order.status = "delivered";
    order.fulfillment.events.push({ at: now, type: "delivered", label: "Pedido entregado" });
    order.timeline.push({ at: now, status: "delivered", label: "Pedido entregado" });
    save();
    sendEmail(order, "delivered").catch(() => {});
  }

  return order;
}
