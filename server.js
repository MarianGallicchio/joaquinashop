import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./src/config.js";
import { getDb } from "./src/store.js";
import { api } from "./src/routes/api.js";
import { admin } from "./src/routes/admin.js";
import { webhooks } from "./src/routes/webhooks.js";
import { rateLimit } from "./src/auth.js";
import { processFulfillmentQueue, syncOpenOrders } from "./src/fulfillment.js";
import { startAutomationAgent } from "./src/automations.js";
import { startBackupScheduler } from "./src/backups.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (config.env === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (req.path.startsWith("/api/admin") || req.path.startsWith("/api/orders")) {
    res.setHeader("Cache-Control", "no-store");
  }
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  );
  next();
});

app.use(
  express.json({
    limit: "256kb",
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);

/* Webhooks necesitan el cuerpo crudo para validar firmas */
app.use("/api/webhooks", webhooks);

app.use("/api/admin", admin);
app.use("/api", rateLimit({ key: "api", max: 240 }), api);

app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      const isCode = /\.(js|css)$/.test(filePath);
      if (filePath.endsWith("admin.html")) res.setHeader("Cache-Control", "no-store");
      else if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      else if (isCode && config.env !== "production") res.setHeader("Cache-Control", "no-cache");
      else res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }),
);

const pages = {
  "/tienda": "index.html",
  "/producto": "producto.html",
  "/checkout": "checkout.html",
  "/pedido": "pedido.html",
  "/admin": "admin.html",
  "/playbook": "playbook.html",
  "/legal": "legal.html",
};
for (const [route, file] of Object.entries(pages)) {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, "public", file)));
}

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Endpoint no encontrado." });
  }
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) console.error("[server]", error);
  res.status(status).json({
    error: error.status ? error.message : "Error interno. Intentá de nuevo.",
  });
});

/* Inicializa la base de datos. */
getDb();
startAutomationAgent();
startBackupScheduler();

/* Reanuda la cola de fulfillment y el polling de tracking del proveedor. */
if (config.suppliers.provider === "cj") {
  processFulfillmentQueue().catch((error) => console.error("[fulfillment]", error.message));
  const queueTimer = setInterval(() => {
    processFulfillmentQueue().catch((error) => console.error("[fulfillment]", error.message));
  }, 60_000);
  queueTimer.unref?.();
  const syncTimer = setInterval(() => {
    syncOpenOrders().catch((error) => console.error("[fulfillment:sync]", error.message));
  }, Math.max(1, config.suppliers.syncMinutes) * 60_000);
  syncTimer.unref?.();
}

if (config.env === "production") {
  const insecure = [];
  if (config.security.adminPassword === "lajoaquina2026") insecure.push("ADMIN_PASSWORD");
  if (config.security.sessionSecret.startsWith("dev-secret") || config.security.sessionSecret.length < 32) {
    insecure.push("SESSION_SECRET (mínimo 32 caracteres)");
  }
  if (insecure.length) {
    console.error("\n  Configuración insegura para producción. Definí:");
    for (const name of insecure) console.error(`  ▸ ${name}`);
    console.error("\n  La tienda no arranca en producción con credenciales por defecto.\n");
    process.exit(1);
  }
  if (config.security.demoMode) console.warn("[config] DEMO_MODE está activo en producción.");
  if (config.suppliers.provider === "cj" && !config.suppliers.cj.apiKey) {
    console.warn("[config] Falta CJ_API_KEY: el fulfillment real no va a funcionar.");
  }
}

const server = app.listen(config.port, () => {
  console.log("");
  console.log("  La Joaquina · Hogar & Deco");
  console.log(`  ▸ Tienda     ${config.baseUrl}`);
  console.log(`  ▸ Admin      ${config.baseUrl}/admin`);
  console.log(`  ▸ Playbook   ${config.baseUrl}/playbook`);
  console.log(`  ▸ Proveedor  ${config.suppliers.provider}${config.suppliers.provider === "cj" ? ` · ${config.suppliers.cj.sandbox ? "sandbox" : "live"}` : ""}`);
  console.log(`  ▸ Modo       ${config.env === "production" ? "PRODUCCIÓN" : "DESARROLLO"}`);
  console.log("");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n  El puerto ${config.port} está ocupado. Probá: PORT=4174 npm start\n`);
    process.exit(1);
  }
  throw error;
});

process.on("SIGINT", () => {
  console.log("\n  Cerrando La Joaquina…");
  server.close(() => process.exit(0));
});
