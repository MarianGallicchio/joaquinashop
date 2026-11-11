/**
 * Smoke test del dropshipping real (CJ) contra un servidor CJ simulado.
 *
 * Verifica: autenticación, alta de pedido, pago automático, tracking,
 * webhook firmado, idempotencia y reintento desde el backoffice.
 *
 *   npm run check:supplier
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_PORT = 4700 + Math.floor(Math.random() * 150);
const CJ_PORT = APP_PORT + 200;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lajoaquina-supplier-"));
const OPEN_ID = "12345";
const ADMIN_PASSWORD = "supplier-test";

const results = [];
const logs = [];
let app = null;
let cjServer = null;

const fake = {
  failNextCreate: false,
  counter: 1000,
  orders: new Map(),
  lastCreateBody: null,
  calls: [],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await response.json() : await response.text();
  return { status: response.status, body };
}

function json(payload, method = "POST") {
  return { method, body: JSON.stringify(payload) };
}

function startCj() {
  cjServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const url = new URL(req.url, `http://127.0.0.1:${CJ_PORT}`);
      const payload = raw ? JSON.parse(raw) : {};
      fake.calls.push({ path: url.pathname, payload });
      const send = (data) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };

      if (url.pathname.endsWith("/authentication/getAccessToken")) {
        return send({
          code: 200,
          result: true,
          message: "Success",
          data: {
            accessToken: "test-access-token",
            openId: 12345,
            accessTokenExpiryDate: "2099-01-01T00:00:00+08:00",
          },
        });
      }

      if (url.pathname.endsWith("/shopping/order/createOrderV2")) {
        fake.lastCreateBody = payload;
        if (fake.failNextCreate) {
          fake.failNextCreate = false;
          return send({ code: 1600100, result: false, message: "Insufficient inventory." });
        }
        fake.counter += 1;
        const orderId = `CJ-${fake.counter}`;
        fake.orders.set(orderId, { paid: false, orderNumber: payload.orderNumber });
        return send({
          code: 200,
          result: true,
          data: { orderId, orderNumber: payload.orderNumber, orderStatus: "UNPAID" },
        });
      }

      if (url.pathname.endsWith("/shopping/sandbox/simulatePay")) {
        const order = fake.orders.get(payload.orderId);
        if (!order) return send({ code: 803, result: false, message: "Order not found." });
        order.paid = true;
        return send({ code: 200, result: true, data: true });
      }

      if (url.pathname.endsWith("/shopping/order/getOrderDetail")) {
        const orderId = url.searchParams.get("orderId");
        const order = fake.orders.get(orderId);
        if (!order) return send({ code: 803, result: false, message: "Order not found." });
        return send({
          code: 200,
          result: true,
          data: {
            orderId,
            orderNum: order.orderNumber,
            orderStatus: order.paid ? "SHIPPED" : "UNPAID",
            trackNumber: order.paid ? "CJTRACK123" : null,
            trackingUrl: order.paid ? "https://track.example/CJTRACK123" : null,
            logisticName: "CJPacket Ordinary",
            paymentDate: order.paid ? "2026-11-05 10:00:00" : null,
          },
        });
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 404, result: false, message: "Not found" }));
    });
  });

  return new Promise((resolve) => cjServer.listen(CJ_PORT, "127.0.0.1", resolve));
}

function startApp() {
  app = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      DATA_DIR,
      BASE_URL: BASE,
      NODE_ENV: "development",
      DEMO_MODE: "true",
      ADMIN_PASSWORD,
      SESSION_SECRET: "supplier-smoke-session-secret-at-least-32-chars",
      SUPPLIER_PROVIDER: "cj",
      SUPPLIER_AUTO_PAY: "true",
      SUPPLIER_SYNC_MINUTES: "15",
      CJ_API_KEY: "test-api-key",
      CJ_OPEN_ID: OPEN_ID,
      CJ_BASE_URL: `http://127.0.0.1:${CJ_PORT}/api2.0/v1`,
      CJ_SANDBOX: "true",
      CJ_LOGISTIC_NAME: "CJPacket Ordinary",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk) => {
    logs.push(chunk.toString());
    if (logs.length > 60) logs.shift();
  };
  app.stdout.on("data", capture);
  app.stderr.on("data", capture);
}

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      /* arrancando */
    }
    await sleep(250);
  }
  throw new Error(`La app no respondió.\n${logs.join("")}`);
}

