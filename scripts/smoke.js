/**
 * Smoke test end-to-end de La Joaquina.
 *
 * Levanta una instancia aislada (puerto propio) y recorre el flujo completo:
 * catálogo → cotización → checkout → pago → proveedor → seguimiento → admin.
 * No necesita claves reales: usa el modo demo.
 *
 *   npm run check
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.SMOKE_PORT) || 4400 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lajoaquina-smoke-"));

const results = [];
let child = null;
const logs = [];

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      results.push({ name, ok: true });
      console.log(`  ✓ ${name}`);
    })
    .catch((error) => {
      results.push({ name, ok: false, error: error.message });
      console.log(`  ✗ ${name}\n      ${error.message}`);
    });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json")
    ? await response.json()
    : await response.text();
  return { status: response.status, body, headers: response.headers };
}

function json(payload) {
  return { method: "POST", body: JSON.stringify(payload) };
}

function startServer() {
  child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR,
      BASE_URL: BASE,
      DEMO_MODE: "true",
      NODE_ENV: "development",
      /* Aísla el smoke test de las credenciales reales de .env. */
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "lajoaquina2026",
      SESSION_SECRET: process.env.SESSION_SECRET || "smoke-test-session-secret-at-least-32-chars",
      SUPPLIER_PROVIDER: "demo",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk) => {
    logs.push(chunk.toString());
    if (logs.length > 60) logs.shift();
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
}

async function waitForHealth(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      /* todavía arrancando */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`El servidor no respondió en ${BASE}\n${logs.join("")}`);
}

function stopServer() {
  if (!child) return;
  child.kill();
  child = null;
}

const customer = {
  name: "QA Automatizado",
  email: "qa@lajoaquina.shop",
  phone: "+54 9 11 5555 0000",
  address: "Av. Córdoba 1234",
  city: "CABA",
  province: "CABA",
  postal: "C1055",
};

