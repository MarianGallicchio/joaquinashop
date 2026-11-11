/**
 * Smoke test de navegador de La Joaquina.
 *
 * Levanta una instancia aislada en modo demo y prueba la UI real:
 * búsqueda, orden por precio, estado vacío y compartir producto.
 *
 *   npm run check:browser
 *
 * Usa el Edge o Chrome del sistema mediante playwright-core.
 * Se puede forzar otro ejecutable con BROWSER_PATH.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.BROWSER_SMOKE_PORT) || 4800 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lajoaquina-browser-"));
const TIMEOUT = 8_000;

const browserCandidates = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const browserPath = browserCandidates.find((candidate) => fs.existsSync(candidate));

if (!browserPath) {
  console.error(
    "\n  No se encontró Edge ni Chrome. Instalá uno o definí BROWSER_PATH con el ejecutable.\n",
  );
  process.exit(1);
}

const results = [];
let child = null;
let browser = null;
let context = null;
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

function startServer() {
  child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR,
      BASE_URL: BASE,
      NODE_ENV: "development",
      DEMO_MODE: "true",
      ADMIN_PASSWORD: "browser-smoke-admin",
      SESSION_SECRET: "browser-smoke-session-secret-at-least-32-chars",
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

async function waitForHealth(timeoutMs = 15_000) {
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

async function waitForCount(page, expected) {
  await page.waitForFunction(
    (value) => document.querySelector("#catalog-count")?.textContent?.trim() === value,
    expected,
    { timeout: TIMEOUT },
  );
}

async function main() {
  console.log(`\n  La Joaquina · browser smoke en ${BASE}\n`);
  startServer();
  await waitForHealth();

  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await check("el catálogo carga los 46 productos", async () => {
    await page.goto(`${BASE}/#bestsellers`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#product-grid .card", { timeout: TIMEOUT });
    await waitForCount(page, "46 de 46 productos");
    assert.equal(await page.locator("#product-grid .card").count(), 46);
  });

  await check("la búsqueda filtra y muestra el contador", async () => {
    await page.locator("#product-search").fill("massage");
    await waitForCount(page, "1 de 46 productos");
    assert.equal(await page.locator("#product-grid .card").count(), 1);
    assert.match(await page.locator("#product-grid .card__name").innerText(), /Massage Gun/i);
  });

  await check("el stock se ve en la tienda y el panel logístico abre", async () => {
    await page.locator("#product-search").fill("");
    await waitForCount(page, "46 de 46 productos");
    assert.equal(await page.locator("#product-grid .card__stock").count(), 46);

    const adminPage = await context.newPage();
    await adminPage.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await adminPage.fill("#admin-password", "browser-smoke-admin");
    await adminPage.click("#login-submit");
    await adminPage.waitForSelector("#app:not([hidden])", { timeout: TIMEOUT });
    await adminPage.waitForFunction(
      () => document.querySelector("#nav-logistics")?.textContent?.trim() !== "—",
      null,
      { timeout: TIMEOUT },
    );
    await adminPage.click('[data-view="logistica"]');
    await adminPage.waitForFunction(
      () => document.querySelector("#view-title")?.textContent === "Logística y stock",
      null,
      { timeout: TIMEOUT },
    );
    assert.equal(await adminPage.locator("#view-title").innerText(), "Logística y stock");
    await adminPage.waitForSelector(".kpi", { timeout: TIMEOUT });
    assert.ok((await adminPage.locator(".kpi").count()) >= 4, "faltan los KPIs logísticos");

    await adminPage.click('[data-view="productos"]');
    await adminPage.waitForSelector(".stock-editor", { timeout: TIMEOUT });
    assert.ok((await adminPage.locator(".stock-editor").count()) >= 40, "faltan editores de stock");

    await adminPage.click('[data-view="logistica"]');
    await adminPage.waitForSelector('[data-orders-filter="paid"]', { timeout: TIMEOUT });
    await adminPage.click('[data-orders-filter="paid"]');
    await adminPage.waitForFunction(
      () => document.querySelector("#view-title")?.textContent === "Pedidos",
      null,
      { timeout: TIMEOUT },
    );
    assert.equal(await adminPage.locator(".admin-filter.is-active").innerText(), "Pagados");
    await adminPage.close();
  });

  await check("el orden por menor precio ordena todo el catálogo", async () => {
    await page.locator("#product-search").fill("");
    await page.selectOption("#product-sort", "price-asc");
    await page.waitForFunction(
      () => {
        const count = document.querySelector("#catalog-count")?.textContent?.trim();
        const cards = [...document.querySelectorAll("#product-grid .card")];
        if (count !== "46 de 46 productos" || cards.length !== 46) return false;
        const prices = cards.map((card) =>
          Number((card.querySelector(".price")?.textContent || "").replace(/\D/g, "")),
        );
        return prices.every(
          (price, index) => price > 0 && (index === 0 || prices[index - 1] <= price),
        );
      },
      null,
      { timeout: TIMEOUT },
    );
  });

  await check("el estado vacío se muestra y se puede reiniciar", async () => {
    await page.locator("#product-search").fill("zzzz");
    await page.waitForSelector(".catalog-empty", { timeout: TIMEOUT });
    await waitForCount(page, "0 de 46 productos");
    assert.equal(await page.locator("#product-search").inputValue(), "zzzz");

    await page.locator("[data-reset-filters]").click();
    await waitForCount(page, "46 de 46 productos");
    assert.equal(await page.locator("#product-search").inputValue(), "");
    assert.equal(await page.locator("#product-sort").inputValue(), "featured");
  });

  await check("compartir producto copia la URL de la ficha", async () => {
    const sharePage = await context.newPage();
    await sharePage.goto(`${BASE}/producto.html?id=massage-gun`, { waitUntil: "domcontentloaded" });
    await sharePage.waitForSelector("#pdp-title", { timeout: TIMEOUT });

    const stubbed = await sharePage.evaluate(() => {
      window.__copiedShareUrl = null;
      const fakeClipboard = {
        writeText: async (value) => {
          window.__copiedShareUrl = value;
        },
      };
      const shareDisabled = (() => {
        try {
          Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
        } catch {
          /* si no se puede pisar, se verifica abajo */
        }
        return typeof navigator.share !== "function";
      })();
      try {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: fakeClipboard });
      } catch {
        try {
          Object.defineProperty(Navigator.prototype, "clipboard", {
            configurable: true,
            get: () => fakeClipboard,
          });
        } catch {
          /* se verifica abajo */
        }
      }
      return {
        shareDisabled,
        clipboardReady: navigator.clipboard?.writeText === fakeClipboard.writeText,
      };
    });

    assert.equal(stubbed.shareDisabled, true, "no se pudo desactivar navigator.share");
    assert.equal(stubbed.clipboardReady, true, "no se pudo preparar el portapapeles de prueba");

    await sharePage.locator("#share-product").click();
    await sharePage.waitForFunction(() => Boolean(window.__copiedShareUrl), null, {
      timeout: TIMEOUT,
    });
    assert.equal(await sharePage.evaluate(() => window.__copiedShareUrl), sharePage.url());
    assert.match(await sharePage.locator(".toast.is-on").innerText(), /Link copiado/i);
    await sharePage.close();
  });

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n  ${results.length - failed.length}/${results.length} browser checks OK${failed.length ? ` · ${failed.length} fallaron` : ""}\n`,
  );

  if (failed.length) {
    console.log(logs.join("").split("\n").slice(-25).join("\n"));
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(`\n  Browser smoke interrumpido: ${error.message}\n`);
  console.error(logs.join("").split("\n").slice(-25).join("\n"));
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  stopServer();
}
