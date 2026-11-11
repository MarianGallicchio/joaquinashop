import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";
import { buildSeedOrders, buildSeedEvents } from "./seed.js";
import { setCatalogOverrides } from "./catalog.js";

const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SEED_VERSION = 4;

let db = null;

function emptyDb() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    meta: { seedVersion: 0, seededAt: null, orderSeq: 1000 },
    orders: [],
    leads: [],
    emails: [],
    returns: [],
    inventory: {},
    stockMovements: [],
    events: {},
    processedWebhooks: [],
    productOverrides: {},
    customProducts: [],
  };
}

export function getDb() {
  if (!db) load();
  return db;
}

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      db.orders ??= [];
      db.leads ??= [];
      db.emails ??= [];
      db.returns ??= [];
      db.inventory ??= {};
      db.stockMovements ??= [];
      db.events ??= {};
      db.processedWebhooks ??= [];
      db.productOverrides ??= {};
      db.customProducts ??= [];
      if (db.meta?.seedVersion !== SEED_VERSION && db.orders.every((o) => o.demo)) {
        reseed();
        return;
      }
      try { setCatalogOverrides(db.productOverrides || {}, db.customProducts || []); } catch {}
      return;
    } catch (error) {
      console.error("[store] db corrupta, se reconstruye:", error.message);
    }
  }
  db = emptyDb();
  reseed();
}

function reseed() {
  const base = emptyDb();
  const orders = buildSeedOrders(base);
  const events = buildSeedEvents(orders);
  base.orders = orders;
  base.events = events;
  base.meta.seedVersion = SEED_VERSION;
  base.meta.seededAt = new Date().toISOString();
  base.meta.orderSeq = 2000 + orders.length;
  db = base;
  try { setCatalogOverrides(db.productOverrides || {}, db.customProducts || []); } catch {}
  save();
  console.log(`[store] datos demo generados: ${orders.length} pedidos, ${Object.keys(events).length} días de tráfico`);
}

export function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { setCatalogOverrides(db?.productOverrides || {}, db?.customProducts || []); } catch {}
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

export function nextOrderId() {
  const database = getDb();
  database.meta.orderSeq = (database.meta.orderSeq || 1000) + 1;
  return {
    id: `LJ-${database.meta.orderSeq}`,
    seq: database.meta.orderSeq,
  };
}

export function resetDemoData() {
  reseed();
}

export function recordEvent(type, payload = {}) {
  const database = getDb();
  const day = (payload.at || new Date().toISOString()).slice(0, 10);
  const bucket =
    database.events[day] ||
    (database.events[day] = {
      sessions: 0,
      pageViews: 0,
      viewItem: 0,
      addToCart: 0,
      beginCheckout: 0,
      purchase: 0,
      revenue: 0,
      byChannel: {},
    });

  if (type === "session_start") bucket.sessions += 1;
  if (type === "page_view") bucket.pageViews += 1;
  if (type === "view_item") bucket.viewItem += 1;
  if (type === "add_to_cart") bucket.addToCart += 1;
  if (type === "begin_checkout") bucket.beginCheckout += 1;
  if (type === "purchase") {
    bucket.purchase += 1;
    bucket.revenue += Number(payload.value) || 0;
  }

  const channel = payload.channel;
  if (channel) {
    bucket.byChannel[channel] ??= { sessions: 0, orders: 0, revenue: 0, spend: 0 };
    if (type === "session_start") bucket.byChannel[channel].sessions += 1;
    if (type === "purchase") {
      bucket.byChannel[channel].orders += 1;
      bucket.byChannel[channel].revenue += Number(payload.value) || 0;
    }
  }
  save();
}

export function hasProcessedWebhook(key) {
  return getDb().processedWebhooks.includes(key);
}

export function markProcessedWebhook(key) {
  const database = getDb();
  if (!database.processedWebhooks.includes(key)) {
    database.processedWebhooks.push(key);
    if (database.processedWebhooks.length > 5000) {
      database.processedWebhooks = database.processedWebhooks.slice(-4000);
    }
    save();
  }
}
