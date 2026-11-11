import {
  init,
  money,
  api,
  toast,
  escapeHtml,
  whatsappUrl,
} from "./common.js";

await init({ page: "order" });

const root = document.querySelector("#order-root");
const params = new URLSearchParams(location.search);

const stored = (() => {
  try {
    return JSON.parse(sessionStorage.getItem("aurea_last_order") || "null");
  } catch {
    return null;
  }
})();

const orderId = params.get("order") || stored?.order || "";
const token = params.get("token") || stored?.token || "";

const state = {
  order: null,
  signature: "",
  busy: false,
};

const STATUS = {
  pending: {
    title: "Esperando el pago",
    copy: "Creamos tu pedido. En cuanto se acredite el pago, lo enviamos al proveedor automáticamente.",
    pill: "Pago pendiente",
    tone: "warn",
  },
  pending_transfer: {
    title: "Transferí y subí el comprobante",
    copy: "Guardamos tu pedido por 60 minutos. Cuando verificamos la transferencia, arranca el envío sin que tengas que hacer nada más.",
    pill: "Esperando transferencia",
    tone: "warn",
  },
  pending_cash: {
    title: "Coordinamos el pago en efectivo",
    copy: "Tu pedido quedó reservado. Te escribimos por WhatsApp para confirmar la entrega y el horario de pago.",
    pill: "Pago en efectivo",
    tone: "warn",
  },
  payment_review: {
    title: "Estamos revisando tu pago",
    copy: "El comprobante llegó, pero necesita una verificación manual. Te escribimos por email en menos de 24 horas hábiles.",
    pill: "En revisión",
    tone: "warn",
  },
  paid: {
    title: "Pago confirmado. Manos a la obra.",
    copy: "Tu pedido ya está en preparación. Te avisamos por email cuando salga del depósito con el código de seguimiento.",
    pill: "Pago aprobado",
    tone: "ok",
  },
  shipped: {
    title: "Tu pedido está en camino",
    copy: "Lo despachamos y ya tiene número de seguimiento. Podés seguir el recorrido con el código de abajo.",
    pill: "En camino",
    tone: "ok",
  },
  delivered: {
    title: "Llegó. Ahora a recuperar.",
    copy: "Tu pedido fue entregado. Si algo no salió como esperabas, tenés 10 días para escribirnos.",
    pill: "Entregado",
    tone: "ok",
  },
  cancelled: {
    title: "El pago no se completó",
    copy: "El pedido quedó cancelado y no se hizo ningún cargo. Podés volver a intentarlo cuando quieras.",
    pill: "Cancelado",
    tone: "bad",
  },
  refunded: {
    title: "Pedido reembolsado",
    copy: "Procesamos el reembolso. Según tu medio de pago puede tardar unos días en reflejarse.",
    pill: "Reembolsado",
    tone: "bad",
  },
};

if (!orderId || !token) {
  root.innerHTML = `
    <div class="checkout-empty">
      <p class="eyebrow" style="justify-content:center">Seguimiento</p>
      <h1 class="display">No encontramos tu pedido.</h1>
      <p>El link de seguimiento está incompleto. Revisá el email de confirmación o volvé a la tienda.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <a class="btn btn--primary" href="/">Volver a la tienda</a>
        <a class="btn btn--ghost" href="mailto:hola@lajoaquina.shop">Escribirnos</a>
      </div>
    </div>`;
} else {
  await maybeSyncMercadoPagoReturn();
  await load({ initial: true });
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") load();
  }, 8000);
  window.addEventListener("beforeunload", () => clearInterval(timer));
}

