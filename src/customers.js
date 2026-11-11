import crypto from "node:crypto";
import { getDb, save } from "./store.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function now() {
  return new Date().toISOString();
}

function publicCustomer(customer) {
  if (!customer) return null;
  const { passwordHash, ...safe } = customer;
  return safe;
}

export function findCustomerByEmail(email) {
  const db = getDb();
  db.customers ||= [];
  const e = normalizeEmail(email);
  return db.customers.find((c) => c.email === e) || null;
}

export function findCustomerById(id) {
  const db = getDb();
  db.customers ||= [];
  return db.customers.find((c) => c.id === id) || null;
}

export function registerCustomer({ name, email, password, phone = "", address = {} } = {}) {
  const db = getDb();
  db.customers ||= [];
  const e = normalizeEmail(email);
  const n = String(name || "").trim();
  const p = String(password || "");
  if (!n) throw Object.assign(new Error("Ingresá tu nombre."), { status: 400 });
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw Object.assign(new Error("Ingresá un email válido."), { status: 400 });
  }
  if (p.length < 6) throw Object.assign(new Error("La contraseña debe tener al menos 6 caracteres."), { status: 400 });
  if (findCustomerByEmail(e)) {
    throw Object.assign(new Error("Ya existe una cuenta con ese email."), { status: 409 });
  }
  const customer = {
    id: `cus_${crypto.randomBytes(8).toString("hex")}`,
    name: n.slice(0, 120),
    email: e,
    phone: String(phone || "").trim().slice(0, 40),
    passwordHash: hashPassword(p),
    address: sanitizeAddress(address),
    createdAt: now(),
    updatedAt: now(),
  };
  db.customers.push(customer);
  save();
  return publicCustomer(customer);
}

export function loginCustomer({ email, password } = {}) {
  const customer = findCustomerByEmail(email);
  if (!customer || !verifyPassword(String(password || ""), customer.passwordHash)) {
    throw Object.assign(new Error("Email o contraseña incorrectos."), { status: 401 });
  }
  customer.lastLoginAt = now();
  save();
  return publicCustomer(customer);
}

function sanitizeAddress(addr = {}) {
  const src = addr && typeof addr === "object" ? addr : {};
  const clean = (v, max = 120) => String(v || "").trim().slice(0, max);
  return {
    name: clean(src.name, 120),
    phone: clean(src.phone, 40),
    address: clean(src.address, 180),
    city: clean(src.city, 80),
    province: clean(src.province, 80),
    country: clean(src.country || "Argentina", 60),
    postal: clean(src.postal, 20),
    notes: clean(src.notes, 240),
  };
}

export function updateCustomerProfile(id, { name, phone, address } = {}) {
  const db = getDb();
  db.customers ||= [];
  const customer = db.customers.find((c) => c.id === id);
  if (!customer) throw Object.assign(new Error("Cuenta no encontrada."), { status: 404 });
  if (name != null) customer.name = String(name || "").trim().slice(0, 120) || customer.name;
  if (phone != null) customer.phone = String(phone || "").trim().slice(0, 40);
  if (address != null) customer.address = sanitizeAddress({ ...customer.address, ...address });
  customer.updatedAt = now();
  save();
  return publicCustomer(customer);
}

export function ordersForCustomerEmail(email) {
  const db = getDb();
  const e = normalizeEmail(email);
  return (db.orders || []).filter((o) => normalizeEmail(o.customer?.email) === e);
}
