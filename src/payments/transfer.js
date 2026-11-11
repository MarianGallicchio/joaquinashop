import { getStoreSettings } from "../settings.js";

/**
 * Transferencia bancaria: no hay webhook nativo. El flujo automático es:
 * 1. Se generan datos únicos de transferencia (alias + concepto = ID del pedido).
 * 2. El cliente sube el comprobante (POST /api/orders/:id/receipt).
 * 3. El verificador concilia monto/concepto y aprueba sin intervención humana
 *    cuando el comprobante coincide; si no, queda en revisión.
 */
export async function createPayment(order) {
  const bank = getStoreSettings().bank;
  return {
    type: "instructions",
    providerId: `transfer_${order.id}`,
    instructions: {
      method: "transfer",
      title: "Transferencia bancaria",
      amount: order.totals.total,
      currency: order.currency,
      alias: bank.alias,
      cbu: bank.cbu,
      holder: bank.holder,
      bank: bank.name,
      cuit: bank.cuit,
      concept: order.id,
      note: "Usá el número de pedido como concepto. Subí el comprobante para confirmar automáticamente.",
      expiresInMinutes: 60,
    },
  };
}

/** Heurística de conciliación automática para el comprobante. */
export function verifyReceipt(order, { amount, reference }) {
  const expected = order.totals.total;
  const tolerance = order.currency === "ARS" ? 500 : 1;
  const amountOk = Math.abs(Number(amount) - expected) <= tolerance;
  const referenceOk =
    !reference || String(reference).toUpperCase().includes(order.id.replace(/^(AUR-|LJ-)/, ""));
  return { approved: amountOk && referenceOk, amountOk, referenceOk };
}
