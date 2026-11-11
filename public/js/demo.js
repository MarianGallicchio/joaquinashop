import { api, money, toast, escapeHtml, track } from "/js/common.js";

const root = document.querySelector("#demo-root");
const params = new URLSearchParams(location.search);
const orderId = params.get("order") || "";
const token = params.get("token") || "";
const method = params.get("method") || "demo";

const state = { order: null, busy: false };

if (!orderId || !token) {
  root.innerHTML = `
    <a class="brand" href="/">La Joaquina<span class="brand__dot" aria-hidden="true"></span></a>
    <h1 class="display">Link inválido.</h1>
    <p>No encontramos los datos del pedido. Volvé al checkout para generarlo de nuevo.</p>
    <a class="btn btn--primary btn--block" style="margin-top:20px" href="/checkout.html">Ir al checkout</a>`;
} else {
  await loadOrder();
}

async function loadOrder() {
  try {
    const { order } = await api(
      `/api/orders/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`,
    );
    state.order = order;
    render();
  } catch (error) {
    root.innerHTML = `
      <a class="brand" href="/">La Joaquina<span class="brand__dot" aria-hidden="true"></span></a>
      <h1 class="display">No pudimos abrir el pedido.</h1>
      <p>${escapeHtml(error.message)}</p>
      <a class="btn btn--primary btn--block" style="margin-top:20px" href="/">Volver a la tienda</a>`;
  }
}

function statusView(order) {
  if (order.payment.status === "approved") {
    return {
      title: "Pago aprobado.",
      copy: "Listo. El pedido ya se envió al proveedor automáticamente y te mandamos el email de confirmación.",
      badge: "Aprobado",
    };
  }
  if (order.payment.status === "rejected" || order.status === "cancelled") {
    return {
      title: "Pago rechazado.",
      copy: "No se hizo ningún cargo. Podés volver al checkout y probar con otro medio de pago.",
      badge: "Rechazado",
    };
  }
  return null;
}

function render() {
  const order = state.order;
  const done = statusView(order);

  if (done) {
    root.innerHTML = `
      <a class="brand" href="/">La Joaquina<span class="brand__dot" aria-hidden="true"></span></a>
      <span class="demo-badge">Demo · resultado</span>
      <h1>${escapeHtml(done.title)}</h1>
      <p>${escapeHtml(done.copy)}</p>
      <div class="demo-amount">
        <span>Pedido ${escapeHtml(order.id)}</span>
        <strong>${money(order.totals.total, order.currency)}</strong>
      </div>
      <div class="demo-actions">
        <a class="btn btn--primary btn--block" href="/pedido.html?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(token)}">Ver mi pedido</a>
        <a class="btn btn--ghost btn--block" href="/">Volver a la tienda</a>
      </div>
      <p class="demo-note">Este resultado es una simulación local. No se cobró dinero real.</p>`;
    return;
  }

  root.innerHTML = `
    <a class="brand" href="/">La Joaquina<span class="brand__dot" aria-hidden="true"></span></a>
    <span class="demo-badge">Modo demo</span>
    <h1>Simulá el pago.</h1>
    <p>Esta pasarela existe para probar el flujo automático de La Joaquina sin claves reales. Elegí el resultado que querés ver.</p>

    <div class="demo-amount">
      <span>Total a cobrar</span>
      <strong>${money(order.totals.total, order.currency)}</strong>
    </div>

    <div class="demo-method">
      <span class="pay-icon" style="width:38px;height:30px">DEMO</span>
      <div>
        <strong style="display:block;font-size:12.5px">${escapeHtml(methodLabel(method))}</strong>
        <span style="font-size:11px;color:var(--muted)">Pedido ${escapeHtml(order.id)} · ${escapeHtml(order.customer.email)}</span>
      </div>
    </div>

    <div class="demo-actions">
      <button class="btn btn--lime btn--block btn--lg" data-action="approve">Aprobar pago</button>
      <button class="btn btn--ghost btn--block" data-action="reject">Simular rechazo</button>
    </div>
    <p class="form-msg" id="demo-msg" role="alert"></p>
    <p class="demo-note">Al aprobar, el pedido pasa a “pagado”, se crea la orden en el proveedor y se dispara el email transaccional (en modo demo queda en el log).</p>`;

  root.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => simulate(button.dataset.action));
  });
}

async function simulate(action) {
  if (state.busy) return;
  state.busy = true;
  const buttons = root.querySelectorAll("[data-action]");
  buttons.forEach((button) => {
    button.disabled = true;
  });
  const msg = root.querySelector("#demo-msg");
  msg.className = "form-msg";
  msg.textContent = action === "approve" ? "Aprobando el pago…" : "Rechazando el pago…";

  try {
    const { order } = await api(`/api/demo/pay/${encodeURIComponent(orderId)}`, {
      method: "POST",
      body: JSON.stringify({ token, action }),
    });
    state.order = order;
    track("begin_checkout", { demo: true, result: action });
    toast(action === "approve" ? "Pago aprobado" : "Pago rechazado");
    render();
  } catch (error) {
    msg.className = "form-msg is-error";
    msg.textContent = error.message;
    buttons.forEach((button) => {
      button.disabled = false;
    });
    state.busy = false;
  }
}

function methodLabel(id) {
  return {
    demo: "Pasarela de prueba La Joaquina",
    mercadopago: "MercadoPago",
    stripe: "Stripe",
    paypal: "PayPal",
  }[id] || "Pasarela de prueba";
}
