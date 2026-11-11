/**
 * Pago en efectivo coordinado por el equipo.
 * El pedido queda reservado y el admin confirma la cobranza al entregar.
 */
export async function createPayment(order) {
  return {
    type: "instructions",
    providerId: `cash_${order.id}`,
    instructions: {
      method: "cash",
      title: "Pago en efectivo",
      amount: order.totals.total,
      currency: order.currency,
      note: "Coordinamos la entrega y el pago en efectivo por WhatsApp. Tu pedido queda reservado mientras confirmamos el horario.",
      expiresInMinutes: 120,
    },
  };
}