async function maybeSyncMercadoPagoReturn() {
  const paymentId = params.get("payment_id") || params.get("collection_id") || "";
  const statusParam = params.get("status") || params.get("collection_status") || "";
  if (!paymentId && !statusParam) return;
  try {
    const result = await api(`/api/orders/${encodeURIComponent(orderId)}/sync-payment?token=${encodeURIComponent(token)}`, {
      method: "POST",
      body: JSON.stringify({ payment_id: paymentId }),
    });
    if (result?.approved) toast("Pago confirmado.");
  } catch (_) {
    /* sin webhook, el usuario puede reintentar desde el seguimiento o confirmar manualmente */
  } finally {
    ["payment_id","collection_id","status","collection_status","external_reference","preference_id","merchant_order_id","payment_type","site_id","processing_mode"].forEach((k) => params.delete(k));
    const qs = params.toString();
    history.replaceState({}, "", `${location.pathname}${qs ? `?${qs}` : ""}`);
  }
}

async function load({ initial = false } = {}) {
  try {
    const { order } = await api(
      `/api/orders/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`,
    );
    const signature = `${order.status}|${order.payment.status}|${order.timeline.length}|${order.fulfillment.status}`;
    const changed = signature !== state.signature;
    state.order = order;
    if (changed || initial) {
      state.signature = signature;
      render();
    }
  } catch (error) {
    if (initial) {
      root.innerHTML = `
        <div class="checkout-empty">
          <p class="eyebrow" style="justify-content:center">Seguimiento</p>
          <h1 class="display">No pudimos abrir el pedido.</h1>
          <p>${escapeHtml(error.message)} Si el problema sigue, escribinos con tu número de pedido.</p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <a class="btn btn--primary" href="/">Volver a la tienda</a>
            <a class="btn btn--ghost" href="mailto:hola@lajoaquina.shop">Escribirnos</a>
          </div>
        </div>`;
    }
  }
}

function render() {
  const order = state.order;
  const status = STATUS[order.status] || STATUS.pending;
  document.title = `${order.id} · ${status.pill} · La Joaquina`;

  root.innerHTML = `
    <div class="order-head">
      <p class="eyebrow">Pedido ${escapeHtml(order.id)}</p>
      <h1 class="display">Gracias, ${escapeHtml(firstName(order.customer.name))}.</h1>
      <p>${escapeHtml(formatDate(order.createdAt))} · ${escapeHtml(order.customer.city || order.customer.country)} · ${order.items.reduce((acc, item) => acc + item.qty, 0)} artículos</p>
    </div>

    <div class="order-grid">
      <div>
        <section class="status-hero">
          <span class="status-pill ${status.tone === "warn" ? "status-pill--warn" : status.tone === "bad" ? "status-pill--bad" : ""}"><i></i> ${escapeHtml(status.pill)}</span>
          <h1>${escapeHtml(status.title)}</h1>
          <p>${escapeHtml(status.copy)}</p>

        </section>

        <section class="panel">
          <div class="panel__head"><h2>Seguimiento</h2><span>${order.status === "shipped" ? "En camino" : "Se actualiza solo"}</span></div>
          ${renderShipmentProgress(order)}
          ${renderTimeline(order)}
          ${renderTracking(order)}
        </section>

        ${renderPaymentPanel(order)}
        ${renderReceiptPanel(order)}
      </div>

      <aside>
        <div class="panel summary">
          <div class="panel__head"><h2>Resumen</h2><span>${escapeHtml(order.id)}</span></div>
          <div class="order-items">
            ${order.items
              .map(
                (item) => `
              <div class="order-item">
                <img src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy">
                <div>${escapeHtml(item.name)}<span>${escapeHtml(item.color || "")} · ×${item.qty}</span></div>
                <strong>${money(item.lineTotal, order.currency)}</strong>
              </div>`,
              )
              .join("")}
          </div>
          <div class="summary__lines" style="margin-top:16px">
            <div class="summary__line"><span>Subtotal</span><strong>${money(order.totals.subtotal, order.currency)}</strong></div>
            ${order.totals.discount ? `<div class="summary__line"><span>Descuento</span><strong style="color:#2f7a49">−${money(order.totals.discount, order.currency)}</strong></div>` : ""}
            <div class="summary__line"><span>Envío</span><strong>${order.totals.shipping === 0 ? "Gratis" : money(order.totals.shipping, order.currency)}</strong></div>
          </div>
          <div class="order-total"><span>Total</span><strong>${money(order.totals.total, order.currency)}</strong></div>
          <p style="font-size:11px;color:var(--muted-2);text-align:right;margin-top:-4px">${order.currency === "ARS" ? "IVA incluido" : "Impuestos incluidos"}</p>

          <div class="order-meta">
            <div><small>Contacto</small><strong>${escapeHtml(order.customer.email)}</strong></div>
            <div><small>Envío</small><strong>${escapeHtml(order.shippingMethod === "express" ? "Express" : "Estándar")} · ${escapeHtml(order.shippingEta)}</strong></div>
            <div><small>Dirección</small><strong>${escapeHtml([order.customer.address, order.customer.postal].filter(Boolean).join(", ") || "—")}</strong></div>
            <div><small>Destino</small><strong>${escapeHtml([order.customer.city, order.customer.province, order.customer.country].filter(Boolean).join(", "))}</strong></div>
            <div><small>Pago</small><strong>${escapeHtml(paymentLabel(order.payment.method))} · ${escapeHtml(paymentStatus(order.payment.status))}</strong></div>
          </div>



          <div class="order-actions">
            <a class="btn btn--primary btn--sm" href="/">Seguir comprando</a>
            <a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="${escapeHtml(whatsappUrl(`Hola, tengo una consulta por el pedido ${order.id}`))}">WhatsApp</a>
          </div>
          <p class="delivery-note">¿Algo no coincide? Escribinos a <a href="mailto:hola@lajoaquina.shop" style="text-decoration:underline">hola@lajoaquina.shop</a> con el número de pedido. Devoluciones dentro de los 10 días.</p>
        </div>
      </aside>
    </div>`;

  bind();
}

