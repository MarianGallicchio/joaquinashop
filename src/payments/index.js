import * as mercadopago from "./mercadopago.js";
import * as transfer from "./transfer.js";
import * as cash from "./cash.js";

export const adapters = {
  mercadopago,
  transfer,
  cash,
};

export const PAYMENT_METHODS = [
  {
    id: "mercadopago",
    label: "MercadoPago",
    description: "Tarjetas, débito y cuotas · precio con tarjeta",
    icon: "mp",
    priceMode: "card",
    countries: ["Argentina"],
  },
  {
    id: "transfer",
    label: "Transferencia bancaria",
    description: "CBU / alias · confirmación con comprobante",
    icon: "bank",
    priceMode: "cash",
    countries: ["Argentina"],
  },
  {
    id: "cash",
    label: "Efectivo",
    description: "Coordinamos entrega y pago por WhatsApp",
    icon: "cash",
    priceMode: "cash",
    countries: ["Argentina"],
  },
];

export function methodsForCountry(country) {
  return PAYMENT_METHODS.filter(
    (method) => method.countries.includes("*") || method.countries.includes(country),
  ).map((method) => ({
    ...method,
    demo: false,
    available: true,
  }));
}

export async function createPayment(order, method) {
  const adapter = adapters[method];
  if (!adapter) {
    const error = new Error("Método de pago no soportado.");
    error.status = 400;
    throw error;
  }
  const result = await adapter.createPayment(order);

  order.payment.providerId = result.providerId || null;
  order.payment.instructions = result.instructions || null;
  if (method === "transfer") order.status = "pending_transfer";
  if (method === "cash") order.status = "pending_cash";
  return result;
}
