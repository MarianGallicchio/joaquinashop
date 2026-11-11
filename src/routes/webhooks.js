import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { findOrder, markPaymentApproved, markPaymentRejected } from "../orders.js";
import { getDb, markProcessedWebhook, hasProcessedWebhook } from "../store.js";
import { fetchPayment } from "../payments/mercadopago.js";
import { applySupplierUpdate } from "../fulfillment.js";
import * as cj from "../suppliers/cj.js";

export const webhooks = express.Router();

function safeEq(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function byOrderId(orderId) {
  return orderId ? findOrder(orderId) : null;
}

function bySupplierParams(params = {}) {
  const numbers = [params.orderNumber, params.orderNum, ...(params.storeOrderNumbers || [])]
    .filter(Boolean)
    .map(String);
  const db = getDb();
  let order = db.orders.find((item) => numbers.includes(item.id));
  if (!order) {
    const remoteIds = [params.cjOrderId, params.orderId].filter(Boolean).map(String);
    order = db.orders.find(
      (item) =>
        item.fulfillment?.remoteOrderId &&
        remoteIds.includes(String(item.fulfillment.remoteOrderId)),
    );
  }
  return order || null;
}

/* ── MercadoPago ─────────────────────────────────────────────── */
webhooks.post("/mercadopago", async (req, res) => {
  try {
    const secret = config.payments.mercadopago.webhookSecret;
    const signature = req.headers["x-signature"] || "";
    const requestId = req.headers["x-request-id"] || "";
    const dataId = req.query["data.id"] || req.body?.data?.id;

    if (!config.payments.mercadopago.accessToken) {
      return res.status(503).json({ error: "MercadoPago no está configurado." });
    }
    if (secret) {
      const parts = Object.fromEntries(
        String(signature)
          .split(",")
          .map((part) => part.split("=").map((value) => value.trim())),
      );
      const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
      const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
      if (!parts.v1 || !safeEq(parts.v1, expected)) {
        return res.status(401).json({ error: "Firma inválida" });
      }
    } else {
      console.warn("[webhook:mercadopago] MP_WEBHOOK_SECRET no configurado: se procesa sin validar firma (se verifica el pago vía API).");
    }

    if (!dataId) return res.status(200).json({ ok: true, ignored: "sin data.id" });

    const payment = await fetchPayment(dataId);
    const order = byOrderId(payment.external_reference);
    if (!order) return res.status(200).json({ ok: true, ignored: "pedido inexistente" });

    const key = `mp:${dataId}:${payment.status}`;
    if (hasProcessedWebhook(key)) return res.status(200).json({ ok: true, duplicate: true });
    markProcessedWebhook(key);

    if (payment.status === "approved") {
      markPaymentApproved(order, {
        provider: "mercadopago",
        providerId: String(payment.id),
        amount: payment.transaction_amount,
      });
    } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status)) {
      markPaymentRejected(order, { reason: `MercadoPago: ${payment.status}` });
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[webhook:mercadopago]", error.message);
    res.status(500).json({ error: "Error procesando webhook" });
  }
});

/* ── Proveedor de dropshipping (CJ) ──────────────────────────── */
webhooks.post("/cj", async (req, res) => {
  try {
    if (!cj.isConfigured()) {
      return res.status(503).json({ code: 503, result: "error", message: "CJ no configurado" });
    }
    if (!cj.verifyWebhook(req.rawBody, req.headers.sign)) {
      return res.status(401).json({ code: 401, result: "error", message: "Firma inválida" });
    }

    const event = req.body || {};
    if (!event.messageId) {
      return res.status(200).json({ code: 200, result: "success", message: "ignored" });
    }
    if (hasProcessedWebhook(`cj:${event.messageId}`)) {
      return res.status(200).json({ code: 200, result: "success", message: "duplicate" });
    }

    if (["ORDER", "LOGISTIC"].includes(event.type)) {
      const order = bySupplierParams(event.params || {});
      if (order) {
        await applySupplierUpdate(order, event.params || {}, event.type);
      }
    }

    markProcessedWebhook(`cj:${event.messageId}`);
    res.status(200).json({ code: 200, result: "success", message: "ok" });
  } catch (error) {
    console.error("[webhook:cj]", error.message);
    res.status(500).json({ code: 500, result: "error", message: "Error procesando webhook" });
  }
});