function renderShipmentProgress(order) {
  const stage =
    order.status === "delivered" ? 3
      : order.status === "shipped" ? 2
        : order.status === "paid" ? 1
          : 0;
  const steps = [
    ["Confirmado", order.paidAt ? formatDate(order.paidAt) : "Esperando pago"],
    ["En preparación", stage >= 1 ? "Preparando tu pedido" : "Pendiente"],
    ["En camino", stage >= 2 ? order.fulfillment.carrier || "Despachado" : "Pendiente"],
    ["Entregado", stage >= 3 ? "Recibido" : "Pendiente"],
  ];
  return `<div class="ship-steps">${steps
    .map(([label, detail], index) => {
      const state = index < stage ? "is-done" : index === stage ? "is-current" : "";
      return `<div class="ship-step ${state}"><span class="ship-step__dot" aria-hidden="true"></span><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></div>`;
    })
    .join("")}</div>`;
}

function renderTimeline(order) {
  const items = [...order.timeline];
  const final = ["delivered", "cancelled", "refunded"].includes(order.status);
  return `
    <div class="timeline">
      ${items
        .map(
          (event, index) => `
        <div class="timeline__item ${index === items.length - 1 && !final ? "is-current" : "is-done"}">
          <span class="timeline__dot" aria-hidden="true"></span>
          <div class="timeline__body">
            <strong>${escapeHtml(event.label)}</strong>
            <span>${escapeHtml(formatDateTime(event.at))}</span>
          </div>
        </div>`,
        )
        .join("")}
      ${
        !final
          ? `<div class="timeline__item">
              <span class="timeline__dot" aria-hidden="true"></span>
              <div class="timeline__body">
                <strong>${order.fulfillment.status === "shipped" ? "Entrega" : "Envío y entrega"}</strong>
                <span>Te avisamos por email en cada paso</span>
              </div>
            </div>`
          : ""
      }
    </div>`;
}

