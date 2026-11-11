import { config } from "../config.js";

export function isDemo() {
  return config.security.demoMode;
}

/** Pasarela de demostración: permite probar todo el flujo sin claves reales. */
export async function createPayment(order) {
  return {
    type: "redirect",
    url: `/pago/demo.html?order=${order.id}&token=${order.publicToken}&method=demo`,
    providerId: `demo_${order.id}`,
    demo: true,
  };
}