const customer = {
  name: "Cliente CJ",
  email: "cj@lajoaquina.shop",
  phone: "+54 9 11 5555 7777",
  address: "Av. Corrientes 1234",
  city: "CABA",
  province: "CABA",
  postal: "C1043",
};

async function createAndApprove(email) {
  const created = await api(
    "/api/checkout",
    json({
      customer: { ...customer, email },
      items: [{ id: "massage-gun", qty: 1 }],
      country: "Argentina",
      paymentMethod: "demo",
      channel: "meta",
    }),
  );
  assert(created.status === 201, `checkout ${created.status}: ${created.body.error || ""}`);
  const order = created.body;

  const approved = await api(
    `/api/demo/pay/${order.order.id}`,
    json({ token: order.token, action: "approve" }),
  );
  assert(approved.status === 200, `pago ${approved.status}`);
  return order;
}

async function orderState(orderId, token) {
  const { body } = await api(`/api/orders/${orderId}?token=${token}`);
  return body.order;
}

async function waitFor(orderId, token, predicate, timeoutMs = 8000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await orderState(orderId, token);
    if (predicate(last)) return last;
    await sleep(200);
  }
  throw new Error(`Timeout esperando el pedido. Último estado: ${JSON.stringify(last?.fulfillment || last)}`);
}

function sign(raw) {
  return crypto.createHmac("sha256", OPEN_ID).update(raw).digest("base64");
}

