import { BASE_PRODUCTS, BUNDLES } from "./catalog.js";
import { config } from "./config.js";

/* PRNG determinístico para que el dataset demo sea reproducible. */
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261105);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + rand() * (max - min);
const round = (value, step = 100) => Math.round(value / step) * step;

const FIRST = [
  "Sofía", "Lucas", "Valentina", "Mateo", "Camila", "Julián", "Martina", "Alejandro",
  "Florencia", "Tomás", "Micaela", "Nicolás", "Agustina", "Franco", "Delfina", "Ramiro",
  "Carolina", "Santiago", "Julieta", "Ignacio", "Bianca", "Emiliano", "Renata", "Bautista",
  "Paula", "Gonzalo", "Ludmila", "Facundo", "Victoria", "Thiago", "Malena", "Joaquín",
  "Rocío", "Bruno", "Candela", "Lautaro", "Milagros", "Federico", "Abril", "Máximo",
];
const LAST = [
  "Ramírez", "Fernández", "Gómez", "Ruiz", "Sosa", "Domínguez", "López", "Vidal",
  "Castro", "Herrera", "Benítez", "Aguirre", "Molina", "Pereyra", "Ríos", "Acosta",
  "Duarte", "Cabrera", "Navarro", "Ferreyra", "Silva", "Rojas", "Ortiz", "Ledesma",
  "Miranda", "Vega", "Paz", "Cardozo", "Bravo", "Núñez", "Ibarra", "Quiroga",
];

const CITIES_AR = [
  ["CABA", "CABA", "C1425"], ["Palermo", "CABA", "C1425"], ["Belgrano", "CABA", "C1428"],
  ["La Plata", "Buenos Aires", "B1900"], ["Mar del Plata", "Buenos Aires", "B7600"],
  ["Rosario", "Santa Fe", "S2000"], ["Córdoba", "Córdoba", "X5000"],
  ["Mendoza", "Mendoza", "M5500"], ["Salta", "Salta", "A4400"],
  ["Tucumán", "Tucumán", "T4000"], ["Neuquén", "Neuquén", "Q8300"],
  ["Bariloche", "Río Negro", "R8400"], ["Corrientes", "Corrientes", "W3400"],
];

const CITIES_INTL = [
  ["Santiago", "Región Metropolitana", "Chile", "8320000"],
  ["Montevideo", "Montevideo", "Uruguay", "11000"],
  ["Ciudad de México", "CDMX", "México", "01000"],
  ["Bogotá", "Cundinamarca", "Colombia", "110111"],
  ["Madrid", "Madrid", "España", "28001"],
  ["Miami", "Florida", "Estados Unidos", "33101"],
  ["Lima", "Lima", "Perú", "15001"],
];

const CHANNELS = [
  { id: "meta", weight: 0.46 },
  { id: "google", weight: 0.22 },
  { id: "organic", weight: 0.16 },
  { id: "email", weight: 0.09 },
  { id: "influencer", weight: 0.07 },
];

const PAYMENT_METHODS = [
  { id: "mercadopago", weight: 0.44 },
  { id: "stripe", weight: 0.24 },
  { id: "transfer", weight: 0.16 },
  { id: "paypal", weight: 0.09 },
  { id: "crypto", weight: 0.04 },
  { id: "demo", weight: 0.03 },
];

const DAILY_AD_SPEND = config.ops.adSpendDailyArs;
const SPEND_SPLIT = { meta: 0.55, google: 0.25, influencer: 0.1, email: 0.05, organic: 0.05 };

function weighted(list) {
  const total = list.reduce((acc, item) => acc + item.weight, 0);
  let roll = rand() * total;
  for (const item of list) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }
  return list[0].id;
}

function buildIdentity(seq, returning) {
  if (returning.length > 8 && rand() < 0.22) return pick(returning);
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/ /g, ".");
  const identity = { name, email: `${slug}.${seq}@mail.com` };
  returning.push(identity);
  if (returning.length > 400) returning.shift();
  return identity;
}