async function main() {
  console.log(`\n  La Joaquina · smoke test en ${BASE}\n`);
  startServer();
  await waitForHealth();

  let demoOrder = null;
  let transferOrder = null;

  await check("health responde ok", async () => {
    const { status, body } = await request("/api/health");
    assert(status === 200 && body.ok === true, `status ${status}`);
  });

  await check("home renderiza HTML con la marca", async () => {
    const { status, body } = await request("/");
    assert(status === 200, `status ${status}`);
    assert(String(body).includes("La Joaquina"), "no aparece La Joaquina en el HTML");
  });

  await check("catálogo trae productos y precios", async () => {
    const { status, body } = await request("/api/catalog");
    assert(status === 200, `status ${status}`);
    assert(body.products?.length >= 40, `solo ${body.products?.length} productos`);
    assert(body.products.every((p) => p.priceArs > 0), "hay productos sin precio");
    assert(body.products.every((p) => p.costArs === undefined), "el catálogo expone costos internos");
  });

  await check("el precio con tarjeta se aplica solo a métodos de tarjeta", async () => {
    const card = await request(
      "/api/quote",
      json({
        items: [{ id: "massage-gun", qty: 1 }],
        country: "Argentina",
        paymentMethod: "stripe",
      }),
    );
    assert(card.status === 200, `tarjeta status ${card.status}`);
    assert(card.body.priceMode === "card", `priceMode ${card.body.priceMode}`);
    assert(card.body.items[0].unitPrice === 20900, `precio tarjeta ${card.body.items[0].unitPrice}`);

    const cash = await request(
      "/api/quote",
      json({
        items: [{ id: "massage-gun", qty: 1 }],
        country: "Argentina",
        paymentMethod: "transfer",
      }),
    );
    assert(cash.status === 200, `transferencia status ${cash.status}`);
    assert(cash.body.priceMode === "cash", `priceMode ${cash.body.priceMode}`);
    assert(cash.body.items[0].unitPrice === 18900, `precio efectivo ${cash.body.items[0].unitPrice}`);
  });

  await check("cotización con cupón calcula descuento", async () => {
    const { status, body } = await request(
      "/api/quote",
      json({ items: [{ id: "massage-gun", qty: 1 }], couponCode: "JOAQUINA10", country: "Argentina" }),
    );
    assert(status === 200, `status ${status}`);
    assert(body.discount > 0, "el cupón no descontó");
    assert(body.total === body.subtotal - body.discount + body.shipping, "totales inconsistentes");
  });

  await check("checkout demo crea pedido y link de pago", async () => {
    const { status, body } = await request(
      "/api/checkout",
      json({
        customer,
        items: [{ id: "massage-gun", qty: 1 }],
        country: "Argentina",
        paymentMethod: "demo",
        channel: "meta",
      }),
    );
    assert(status === 201, `status ${status}: ${body.error || ""}`);
    assert(body.order?.id && body.token, "falta id o token");
    assert(body.payment?.url?.includes("/pago/demo.html"), "no generó el link de la pasarela");
    demoOrder = body;
  });

  await check("checkout con tarjeta persiste el precio con tarjeta", async () => {
    const { status, body } = await request(
      "/api/checkout",
      json({
        customer: { ...customer, email: "card@lajoaquina.shop" },
        items: [{ id: "massage-gun", qty: 1 }],
        country: "Argentina",
        paymentMethod: "stripe",
      }),
    );
    assert(status === 201, `status ${status}: ${body.error || ""}`);
    assert(body.order.totals.subtotal === 20900, `subtotal ${body.order.totals.subtotal}`);
    assert(body.order.totals.priceMode === "card", `priceMode ${body.order.totals.priceMode}`);
  });

  await check("pedido sin token no es accesible", async () => {
    const { status } = await request(`/api/orders/${demoOrder.order.id}?token=incorrecto`);
    assert(status === 404, `status ${status}`);
  });

  await check("pago aprobado dispara alta en el proveedor", async () => {
    const { status, body } = await request(
      `/api/demo/pay/${demoOrder.order.id}`,
      json({ token: demoOrder.token, action: "approve" }),
    );
    assert(status === 200, `status ${status}`);
    assert(body.order.status === "paid", `estado ${body.order.status}`);
    assert(body.order.payment.status === "approved", "el pago no quedó aprobado");
    assert(body.order.fulfillment.supplierRef, "no se creó la orden del proveedor");
    assert(body.order.fulfillment.status === "processing", "el fulfillment no arrancó");
  });

  await check("el seguimiento público refleja el pago", async () => {
    const { status, body } = await request(
      `/api/orders/${demoOrder.order.id}?token=${demoOrder.token}`,
    );
    assert(status === 200, `status ${status}`);
    assert(body.order.paidAt, "falta paidAt");
    assert(body.order.timeline.some((event) => event.status === "paid"), "falta evento de pago");
  });

  await check("transferencia entrega instrucciones y concilia", async () => {
    const created = await request(
      "/api/checkout",
      json({
        customer: { ...customer, email: "transfer@lajoaquina.shop" },
        items: [{ id: "set-jarra-4", qty: 1 }],
        country: "Argentina",
        paymentMethod: "transfer",
      }),
    );
    assert(created.status === 201, `checkout status ${created.status}`);
    transferOrder = created.body;
    const instructions = created.body.order.payment.instructions;
    assert(instructions?.alias && instructions?.holder, "faltan datos bancarios");
    assert(!instructions.cbu || /^\d{22}$/.test(instructions.cbu), "CBU inválido");
    assert(instructions.concept === created.body.order.id, "el concepto no es el pedido");

    const wrong = await request(
      `/api/orders/${created.body.order.id}/receipt`,
      json({ token: created.body.token, amount: 1, reference: "000" }),
    );
    assert(wrong.status === 200 && wrong.body.approved === false, "aprobó un comprobante inválido");
    assert(wrong.body.order.status === "payment_review", "no quedó en revisión");

    const ok = await request(
      `/api/orders/${created.body.order.id}/receipt`,
      json({
        token: created.body.token,
        amount: created.body.order.totals.total,
        reference: created.body.order.id.replace("LJ-", ""),
      }),
    );
    assert(ok.body.approved === true, "no concilió el comprobante correcto");
    assert(ok.body.order.status === "paid", `estado ${ok.body.order.status}`);
  });

  await check("el admin controla stock, confirma pagos y carga seguimiento", async () => {
    const login = await request(
      "/api/admin/login",
      json({ password: process.env.ADMIN_PASSWORD || "lajoaquina2026" }),
    );
    assert(login.status === 200 && login.body.token, "no entregó token de admin");
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const logistics = await request("/api/admin/logistics", { headers: auth });
    assert(logistics.status === 200, `logística status ${logistics.status}`);
    assert(Array.isArray(logistics.body.inventory) && logistics.body.inventory.length >= 40, "inventario incompleto");
    assert(Number.isFinite(logistics.body.summary?.toShip), "faltan KPIs logísticos");

    const blocked = await request("/api/admin/inventory/massage-gun", {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ stock: 0 }),
    });
    assert(blocked.status === 200 && blocked.body.inventory.stock === 0, "no se pudo ajustar el stock");
    const soldOut = await request(
      "/api/checkout",
      json({
        customer: { ...customer, email: "stock@lajoaquina.shop" },
        items: [{ id: "massage-gun", qty: 1 }],
        country: "Argentina",
        paymentMethod: "transfer",
      }),
    );
    assert(soldOut.status === 409, `el checkout sin stock devolvió ${soldOut.status}`);
    await request("/api/admin/inventory/massage-gun", {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ stock: 20, reason: "Fin del smoke test" }),
    });

    const created = await request(
      "/api/checkout",
      json({
        customer: { ...customer, email: "manual@lajoaquina.shop" },
        items: [{ id: "set-jarra-4", qty: 1 }],
        country: "Argentina",
        paymentMethod: "transfer",
      }),
    );
    assert(created.status === 201, `checkout manual status ${created.status}`);
    const confirmed = await request(`/api/admin/orders/${created.body.order.id}/confirm-payment`, {
      method: "POST",
      headers: auth,
      body: "{}",
    });
    assert(confirmed.status === 200, `confirmación status ${confirmed.status}`);
    assert(confirmed.body.order.status === "paid", `estado ${confirmed.body.order.status}`);

    const shipment = await request(`/api/admin/orders/${transferOrder.order.id}/shipment`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        carrier: "Andreani",
        tracking: "QA123456789",
        trackingUrl: "https://example.com/track/QA123456789",
        notify: false,
      }),
    });
    assert(shipment.status === 200, `envío status ${shipment.status}`);
    assert(shipment.body.order.status === "shipped", `estado ${shipment.body.order.status}`);
    const tracked = await request(`/api/orders/${transferOrder.order.id}?token=${transferOrder.token}`);
    assert(tracked.body.order.fulfillment.tracking === "QA123456789", "el tracking no llegó al cliente");
    assert(tracked.body.order.fulfillment.carrier === "Andreani", "el transporte no llegó al cliente");

    const delivered = await request(`/api/admin/orders/${transferOrder.order.id}/deliver`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ notify: false }),
    });
    assert(delivered.status === 200, `entrega status ${delivered.status}`);
    assert(delivered.body.order.status === "delivered", `estado ${delivered.body.order.status}`);
  });

  await check("cripto entrega dirección y monto único", async () => {
    const { status, body } = await request(
      "/api/checkout",
      json({
        customer: { ...customer, email: "crypto@lajoaquina.shop" },
        items: [{ id: "cubo-fidget", qty: 1 }],
        country: "Argentina",
        paymentMethod: "crypto",
      }),
    );
    assert(status === 201, `status ${status}`);
    const instructions = body.order.payment.instructions;
    assert(instructions?.address, "falta dirección USDT");
    assert(Number(instructions.cryptoAmount) > 0, "monto cripto inválido");
  });

  await check("webhook sin firma no aprueba pagos", async () => {
    const created = await request(
      "/api/checkout",
      json({
        customer: { ...customer, email: "webhook@lajoaquina.shop" },
        items: [{ id: "sellador-portatil", qty: 1 }],
        country: "Argentina",
        paymentMethod: "crypto",
      }),
    );
    assert(created.status === 201, `checkout status ${created.status}`);
    const target = created.body;

    const hook = await request("/api/webhooks/crypto", {
      method: "POST",
      body: JSON.stringify({ order_id: target.order.id, payment_status: "finished" }),
    });

    const after = await request(`/api/orders/${target.order.id}?token=${target.token}`);
    assert(after.body.order.status !== "paid", "un webhook sin firma aprobó el pedido");
    assert(hook.status >= 400 || hook.status === 200, `status inesperado ${hook.status}`);
  });

  await check("admin protege y expone métricas", async () => {
    const denied = await request("/api/admin/overview");
    assert(denied.status === 401, `sin token status ${denied.status}`);

    const bad = await request("/api/admin/login", json({ password: "no-es" }));
    assert(bad.status === 401, `clave incorrecta status ${bad.status}`);

    const login = await request(
      "/api/admin/login",
      json({ password: process.env.ADMIN_PASSWORD || "lajoaquina2026" }),
    );
    assert(login.status === 200 && login.body.token, "no entregó token");
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const overview = await request("/api/admin/overview?days=30", { headers: auth });
    assert(overview.status === 200, `overview status ${overview.status}`);
    assert(overview.body.metrics?.kpis && Number.isFinite(overview.body.metrics.kpis.revenue), "faltan KPIs");
    assert(overview.body.metrics.daily?.length === 30, "la serie diaria no cubre el rango");

    const csv = await request("/api/admin/export.csv", { headers: auth });
    assert(csv.status === 200, `csv status ${csv.status}`);
    assert(String(csv.headers.get("content-type")).includes("text/csv"), "content-type incorrecto");

    const current = await request("/api/admin/settings", { headers: auth });
    assert(current.status === 200 && current.body.settings?.whatsapp, "no expone ajustes");
    const saved = await request("/api/admin/settings", {
      method: "POST",
      headers: auth,
      body: JSON.stringify(current.body.settings),
    });
    assert(saved.status === 200, `guardar ajustes status ${saved.status}`);
    assert(saved.body.settings.whatsapp === current.body.settings.whatsapp, "el WhatsApp cambió al guardar");
  });

  await check("backoffice y playbook sirven sus páginas", async () => {
    for (const route of ["/admin", "/playbook", "/legal", "/tienda"]) {
      const { status } = await request(route);
      assert(status === 200, `${route} → ${status}`);
    }
    const missing = await request("/ruta-que-no-existe");
    assert(missing.status === 404, `404 status ${missing.status}`);
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
  console.error(`\n  Smoke test interrumpido: ${error.message}\n`);
  console.error(logs.join("").split("\n").slice(-25).join("\n"));
  process.exitCode = 1;
} finally {
  stopServer();
}