async function main() {
  console.log(`\n  La Joaquina · supplier smoke (CJ simulado) en ${BASE}\n`);
  await startCj();
  startApp();
  await waitForHealth();

  let first = null;

  await check("la app arranca con proveedor CJ configurado", async () => {
    const { status, body } = await api("/api/health");
    assert(status === 200 && body.ok, `health ${status}`);
  });

  await check("el alta en CJ envía SKU, sandbox y pago automático", async () => {
    first = await createAndApprove("cj-first@lajoaquina.shop");
    const order = await waitFor(
      first.order.id,
      first.token,
      (item) => item.fulfillment?.supplierRef && item.fulfillment?.tracking,
    );

    assert(order.fulfillment.provider === "cj", `proveedor ${order.fulfillment.provider}`);
    assert(order.fulfillment.supplierRef.startsWith("CJ-"), "falta id remoto");
    assert(order.fulfillment.tracking === "CJTRACK123", "tracking incorrecto");
    assert(order.status === "shipped", `estado ${order.status}`);
    assert(order.fulfillment.paymentStatus === "paid", "el pago al proveedor no quedó pago");

    const body = fake.lastCreateBody;
    assert(body?.orderNumber === first.order.id, "orderNumber no coincide");
    assert(body?.isSandbox === 1, "no se envió isSandbox");
    assert(body?.payType === 2, "no se pidió pago automático");
    assert(body?.products?.[0]?.sku === "LJ-001", `SKU ${body?.products?.[0]?.sku}`);
    assert(body?.shippingCountryCode === "AR", "país mal mapeado");
    assert(fake.calls.some((call) => call.path.endsWith("/sandbox/simulatePay")), "no pagó en CJ");
  });

  await check("el webhook firmado actualiza a entregado", async () => {
    const raw = JSON.stringify({
      messageId: `cj-delivered-${Date.now()}`,
      type: "ORDER",
      messageType: "UPDATE",
      params: {
        orderNumber: first.order.id,
        cjOrderId: "CJ-1001",
        orderStatus: "DELIVERED",
        trackNumber: "CJTRACK123",
        logisticName: "CJPacket Ordinary",
        payDate: "2026-11-05 10:00:00",
      },
    });

    const response = await fetch(`${BASE}/api/webhooks/cj`, {
      method: "POST",
      headers: { "Content-Type": "application/json", sign: sign(raw) },
      body: raw,
    });
    assert(response.status === 200, `webhook ${response.status}`);

    const order = await orderState(first.order.id, first.token);
    assert(order.status === "delivered", `estado ${order.status}`);
    assert(order.timeline.some((event) => event.status === "delivered"), "falta evento entregado");
  });

  await check("el webhook rechaza firmas inválidas y duplicados", async () => {
    const raw = JSON.stringify({
      messageId: `cj-replay-${Date.now()}`,
      type: "ORDER",
      messageType: "UPDATE",
      params: { orderNumber: first.order.id, orderStatus: "SHIPPED" },
    });

    const invalid = await fetch(`${BASE}/api/webhooks/cj`, {
      method: "POST",
      headers: { "Content-Type": "application/json", sign: "firma-falsa" },
      body: raw,
    });
    assert(invalid.status === 401, `firma inválida devolvió ${invalid.status}`);

    const firstSend = await fetch(`${BASE}/api/webhooks/cj`, {
      method: "POST",
      headers: { "Content-Type": "application/json", sign: sign(raw) },
      body: raw,
    });
    assert(firstSend.status === 200, `webhook ${firstSend.status}`);

    const replay = await fetch(`${BASE}/api/webhooks/cj`, {
      method: "POST",
      headers: { "Content-Type": "application/json", sign: sign(raw) },
      body: raw,
    });
    assert(replay.status === 200, `duplicado ${replay.status}`);
    const data = await replay.json();
    assert(data.message === "duplicate", `duplicado respondió ${data.message}`);
  });

  await check("el backoffice muestra el proveedor y la cola", async () => {
    const login = await api("/api/admin/login", json({ password: ADMIN_PASSWORD }));
    assert(login.status === 200, `login ${login.status}`);
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const { status, body } = await api("/api/admin/overview?days=30", { headers });
    assert(status === 200, `overview ${status}`);
    const supplier = body.flags.supplier;
    assert(supplier.provider === "cj", `proveedor ${supplier.provider}`);
    assert(supplier.mode === "sandbox", `modo ${supplier.mode}`);
    assert(supplier.configured === true, "no figura configurado");
    assert(supplier.autoPay === true, "no figura pago automático");
    assert(supplier.callbackUrl.endsWith("/api/webhooks/cj"), "callback incorrecto");
  });

  await check("un error de CJ queda en cola y se reintenta desde el admin", async () => {
    fake.failNextCreate = true;
    const second = await createAndApprove("cj-retry@lajoaquina.shop");
    const failed = await waitFor(
      second.order.id,
      second.token,
      (item) => ["retry", "failed"].includes(item.fulfillment?.status),
    );
    assert(failed.fulfillment.status === "retry", `estado ${failed.fulfillment.status}`);

    const login = await api("/api/admin/login", json({ password: ADMIN_PASSWORD }));
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const detail = await api(`/api/admin/orders/${second.order.id}`, { headers });
    assert(detail.status === 200, `detalle admin ${detail.status}`);
    assert(
      detail.body.order.fulfillment.lastError?.includes("Insufficient inventory"),
      `no registró el error: ${JSON.stringify(detail.body.order.fulfillment)}`,
    );

    const retry = await api(`/api/admin/orders/${second.order.id}/retry`, {
      method: "POST",
      headers,
      body: "{}",
    });
    assert(retry.status === 200, `retry ${retry.status}: ${retry.body.error || ""}`);

    const recovered = await waitFor(
      second.order.id,
      second.token,
      (item) => item.status === "shipped",
    );
    assert(recovered.fulfillment.supplierRef, "no se creó el pedido remoto");
    assert(recovered.fulfillment.tracking === "CJTRACK123", "sin tracking tras reintento");
  });

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n  ${results.length - failed.length}/${results.length} checks OK${failed.length ? ` · ${failed.length} fallaron` : ""}\n`,
  );

  if (failed.length) {
    console.log(logs.join("").split("\n").slice(-25).join("\n"));
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(`\n  Supplier smoke interrumpido: ${error.message}\n`);
  console.error(logs.join("").split("\n").slice(-30).join("\n"));
  process.exitCode = 1;
} finally {
  if (app) app.kill();
  if (cjServer) cjServer.close();
}
