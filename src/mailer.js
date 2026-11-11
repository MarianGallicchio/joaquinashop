import { config } from "./config.js";
import { getDb, save } from "./store.js";

const money = (order) =>
  new Intl.NumberFormat(order.currency === "ARS" ? "es-AR" : "en-US", {
    style: "currency",
    currency: order.currency,
    maximumFractionDigits: order.currency === "ARS" ? 0 : 2,
  }).format(order.totals.total);

const copy = {
  order_created: {
    subject: (order) => `Recibimos tu pedido ${order.id}`,
    heading: "Tu pedido está reservado",
    body: (order) =>
      `Estamos esperando la confirmación del pago de ${money(order)}. Apenas se acredite, lo enviamos al proveedor automáticamente.`,
  },
  payment_approved: {
    subject: (order) => `Pago confirmado · ${order.id}`,
    heading: "Pago acreditado",
    body: (order) =>
      `Confirmamos tu pago de ${money(order)}. Ya generamos la orden de preparación y te avisamos cuando salga el envío.`,
  },
  payment_rejected: {
    subject: (order) => `No pudimos procesar el pago · ${order.id}`,
    heading: "El pago no se completó",
    body: () => "Podés reintentar con otro medio de pago desde el mismo checkout. No se te cobró nada.",
  },
  shipped: {
    subject: (order) => `Tu pedido ${order.id} está en camino`,
    heading: "Despachado",
    body: (order) =>
      `Tu pedido salió con ${order.fulfillment.carrier}. Seguimiento: ${order.fulfillment.tracking}. Llega en ${order.shippingEta}.`,
  },
  delivered: {
    subject: (order) => `Tu pedido ${order.id} fue entregado`,
    heading: "Llegó tu pedido",
    body: () =>
      "Tu pedido fue entregado. Si algo no salió como esperabas, tenés 10 días para escribirnos y coordinamos la devolución.",
  },
  transfer_instructions: {
    subject: (order) => `Datos para transferir · ${order.id}`,
    heading: "Transferí y confirmá tu pedido",
    body: (order) => {
      const bank = order.payment.instructions;
      const details = [
        bank.alias ? `alias ${bank.alias}` : "",
        bank.cbu ? `CBU ${bank.cbu}` : "",
        bank.holder,
      ]
        .filter(Boolean)
        .join(" · ");
      return `Transferí ${money(order)} a ${details}. Poné ${order.id} en el concepto y subí el comprobante.`;
    },
  },
  cash_instructions: {
    subject: (order) => `Coordinemos el pago en efectivo · ${order.id}`,
    heading: "Tu pedido queda reservado",
    body: (order) =>
      `Elegiste pagar en efectivo. Te contactamos por WhatsApp para coordinar la entrega y el pago de ${money(order)}.`,
  },
  receipt_received: {
    subject: (order) => `Comprobante recibido · ${order.id}`,
    heading: "Estamos verificando tu transferencia",
    body: () => "Recibimos el comprobante. La verificación se hace automáticamente y suele tardar menos de 30 minutos.",
  },
};

function render(order, template) {
  const t = copy[template] || copy.order_created;
  return {
    subject: t.subject(order),
    heading: t.heading,
    body: t.body(order),
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f1e8;padding:32px">
      <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px">
        <div style="letter-spacing:6px;font-size:12px;color:#0c1210">La Joaquina</div>
        <h1 style="font-size:24px;color:#0c1210">${t.heading}</h1>
        <p style="color:#3d4741;line-height:1.6">${t.body(order)}</p>
        <p style="margin-top:28px;font-size:12px;color:#8a938d">Pedido ${order.id} · ${order.customer.email}</p>
      </div></body></html>`,
  };
}

export async function sendEmail(order, template) {
  const content = render(order, template);
  const record = {
    id: `MAIL-${Date.now()}-${Math.floor(Math.random() * 999)}`,
    at: new Date().toISOString(),
    to: order.customer.email,
    template,
    subject: content.subject,
    status: "logged",
    orderId: order.id,
  };

  if (config.email.resendKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.email.resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.email.from,
          to: order.customer.email,
          subject: content.subject,
          html: content.html,
        }),
      });
      record.status = response.ok ? "sent" : "failed";
      if (!response.ok) record.error = (await response.text()).slice(0, 300);
    } catch (error) {
      record.status = "failed";
      record.error = error.message;
    }
  }

  const db = getDb();
  db.emails.unshift(record);
  if (db.emails.length > 800) db.emails.length = 800;
  save();

  if (record.status !== "sent") {
    console.log(`[email:${record.status}] ${template} → ${order.customer.email} · ${content.subject}`);
  }
  return record;
}

export function emailLog() {
  return getDb().emails.slice(0, 50);
}
