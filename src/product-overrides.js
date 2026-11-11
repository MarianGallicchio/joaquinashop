import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ROOT } from "./config.js";
import { getDb, save } from "./store.js";

const UPLOAD_DIR = path.join(ROOT, "public", "assets", "products", "uploads");
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export function listOverrides() {
  const db = getDb();
  db.productOverrides ??= {};
  db.customProducts ??= [];
  return { overrides: db.productOverrides, customProducts: db.customProducts };
}

export function setOverride(id, patch) {
  const db = getDb();
  db.productOverrides ??= {};
  const current = db.productOverrides[id] || {};
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  // clean undefined
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  db.productOverrides[id] = next;
  save();
  return next;
}

export function upsertCustomProduct(input) {
  const db = getDb();
  db.customProducts ??= [];
  const id = String(input.id || "").trim() || `custom-${randomUUID().slice(0, 8)}`;
  const existingIndex = db.customProducts.findIndex((p) => p.id === id);
  const base = existingIndex >= 0 ? db.customProducts[existingIndex] : { id, createdAt: new Date().toISOString() };
  const next = { ...base, ...input, id, updatedAt: new Date().toISOString() };
  if (existingIndex >= 0) db.customProducts[existingIndex] = next;
  else db.customProducts.push(next);
  save();
  return next;
}

export function deleteCustomProduct(id) {
  const db = getDb();
  db.customProducts ??= [];
  const before = db.customProducts.length;
  db.customProducts = db.customProducts.filter((p) => p.id !== id);
  if (db.customProducts.length !== before) save();
  return db.customProducts.length !== before;
}

export function applyProductData(baseProduct) {
  const db = getDb();
  const override = (db.productOverrides && db.productOverrides[baseProduct.id]) || {};
  const merged = { ...baseProduct, ...override };
  if (override.gallery && Array.isArray(override.gallery) && override.gallery.length) merged.gallery = override.gallery;
  if (override.colors && Array.isArray(override.colors)) merged.colors = override.colors;
  if (override.benefits && Array.isArray(override.benefits)) merged.benefits = override.benefits;
  if (override.specs && typeof override.specs === 'object') merged.specs = override.specs;
  return merged;
}

export function getCustomProducts() {
  const db = getDb();
  return Array.isArray(db.customProducts) ? db.customProducts : [];
}

export function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!ALLOWED_IMAGE.has(mime)) return null;
  const buf = Buffer.from(m[2].replace(/\s/g, ""), "base64");
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  return { mime, buf };
}

export function extForMime(mime) {
  return { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" }[mime] || ".bin";
}

export function saveUploadedImage({ dataUrl, filenameBase = "product" }) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    const err = new Error("Imagen inválida. Usá JPG, PNG, WEBP, GIF o AVIF (máx. 5 MB).");
    err.status = 400;
    throw err;
  }
  ensureUploadDir();
  const safeBase = String(filenameBase || "product").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "product";
  const name = `${safeBase}-${Date.now()}-${randomUUID().slice(0, 6)}${extForMime(parsed.mime)}`;
  const abs = path.join(UPLOAD_DIR, name);
  fs.writeFileSync(abs, parsed.buf);
  return { path: `/assets/products/uploads/${name}`, filename: name, size: parsed.buf.length };
}
