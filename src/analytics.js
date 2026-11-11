import { getDb } from "./store.js";
import { config } from "./config.js";
import { findProduct } from "./catalog.js";

const PAID_STATUSES = ["paid", "shipped", "delivered"];
const REFUND_STATUSES = ["refunded"];

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function arsValue(order) {
  return order.currency === "USD" ? order.totals.total * (order.fx || config.store.arsPerUsd) : order.totals.total;
}

function rangeKeys(days) {
  const keys = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) keys.push(dateKey(addDays(today, -i)));
  return keys;
}

function inRange(order, keys) {
  const key = order.createdAt.slice(0, 10);
  return keys.includes(key);
}

function sum(arr, fn) {
  return arr.reduce((acc, item) => acc + (fn(item) || 0), 0);
}

function pctChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function metrics(days = 30) {
  const db = getDb();
  const keys = rangeKeys(days);
  const prevKeys = rangeKeys(days * 2).slice(0, days);

  const orders = db.orders.filter((order) => inRange(order, keys));
  const prevOrders = db.orders.filter((order) => inRange(order, prevKeys));
  const paid = orders.filter((order) => PAID_STATUSES.includes(order.status));
  const prevPaid = prevOrders.filter((order) => PAID_STATUSES.includes(order.status));
  const refunded = orders.filter((order) => REFUND_STATUSES.includes(order.status));

  const revenue = sum(paid, arsValue);
  const prevRevenue = sum(prevPaid, arsValue);
  const cogs = sum(paid, (order) =>
    order.items.reduce((acc, item) => {
      const product = findProduct(item.id);
      return acc + (product?.costArs || 0) * item.qty;
    }, 0),
  );
  const fees = sum(paid, (order) =>
    order.totals.total * config.ops.paymentFeePct * (order.currency === "USD" ? order.fx : 1),
  );
  const fulfillmentCost = paid.length * config.ops.fulfillmentCost;
  const grossProfit = revenue - cogs - fees - fulfillmentCost;

  const sessions = sum(keys, (key) => db.events[key]?.sessions || 0);
  const prevSessions = sum(prevKeys, (key) => db.events[key]?.sessions || 0);
  const purchaseEvents = sum(keys, (key) => db.events[key]?.purchase || 0);

  const customerOrders = new Map();
  for (const order of db.orders) {
    if (!PAID_STATUSES.includes(order.status)) continue;
    const key = order.customer.email;
    customerOrders.set(key, (customerOrders.get(key) || 0) + 1);
  }
  const paidEmails = new Set(paid.map((order) => order.customer.email));
  const repeatCustomers = [...paidEmails].filter((email) => (customerOrders.get(email) || 0) > 1).length;

  const byChannel = {};
  for (const key of keys) {
    const bucket = db.events[key];
    if (!bucket) continue;
    for (const [channel, data] of Object.entries(bucket.byChannel || {})) {
      byChannel[channel] ??= { sessions: 0, orders: 0, revenue: 0, spend: 0 };
      byChannel[channel].sessions += data.sessions || 0;
      byChannel[channel].spend += data.spend || 0;
    }
  }
  for (const order of paid) {
    byChannel[order.channel] ??= { sessions: 0, orders: 0, revenue: 0, spend: 0 };
    byChannel[order.channel].orders += 1;
    byChannel[order.channel].revenue += arsValue(order);
  }

  const adSpend = Object.values(byChannel).reduce((acc, data) => acc + data.spend, 0);
  const roas = adSpend ? revenue / adSpend : 0;
  const prevAdSpend = sum(prevKeys, (key) =>
    Object.values(db.events[key]?.byChannel || {}).reduce((acc, data) => acc + (data.spend || 0), 0),
  );
  const prevRevenueFromEvents = sum(prevKeys, (key) => db.events[key]?.revenue || 0);

  const daily = keys.map((key) => {
    const bucket = db.events[key] || {};
    const dayOrders = paid.filter((order) => order.createdAt.slice(0, 10) === key);
    return {
      date: key,
      revenue: Math.round(sum(dayOrders, arsValue)),
      orders: dayOrders.length,
      sessions: bucket.sessions || 0,
      adSpend: Object.values(bucket.byChannel || {}).reduce((acc, data) => acc + (data.spend || 0), 0),
    };
  });

  const productMap = new Map();
  for (const order of paid) {
    for (const item of order.items) {
      const product = findProduct(item.id);
      const fx = order.currency === "USD" ? order.fx || config.store.arsPerUsd : 1;
      const entry = productMap.get(item.id) || {
        id: item.id,
        name: item.name,
        image: item.image,
        units: 0,
        revenue: 0,
        cogs: 0,
      };
      entry.units += item.qty;
      entry.revenue += item.unitPrice * item.qty * fx;
      entry.cogs += (product?.costArs || 0) * item.qty;
      productMap.set(item.id, entry);
    }
  }
  const products = [...productMap.values()]
    .map((entry) => ({
      ...entry,
      revenue: Math.round(entry.revenue),
      margin: Math.round(entry.revenue - entry.cogs),
      marginPct: entry.revenue ? ((entry.revenue - entry.cogs) / entry.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const paymentMap = new Map();
  for (const order of paid) {
    const entry = paymentMap.get(order.payment.method) || { method: order.payment.method, orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += arsValue(order);
    paymentMap.set(order.payment.method, entry);
  }

  const countryMap = new Map();
  for (const order of paid) {
    const country = order.customer.country || "Argentina";
    const entry = countryMap.get(country) || { country, orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += arsValue(order);
    countryMap.set(country, entry);
  }

  const funnel = {
    sessions,
    productViews: sum(keys, (key) => db.events[key]?.viewItem || 0),
    addToCart: sum(keys, (key) => db.events[key]?.addToCart || 0),
    beginCheckout: sum(keys, (key) => db.events[key]?.beginCheckout || 0),
    purchase: paid.length,
  };

  const statusMap = {};
  for (const order of orders) statusMap[order.status] = (statusMap[order.status] || 0) + 1;

  const aov = paid.length ? revenue / paid.length : 0;
  const prevAov = prevPaid.length ? prevRevenue / prevPaid.length : 0;
  const cvr = sessions ? (paid.length / sessions) * 100 : 0;
  const prevCvr = prevSessions ? (prevPaid.length / prevSessions) * 100 : 0;

  return {
    range: { days, from: keys[0], to: keys[keys.length - 1] },
    kpis: {
      revenue: Math.round(revenue),
      orders: paid.length,
      aov: Math.round(aov),
      cvr: Number(cvr.toFixed(2)),
      roas: Number(roas.toFixed(2)),
      cac: paid.length ? Math.round(adSpend / Math.max(1, paidEmails.size)) : 0,
      adSpend: Math.round(adSpend),
      grossProfit: Math.round(grossProfit),
      marginPct: revenue ? Number(((grossProfit / revenue) * 100).toFixed(1)) : 0,
      refunds: refunded.length,
      refundRate: orders.length ? Number(((refunded.length / orders.length) * 100).toFixed(2)) : 0,
      repeatRate: paidEmails.size ? Number(((repeatCustomers / paidEmails.size) * 100).toFixed(1)) : 0,
      sessions,
      units: sum(paid, (order) => sum(order.items, (item) => item.qty)),
      deltas: {
        revenue: Number(pctChange(revenue, prevRevenue).toFixed(1)),
        orders: Number(pctChange(paid.length, prevPaid.length).toFixed(1)),
        aov: Number(pctChange(aov, prevAov).toFixed(1)),
        cvr: Number((cvr - prevCvr).toFixed(2)),
        roas: Number(pctChange(roas, prevAdSpend ? prevRevenueFromEvents / prevAdSpend : 0).toFixed(1)),
      },
    },
    daily,
    channels: Object.entries(byChannel)
      .map(([id, data]) => ({
        id,
        sessions: data.sessions,
        orders: data.orders,
        revenue: Math.round(data.revenue),
        spend: Math.round(data.spend),
        roas: data.spend ? Number((data.revenue / data.spend).toFixed(2)) : null,
        cac: data.orders ? Math.round(data.spend / data.orders) : null,
        conversion: data.sessions ? Number(((data.orders / data.sessions) * 100).toFixed(2)) : null,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    products,
    payments: [...paymentMap.values()].sort((a, b) => b.revenue - a.revenue),
    countries: [...countryMap.values()].sort((a, b) => b.revenue - a.revenue),
    funnel,
    statuses: statusMap,
    demo: db.orders.every((order) => order.demo),
    generatedAt: new Date().toISOString(),
  };
}

export function recentOrders(limit = 40) {
  return getDb()
    .orders.slice(0, limit)
    .map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      customer: order.customer,
      items: order.items,
      totals: order.totals,
      currency: order.currency,
      status: order.status,
      payment: order.payment,
      channel: order.channel,
      demo: order.demo,
    }));
}
