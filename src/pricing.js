import { findProduct, priceFor } from "./catalog.js";
import { config } from "./config.js";
import { priceModeForPayment } from "./payment-methods.js";

export const COUPONS = {
  JOAQUINA10: { type: "percent", value: 10, label: "10% OFF" },
  BIENVENIDA15: { type: "percent", value: 15, minArs: 50000, label: "15% primera compra" },
  ENVIOGRATIS: { type: "shipping", value: 100, label: "Envío gratis" },
};

export function currencyForCountry(country = "Argentina") {
  return country === "Argentina" ? "ARS" : "USD";
}

export function roundMoney(value, currency) {
  if (currency === "ARS") return Math.round(value / 100) * 100;
  return Math.round(value);
}

export function normalizeItems(rawItems = []) {
  const items = [];
  for (const raw of rawItems) {
    const product = findProduct(raw.id);
    if (!product) continue;
    const qty = Math.max(1, Math.min(10, Math.floor(Number(raw.qty) || 1)));
    items.push({
      id: product.id,
      name: product.name,
      qty,
      color: raw.color || product.colors[0],
      image: product.image,
      supplierSku: product.supplierSku,
    });
  }
  /* Fusiona duplicados por id + color */
  const merged = new Map();
  for (const item of items) {
    const key = `${item.id}::${item.color}`;
    if (merged.has(key)) merged.get(key).qty = Math.min(10, merged.get(key).qty + item.qty);
    else merged.set(key, item);
  }
  return [...merged.values()];
}

export function shippingOptions({ country, subtotal, currency, coupon }) {
  const isAr = currency === "ARS";
  const freeThreshold = isAr ? config.store.freeShippingThreshold : 120;
  const free = coupon?.freeShipping || subtotal >= freeThreshold;
  if (isAr) {
    return [
      {
        id: "standard",
        label: "Envío estándar",
        eta: "5 a 9 días hábiles",
        price: free ? 0 : 5900,
        free: true,
      },
      {
        id: "express",
        label: "Envío express",
        eta: "2 a 4 días hábiles",
        price: 9900,
        free: false,
      },
    ];
  }
  return [
    {
      id: "standard",
      label: "International standard",
      eta: "7 a 14 business days",
      price: free ? 0 : 12.99,
      free: true,
    },
    {
      id: "express",
      label: "International express",
      eta: "3 a 6 business days",
      price: 24.99,
      free: false,
    },
  ];
}

export function quote({
  items: rawItems,
  couponCode,
  country = "Argentina",
  shippingMethod = "standard",
  paymentMethod = null,
}) {
  const currency = currencyForCountry(country);
  const fx = currency === "USD" ? config.store.arsPerUsd : 1;
  const priceMode = priceModeForPayment(paymentMethod);
  const items = normalizeItems(rawItems);

  if (!items.length) {
    const error = new Error("El carrito está vacío.");
    error.status = 400;
    throw error;
  }

  const coupon = couponCode ? COUPONS[String(couponCode).toUpperCase()] : null;
  if (couponCode && !coupon) {
    const error = new Error("El cupón no existe o venció.");
    error.status = 400;
    throw error;
  }

  let subtotal = 0;
  for (const item of items) {
    const product = findProduct(item.id);
    const { price } = priceFor(product, currency, fx, priceMode);
    item.unitPrice = price;
    item.unitCost = currency === "ARS" ? product.costArs : Math.round(product.costArs / fx);
    item.lineTotal = roundMoney(price * item.qty, currency);
    subtotal += item.lineTotal;
  }
  subtotal = roundMoney(subtotal, currency);

  const minArs = coupon?.minArs || 0;
  const subtotalArs = subtotal * fx;
  let discount = 0;
  if (coupon?.type === "percent" && subtotalArs >= minArs) {
    discount = roundMoney((subtotal * coupon.value) / 100, currency);
  }

  const shippingList = shippingOptions({ country, subtotal, currency, coupon });
  const selectedShipping =
    shippingList.find((option) => option.id === shippingMethod) || shippingList[0];

  const total = roundMoney(subtotal + selectedShipping.price - discount, currency);

  return {
    currency,
    fx,
    country,
    paymentMethod: paymentMethod || null,
    priceMode,
    priceLabel: priceMode === "card" ? "Precio con tarjeta" : "Precio efectivo o transferencia",
    items,
    coupon: coupon ? { code: String(couponCode).toUpperCase(), label: coupon.label } : null,
    subtotal,
    discount,
    shipping: selectedShipping.price,
    shippingMethod: selectedShipping.id,
    shippingLabel: selectedShipping.label,
    shippingEta: selectedShipping.eta,
    freeShippingRemaining:
      coupon?.freeShipping || subtotal >= (currency === "ARS" ? config.store.freeShippingThreshold : 120)
        ? 0
        : roundMoney((currency === "ARS" ? config.store.freeShippingThreshold : 120) - subtotal, currency),
    shippingOptions: shippingList,
    total,
    taxNote: currency === "ARS" ? "IVA incluido" : "Taxes included",
  };
}

export function paymentFee(totals, currency) {
  const fixed = currency === "ARS" ? config.ops.paymentFeeFixed : 0.4;
  return roundMoney(totals.total * config.ops.paymentFeePct + fixed, currency);
}