function buildOrder(seq, date, returning) {
  const isIntl = rand() < 0.18;
  const currency = isIntl ? "USD" : "ARS";
  const fx = isIntl ? config.store.arsPerUsd : 1;
  const toCurrency = (ars) => (isIntl ? Math.max(1, Math.round(ars / fx)) : ars);

  const items = [];
  const count = rand() < 0.24 ? 2 : 1;
  const pool = [...BASE_PRODUCTS];
  for (let i = 0; i < count; i += 1) {
    const product = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    const qty = rand() < 0.12 ? 2 : 1;
    items.push({
      id: product.id,
      name: product.name,
      qty,
      unitPrice: toCurrency(product.priceArs),
      unitCost: toCurrency(product.costArs),
      image: product.image,
      supplierSku: product.supplierSku,
    });
  }
  if (BUNDLES[0] && rand() < 0.07) {
    const bundle = BUNDLES[0];
    items.length = 0;
    items.push({
      id: bundle.id,
      name: bundle.name,
      qty: 1,
      unitPrice: toCurrency(bundle.priceArs),
      unitCost: toCurrency(bundle.costArs),
      image: bundle.image,
      supplierSku: bundle.supplierSku,
    });
  }

  const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.qty, 0);
  const channel = weighted(CHANNELS);
  const method = weighted(PAYMENT_METHODS);
  const shipping = isIntl ? (subtotal >= 120 ? 0 : 13) : subtotal >= config.store.freeShippingThreshold ? 0 : 5900;
  const discount = rand() < 0.17 ? round(subtotal * 0.1, isIntl ? 1 : 100) : 0;
  const total = subtotal + shipping - discount;

  const statusRoll = rand();
  const status =
    statusRoll < 0.52 ? "delivered"
    : statusRoll < 0.72 ? "shipped"
    : statusRoll < 0.87 ? "paid"
    : statusRoll < 0.975 ? "pending"
    : statusRoll < 0.99 ? "refunded"
    : "cancelled";

  const identity = buildIdentity(seq, returning);
  const [city, province, country, postal] = isIntl
    ? pick(CITIES_INTL)
    : [...pick(CITIES_AR), "Argentina"];

  const paid = ["paid", "shipped", "delivered", "refunded"].includes(status);
  const supplierRef = `SUP-${String(seq).padStart(5, "0")}`;
  const tracking = ["shipped", "delivered"].includes(status)
    ? `AR${Math.floor(between(100000000, 999999999))}AR`
    : null;

  return {
    id: `AUR-${seq}`,
    publicToken: `demo-${seq}-${Math.floor(rand() * 1e9).toString(36)}`,
    createdAt: date.toISOString(),
    paidAt: paid ? date.toISOString() : null,
    customer: {
      name: identity.name,
      email: identity.email,
      phone: `+54 9 11 ${Math.floor(between(2000, 8999))}-${Math.floor(between(1000, 9999))}`,
      city,
      province,
      country,
      postal,
    },
    items,
    currency,
    fx,
    totals: { subtotal, discount, shipping, total },
    payment: {
      method,
      status: paid ? "approved" : status === "pending" ? "pending" : "rejected",
      providerId: method === "mercadopago" ? `mp_${Math.floor(rand() * 1e9)}` : null,
      fee: Math.round(total * config.ops.paymentFeePct),
    },
    status,
    channel,
    fulfillment: {
      status:
        status === "delivered" ? "delivered"
        : status === "shipped" ? "shipped"
        : paid ? "processing"
        : "not_started",
      supplierRef,
      tracking,
      carrier: tracking ? "Andreani" : null,
      events: [],
    },
    demo: true,
  };
}

export function buildSeedOrders(base) {
  const orders = [];
  const returning = [];
  const days = 120;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let seq = 1001;

  for (let d = days - 1; d >= 0; d -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - d);
    const weekday = day.getDay();
    const growth = 1 + ((days - d) / days) * 0.45;
    const weekend = weekday === 0 || weekday === 6 ? 1.15 : 1;
    const count = Math.max(2, Math.round(between(6, 10) * growth * weekend));
    for (let i = 0; i < count; i += 1) {
      const at = new Date(day);
      at.setHours(Math.floor(between(8, 23)), Math.floor(between(0, 59)), Math.floor(between(0, 59)));
      orders.push(buildOrder(seq, at, returning));
      seq += 1;
    }
  }
  base.meta.orderSeq = seq + 10;
  return orders;
}

export function buildSeedEvents(orders) {
  const events = {};
  const byDay = new Map();
  for (const order of orders) {
    const key = order.createdAt.slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let d = 119; d >= 0; d -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - d);
    const key = day.toISOString().slice(0, 10);
    const ordersCount = byDay.get(key) || 0;
    const cvr = between(0.021, 0.036);
    const sessions = Math.round(ordersCount / cvr);
    const byChannel = {};
    for (const channel of CHANNELS) {
      const share = channel.weight * between(0.85, 1.15);
      byChannel[channel.id] = {
        sessions: Math.round(sessions * share),
        orders: Math.round(ordersCount * share),
        revenue: 0,
        spend: Math.round(DAILY_AD_SPEND * (SPEND_SPLIT[channel.id] || 0)),
      };
    }
    events[key] = {
      sessions,
      pageViews: Math.round(sessions * 2.6),
      viewItem: Math.round(sessions * 0.62),
      addToCart: Math.round(sessions * 0.16),
      beginCheckout: Math.round(sessions * 0.055),
      purchase: ordersCount,
      revenue: 0,
      byChannel,
    };
  }

  for (const order of orders) {
    const key = order.createdAt.slice(0, 10);
    if (!events[key] || !["paid", "shipped", "delivered"].includes(order.status)) continue;
    const value = order.currency === "USD" ? order.totals.total * order.fx : order.totals.total;
    events[key].revenue += value;
    if (events[key].byChannel[order.channel]) {
      events[key].byChannel[order.channel].revenue += value;
    }
  }
  return events;
}