function renderTracking(order) {
  const { tracking, trackingUrl, carrier, supplierRef } = order.fulfillment;
  if (!tracking) {
    if (order.status === "paid") {
      return `<div class="shipment-empty"><strong>Estamos preparando tu pedido.</strong><br>El código de seguimiento aparece acá cuando lo despachemos. Despacho estimado: ${escapeHtml(order.shippingEta)}.</div>`;
    }
    return `<div class="shipment-empty"><strong>Envío pendiente.</strong><br>${supplierRef ? `Referencia logística: ${escapeHtml(supplierRef)}.` : ""} El código aparece cuando el pedido sale del depósito.</div>`;
  }
  return `
    <div class="instructions" style="margin-top:14px">
      <h3>Seguimiento ${escapeHtml(carrier || "")}</h3>
      <p>Usá este código en el sitio del correo. ${escapeHtml(order.shippingEta ? `Entrega estimada: ${order.shippingEta}.` : "")}</p>
      ${copyRow("Código", tracking)}
      ${trackingUrl ? `<p style="margin-top:12px"><a class="btn btn--ghost btn--sm" href="${escapeHtml(trackingUrl)}" target="_blank" rel="noopener">Ver recorrido en el correo</a></p>` : ""}
    </div>`;
}

function renderPaymentPanel(order) {
  const instructions = order.payment.instructions;
  if (!instructions || order.payment.status === "approved") return "";

  if (instructions.method === "cash") {
    return `
      <section class="panel">
        <div class="panel__head"><h2>Pago en efectivo</h2><span>${escapeHtml(instructions.title || "Coordinado")}</span></div>
        <p class="order-copy">${escapeHtml(instructions.note || "Coordinamos la entrega y el pago por WhatsApp.")}</p>
        <div class="copy-list">
          ${copyRow("Total a pagar", money(instructions.amount, instructions.currency), String(instructions.amount))}
          ${copyRow("Modalidad", "Efectivo")}
        </div>
        <div class="order-actions">
          <a class="btn btn--primary btn--sm" target="_blank" rel="noopener" href="${escapeHtml(whatsappUrl(`Hola, quiero coordinar el pago en efectivo del pedido ${order.id}`))}">Coordinar por WhatsApp</a>
        </div>
      </section>`;
  }

  if (instructions.method === "transfer") {
    return `
      <section class="panel">
        <div class="panel__head"><h2>Datos para transferir</h2><span>Vence en ${instructions.expiresInMinutes} min</span></div>
        <p class="order-copy">Transferí el total exacto y usá <strong>${escapeHtml(instructions.concept)}</strong> como concepto. La conciliación es automática.</p>
        <div class="copy-list">
          ${instructions.alias ? copyRow("Alias", instructions.alias) : ""}
          ${instructions.cbu ? copyRow("CBU", instructions.cbu) : ""}
          ${instructions.holder ? copyRow("Titular", instructions.holder) : ""}
          ${instructions.cuit ? copyRow("CUIT", instructions.cuit) : ""}
          ${instructions.bank ? copyRow("Banco", instructions.bank) : ""}
          ${copyRow("Importe", money(instructions.amount, instructions.currency), String(instructions.amount))}
          ${copyRow("Concepto", instructions.concept)}
        </div>
      </section>`;
  }

  if (instructions.method === "crypto") {
    return `
      <section class="panel">
        <div class="panel__head"><h2>Pago en USDT</h2><span>${escapeHtml(instructions.network)}</span></div>
        <p class="order-copy">Enviá exactamente <strong>${instructions.cryptoAmount} USDT</strong> a la dirección de abajo. Si el monto no coincide, la acreditación queda en revisión.</p>
        <div class="copy-list">
          ${copyRow("Red", instructions.network)}
          ${copyRow("Dirección", instructions.address)}
          ${copyRow("Monto", `${instructions.cryptoAmount} USDT`, instructions.cryptoAmount)}
        </div>
        <p class="delivery-note">${escapeHtml(instructions.note || "")}</p>
      </section>`;
  }

  return "";
}

