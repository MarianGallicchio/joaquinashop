/**
 * Métodos que cobran con tarjeta (o billetera asociada a tarjeta).
 * Solo MercadoPago aplica precio con tarjeta.
 */
export const CARD_PAYMENT_METHODS = new Set(["mercadopago"]);

export function priceModeForPayment(method) {
  return CARD_PAYMENT_METHODS.has(String(method || "")) ? "card" : "cash";
}
