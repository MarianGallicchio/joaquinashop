import { ALL_PRODUCTS } from "./catalog.js";
import { getDb, save } from "./store.js";

const DEFAULT_STOCK = 20;
const DEFAULT_LOW_STOCK = 5;
const MAX_STOCK = 9999;
const MAX_MOVEMENTS = 300;
const nowIso = () => new Date().toISOString();

function ensureInventory() {
  const db = getDb();
  db.inventory ??= {};
  let changed = false;

  for (const product of ALL_PRODUCTS) {
    const current = db.inventory[product.id];
    if (!current || !Number.isFinite(Number(current.stock))) {
      db.inventory[product.id] = {
        stock: Math.max(0, Math.min(MAX_STOCK, Number(product.stock) || DEFAULT_STOCK)),
        lowStockThreshold: Number(current?.lowStockThreshold) || DEFAULT_LOW_STOCK,
        updatedAt: nowIso(),
      };
      changed = true;
    }
  }

  if (!Array.isArray(db.stockMovements)) {
    db.stockMovements = [];
    changed = true;
  }
  if (changed) save();
  return db.inventory;
}

function itemFor(product) {
  const entry = getDb().inventory[product.id];
  const stock = Number(entry?.stock) || 0;
  const lowStockThreshold = Number(entry?.lowStockThreshold) || DEFAULT_LOW_STOCK;
  return {
    id: product.id,
    name: product.name,
    image: product.image,
    category: product.category,
    priceArs: product.priceArs,
    stock,
    lowStockThreshold,
    updatedAt: entry?.updatedAt || null,
    status: stock <= 0 ? "out" : stock <= lowStockThreshold ? "low" : "ok",
  };
}

function recordMovement({ productId, delta, stock, reason, orderId = null }) {
  const db = getDb();
  db.stockMovements ??= [];
  db.stockMovements.push({
    at: nowIso(),
    productId,
    delta,
    stock,
    reason: String(reason || "Ajuste manual").slice(0, 160),
    orderId,
  });
  if (db.stockMovements.length > MAX_MOVEMENTS) {
    db.stockMovements = db.stockMovements.slice(-MAX_MOVEMENTS);
  }
}

export function inventoryItem(productId) {
  ensureInventory();
  const product = ALL_PRODUCTS.find((item) => item.id === productId);
  return product ? itemFor(product) : null;
}

export function inventoryList() {
  ensureInventory();
  return ALL_PRODUCTS.map(itemFor);
}

export function getStock(productId) {
  ensureInventory();
  return Number(getDb().inventory[productId]?.stock) || 0;
}

export function stockMovements(limit = 30) {
  ensureInventory();
  return getDb().stockMovements.slice(-Math.max(1, Math.min(100, Number(limit) || 30))).reverse();
}

export function setStock(productId, nextStock, reason = "Ajuste manual") {
  ensureInventory();
  const product = ALL_PRODUCTS.find((item) => item.id === productId);
  if (!product) {
    const error = new Error("Producto no encontrado.");
    error.status = 404;
    throw error;
  }
  const stock = Number(nextStock);
  if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
    const error = new Error(`El stock debe ser un entero entre 0 y ${MAX_STOCK}.`);
    error.status = 400;
    throw error;
  }

  const entry = getDb().inventory[productId];
  const previous = Number(entry.stock) || 0;
  entry.stock = stock;
  entry.updatedAt = nowIso();
  if (previous !== stock) {
    recordMovement({
      productId,
      delta: stock - previous,
      stock,
      reason,
    });
  }
  save();
  return itemFor(product);
}

/** Verifica disponibilidad sin reservar. Se usa al crear el pedido. */
export function checkStock(items = []) {
  ensureInventory();
  const shortages = [];
  for (const item of items) {
    const product = ALL_PRODUCTS.find((entry) => entry.id === item.id);
    if (!product) continue;
    const available = Number(getDb().inventory[product.id]?.stock) || 0;
    if (available < item.qty) {
      shortages.push({ id: product.id, name: product.name, requested: item.qty, available });
    }
  }
  return shortages;
}

/** Descuenta stock al confirmar el pago. Es idempotente por pedido. */
export function reserveStockForOrder(order) {
  if (!order || order.stockApplied) return { ok: true, shortages: [] };
  ensureInventory();
  const shortages = checkStock(order.items);
  if (shortages.length) return { ok: false, shortages };

  for (const item of order.items) {
    const entry = getDb().inventory[item.id];
    if (!entry) continue;
    const previous = Number(entry.stock) || 0;
    entry.stock = Math.max(0, previous - item.qty);
    entry.updatedAt = nowIso();
    recordMovement({
      productId: item.id,
      delta: entry.stock - previous,
      stock: entry.stock,
      reason: `Venta · ${order.id}`,
      orderId: order.id,
    });
  }
  order.stockApplied = true;
  save();
  return { ok: true, shortages: [] };
}

/** Devuelve unidades al stock cuando se reembolsa un pedido. */
export function restoreStockForOrder(order) {
  if (!order || !order.stockApplied) return false;
  ensureInventory();
  for (const item of order.items) {
    const entry = getDb().inventory[item.id];
    if (!entry) continue;
    const previous = Number(entry.stock) || 0;
    entry.stock = Math.min(MAX_STOCK, previous + item.qty);
    entry.updatedAt = nowIso();
    recordMovement({
      productId: item.id,
      delta: entry.stock - previous,
      stock: entry.stock,
      reason: `Reembolso · ${order.id}`,
      orderId: order.id,
    });
  }
  order.stockApplied = false;
  save();
  return true;
}

export function inventorySummary() {
  const inventory = inventoryList();
  return {
    total: inventory.length,
    out: inventory.filter((item) => item.stock <= 0).length,
    low: inventory.filter((item) => item.stock > 0 && item.stock <= item.lowStockThreshold).length,
  };
}