function renderReceiptPanel(order) {
  if (order.payment.method !== "transfer") return "";
  if (order.payment.status === "approved") return "";

  const reviewing = order.payment.status === "verifying" || order.status === "payment_review";

  return `
    <section class="panel">
      <div class="panel__head"><h2>Subir comprobante</h2><span>Verificación automática</span></div>
      <p class="order-copy">${reviewing ? "Ya recibimos un comprobante y quedó en revisión. Si corregís el monto o la referencia, podés reenviarlo." : "Ingresá el monto y el número de operación. Si coinciden con el pedido, se aprueba al instante."}</p>
      <form class="receipt-form" id="receipt-form">
        <div class="form-grid">
          <div class="field">
            <label for="receipt-amount">Monto transferido (${order.currency})</label>
            <input class="input" id="receipt-amount" name="amount" type="number" min="0" step="${order.currency === "ARS" ? "1" : "0.01"}" value="${order.totals.total}" required>
          </div>
          <div class="field">
            <label for="receipt-reference">Número de operación</label>
            <input class="input" id="receipt-reference" name="reference" placeholder="Ej. ${escapeHtml(order.id.replace(/^(AUR-|LJ-)/, ""))}" required>
          </div>
          <div class="field field--full">
            <label for="receipt-file">Comprobante (opcional)</label>
            <input class="input" id="receipt-file" name="file" type="file" accept="image/*,application/pdf">
            <span class="field-hint" style="font-size:10.5px;color:var(--muted-2)">Se registra el nombre del archivo; la verificación se realiza con monto y referencia.</span>
          </div>
        </div>
        <button class="btn btn--primary" type="submit" id="receipt-submit">Confirmar transferencia</button>
        <p class="form-msg" id="receipt-msg" role="status"></p>
      </form>
    </section>`;
}

function copyRow(label, value, raw = null) {
  return `
    <div class="copy-row">
      <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>
      <button class="copy-btn" type="button" data-copy="${escapeHtml(raw ?? value)}">Copiar</button>
    </div>`;
}

function bind() {
  const order = state.order;

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copy;
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "Copiado";
      } catch {
        const area = document.createElement("textarea");
        area.value = value;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
        button.textContent = "Copiado";
      }
      setTimeout(() => {
        button.textContent = "Copiar";
      }, 1600);
    });
  });


  const form = document.querySelector("#receipt-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.busy) return;
    const msg = document.querySelector("#receipt-msg");
    const submit = document.querySelector("#receipt-submit");
    const file = document.querySelector("#receipt-file");
    state.busy = true;
    submit.disabled = true;
    submit.textContent = "Verificando…";
    msg.className = "form-msg";
    msg.textContent = "";
    try {
      const result = await api(`/api/orders/${encodeURIComponent(order.id)}/receipt`, {
        method: "POST",
        body: JSON.stringify({
          token,
          amount: Number(document.querySelector("#receipt-amount").value),
          reference: document.querySelector("#receipt-reference").value.trim(),
          fileName: file?.files?.[0]?.name || "",
        }),
      });
      if (result.approved) {
        toast("Transferencia verificada. Pedido confirmado.");
      } else {
        msg.className = "form-msg is-error";
        msg.textContent = !result.check?.amountOk
          ? "El monto no coincide con el total del pedido. Revisá el importe transferido."
          : "El número de operación no incluye el pedido. Quedó en revisión manual.";
      }
      await load({ initial: true });
    } catch (error) {
      msg.className = "form-msg is-error";
      msg.textContent = error.message;
      submit.disabled = false;
      submit.textContent = "Confirmar transferencia";
    } finally {
      state.busy = false;
    }
  });
}

function firstName(name = "") {
  return String(name).trim().split(/\s+/)[0] || "bienvenido";
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function formatDateTime(iso) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function paymentLabel(method) {
  return {
    mercadopago: "MercadoPago",
    transfer: "Transferencia",
    cash: "Efectivo",
  }[method] || method;
}

function paymentStatus(status) {
  return {
    pending: "pendiente",
    verifying: "en revisión",
    approved: "aprobado",
    rejected: "rechazado",
    refunded: "reembolsado",
  }[status] || status;
}
