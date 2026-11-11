import { getDb, save } from "./store.js";
import { sendEmail } from "./mailer.js";

const nowIso = () => new Date().toISOString();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let running = false;
let lastRun = null;
let lastResult = null;

function pushTimeline(order, status, label) {
  order.timeline ??= [];
  const last = order.timeline[order.timeline.length - 1];
  if (last?.label === label) return;
  order.timeline.push({ at: nowIso(), status, label });
}

function hoursSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / HOUR;
}

export function getAutomationStatus() {
  return {
    running,
    lastRun,
    lastResult,
    rules: [
      {
        id: "transfer-reminder",
        name: "Recordatorio de transferencia",
        description: "Reenvía instrucciones si el pago por transferencia sigue pendiente más de 6 horas.",
        active: true,
      },
      {
        id: "cash-followup",
        name: "Seguimiento de efectivo",
        description: "Registra seguimiento para coordinar pedidos en efectivo pendientes más de 12 horas.",
        active: true,
      },
      {
        id: "stale-pending-cleanup",
        name: "Limpieza de pedidos pendientes",
        description: "Cancela pedidos pendientes de pago con más de 72 horas sin acreditación.",
        active: true,
      },
      {
        id: "paid-without-fulfillment",
        name: "Alerta de pedidos pagados sin gestión",
        description: "Detecta pedidos pagados que siguen sin avanzar en fulfillment.",
        active: true,
      },
    ],
  };
}

export async function runAutomations({ manual = false } = {}) {
  if (running) return { ok: false, skipped: true, reason: "already_running", lastRun, lastResult };
  running = true;
  const summary = {
    startedAt: nowIso(),
    manual,
    reminders: 0,
    cashFollowups: 0,
    cancelled: 0,
    alerts: 0,
    scanned: 0,
  };
  try {
    const db = getDb();
    for (const order of db.orders || []) {
      summary.scanned += 1;
      const status = order.status;
      const ageHours = hoursSince(order.createdAt);

      // 1) Transfer reminder
      if (order.payment?.method === "transfer" && status === "pending_transfer" && ageHours >= 6 && ageHours < 72) {
        const lastReminder = order.meta?.lastTransferReminderAt;
        if (!lastReminder || hoursSince(lastReminder) >= 24) {
          order.meta = { ...(order.meta || {}), lastTransferReminderAt: nowIso() };
          pushTimeline(order, status, "Recordatorio automático: transferencia pendiente");
          sendEmail(order, "transfer_instructions").catch(() => {});
          summary.reminders += 1;
        }
      }

      // 2) Cash follow-up note
      if (order.payment?.method === "cash" && status === "pending_cash" && ageHours >= 12 && ageHours < 72) {
        const lastFollowup = order.meta?.lastCashFollowupAt;
        if (!lastFollowup || hoursSince(lastFollowup) >= 24) {
          order.meta = { ...(order.meta || {}), lastCashFollowupAt: nowIso() };
          pushTimeline(order, status, "Seguimiento automático: coordinar pago en efectivo");
          summary.cashFollowups += 1;
        }
      }

      // 3) Cancel stale pending
      if (["pending", "pending_transfer", "pending_cash"].includes(status) && ageHours >= 72) {
        order.status = "cancelled";
        order.payment = { ...(order.payment || {}), status: "expired" };
        pushTimeline(order, "cancelled", "Cancelado automáticamente por falta de pago (72 h)");
        summary.cancelled += 1;
      }

      // 4) Alert: paid but fulfillment not started/stuck
      if (["paid", "processing"].includes(status) && ["not_started", "queued", "retry", "failed", "manual"].includes(order.fulfillment?.status)) {
        if (hoursSince(order.paidAt || order.createdAt) >= 2) {
          const lastAlert = order.meta?.lastFulfillmentAlertAt;
          if (!lastAlert || hoursSince(lastAlert) >= 24) {
            order.meta = { ...(order.meta || {}), lastFulfillmentAlertAt: nowIso() };
            pushTimeline(order, status, "Alerta automática: pedido pagado pendiente de gestión");
            summary.alerts += 1;
          }
        }
      }
    }
    save();
    summary.finishedAt = nowIso();
    summary.ok = true;
    lastRun = summary.finishedAt;
    lastResult = summary;
    return summary;
  } catch (error) {
    summary.finishedAt = nowIso();
    summary.ok = false;
    summary.error = error.message;
    lastRun = summary.finishedAt;
    lastResult = summary;
    return summary;
  } finally {
    running = false;
  }
}

let interval = null;
export function startAutomationAgent() {
  if (interval) return;
  // Run once shortly after startup, then every 30 minutes
  setTimeout(() => { runAutomations().catch(() => {}); }, 15_000).unref?.();
  interval = setInterval(() => { runAutomations().catch(() => {}); }, 30 * 60 * 1000);
  interval.unref?.();
}
