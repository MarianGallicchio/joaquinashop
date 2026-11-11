import {
  init,
  catalog,
  cartLines,
  money,
  api,
  toast,
  getChannel,
  track,
  escapeHtml,
} from "./common.js";

await init({ page: "checkout" });

const root = document.querySelector("#checkout-root");
const data = catalog();
const state = {
  country: sessionStorage.getItem("aurea_country") || "Argentina",
  shippingMethod: "standard",
  paymentMethod: null,
  coupon: sessionStorage.getItem("aurea_coupon") || "",
  totals: null,
  methods: [],
  submitting: false,
};

document.querySelector("[data-year]").textContent = new Date().getFullYear();

if (!cartLines().length) {
  root.innerHTML = `
    <div class="checkout-empty">
      <p class="eyebrow" style="justify-content:center">Tu carrito</p>
      <h1 class="display">Todavía no elegiste nada.</h1>
      <p>Volvé a la tienda y elegí lo que necesitás para tu casa.</p>
      <a class="btn btn--primary" href="/#bestsellers">Ver productos</a>
    </div>`;
} else {
  render();
  setupAccountAndPostalAutofill();
  await refresh({ initial: true });
  prefillFromCustomer();
}

function render() {
  const countries = [
    "Argentina", "Chile", "Uruguay", "México", "Colombia", "España", "Estados Unidos", "Perú", "Otro",
  ];
  root.innerHTML = `
    <div class="checkout-grid">
      <div>
        <p class="eyebrow">Checkout</p>
        <h1 class="display" style="font-size:clamp(2rem,3.4vw,3rem);margin:8px 0 22px;">Casi listo.</h1>

        <form id="checkout-form" novalidate>
          <section class="panel">
            <div class="panel__head"><h2>01 · Contacto</h2><span>Te avisamos por email</span></div>
            <div class="form-grid">
              <div class="field field--full">
                <label for="email">Email</label>
                <input class="input" id="email" name="email" type="email" autocomplete="email" placeholder="vos@email.com" required>
              </div>
              <div class="field">
                <label for="name">Nombre y apellido</label>
                <input class="input" id="name" name="name" autocomplete="name" placeholder="Mariano Pérez" required>
              </div>
              <div class="field">
                <label for="phone">Teléfono</label>
                <input class="input" id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+54 9 11 0000 0000" required>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel__head"><h2>02 · Envío</h2><span id="eta-label">Calculando…</span></div>
            <div class="form-grid">
              <div class="field">
                <label for="country">País</label>
                <select class="select" id="country" name="country">
                  ${countries.map((country) => `<option value="${country}" ${country === state.country ? "selected" : ""}>${country}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label for="province">Provincia / Estado</label>
                <input class="input" id="province" name="province" autocomplete="address-level1" placeholder="CABA" required>
              </div>
              <div class="field field--full">
                <label for="address">Dirección y número</label>
                <input class="input" id="address" name="address" autocomplete="street-address" placeholder="Av. Siempre Viva 742, piso 3" required>
              </div>
              <div class="field">
                <label for="city">Ciudad</label>
                <input class="input" id="city" name="city" autocomplete="address-level2" placeholder="CABA" required>
              </div>
              <div class="field">
                <label for="postal">Código postal</label>
                <input class="input" id="postal" name="postal" autocomplete="postal-code" placeholder="C1425" required>
              </div>
              <div class="field field--full">
                <label for="notes">Notas para el envío (opcional)</label>
                <input class="input" id="notes" name="notes" placeholder="Timbre, entre calles, horario preferido…">
              </div>
            </div>
            <div class="ship-options" id="ship-options" style="margin-top:16px"></div>
          </section>

          <section class="panel">
            <div class="panel__head"><h2>03 · Pago</h2><span>Elegí cómo pagar</span></div>
            <div class="pay-methods" id="pay-methods"></div>
            <p class="pay-note" id="pay-note"></p>
            <p class="form-msg is-error" id="checkout-error" role="alert"></p>
          </section>
        </form>
      </div>

      <aside>
        <div class="panel summary">
          <div class="panel__head">
            <h2>Tu pedido</h2>
            <a href="#" data-open-cart style="font-size:11px;text-decoration:underline;">Editar carrito</a>
          </div>
          <div class="summary__items" id="summary-items"></div>
          <div class="coupon">
            <div class="field" style="gap:0">
              <label for="coupon" class="sr-only" style="position:absolute;left:-9999px">Cupón</label>
              <input class="input" id="coupon" placeholder="Código de descuento" value="${escapeHtml(state.coupon)}">
            </div>
            <button class="btn btn--ghost" type="button" id="apply-coupon">Aplicar</button>
          </div>
          <p class="form-msg" id="coupon-msg" style="margin:6px 0 0;"></p>
          <div class="summary__lines" id="summary-lines" style="margin-top:16px;"></div>
          <div class="summary__total"><span>Total</span><strong id="summary-total">—</strong></div>
          <p class="summary__tax" id="summary-tax"></p>
          <button class="btn btn--lime btn--block btn--lg" id="pay-button" type="submit" form="checkout-form" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            Pagar
          </button>
          <div class="checkout-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-5"/></svg>
            <span>Tus datos se usan solo para gestionar el pedido. Al confirmar aceptás los <a href="/legal#terminos" style="text-decoration:underline">términos</a> y la <a href="/legal#privacidad" style="text-decoration:underline">política de privacidad</a>.</span>
          </div>
          <div id="test-fill" style="margin-top:12px;"></div>
        </div>
      </aside>
    </div>`;

  document.querySelector("#country").addEventListener("change", async (event) => {
    state.country = event.target.value;
    state.shippingMethod = "standard";
    sessionStorage.setItem("aurea_country", state.country);
    await refresh();
  });

  document.querySelector("#apply-coupon").addEventListener("click", async () => {
    const input = document.querySelector("#coupon");
    const code = input.value.trim().toUpperCase();
    state.coupon = code;
    sessionStorage.setItem("aurea_coupon", code);
    await refresh({ couponChanged: true });
  });

  document.querySelector("#coupon").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.querySelector("#apply-coupon").click();
    }
  });

  document.querySelector("#checkout-form").addEventListener("submit", submit);

  root.addEventListener("change", (event) => {
    if (event.target.name === "shipping") {
      state.shippingMethod = event.target.value;
      refresh();
    }
    if (event.target.name === "payment") {
      state.paymentMethod = event.target.value;
      updatePaymentUI();
      syncPaymentPrice().catch((error) => toast(error.message, { error: true }));
    }
  });

  document.querySelector("[data-open-cart]")?.addEventListener("click", (event) => {
    event.preventDefault();
    window.Aurea?.openCart();
  });

  window.Aurea?.onCartChange?.(() => {});
}

async function fetchQuote() {
  return api("/api/quote", {
    method: "POST",
    body: JSON.stringify({
      items: cartLines().map((line) => ({ id: line.id, qty: line.qty, color: line.color })),
      couponCode: state.coupon || null,
      country: state.country,
      shippingMethod: state.shippingMethod,
      paymentMethod: state.paymentMethod,
    }),
  });
}

async function refresh({ initial = false, couponChanged = false } = {}) {
  const errorBox = document.querySelector("#checkout-error");
  if (errorBox) errorBox.textContent = "";
  try {
    const totals = await fetchQuote();
    state.totals = totals;
    state.shippingMethod = totals.shippingMethod;

    if (couponChanged) {
      const msg = document.querySelector("#coupon-msg");
      msg.className = "form-msg is-ok";
      msg.textContent = totals.coupon ? `Cupón ${totals.coupon.code} aplicado: ${totals.coupon.label}` : "";
    }

    renderSummary();
    renderShipping();
    await renderMethods();
    await syncPaymentPrice();
    updatePaymentUI();
  } catch (error) {
    if (error.status === 400 && state.coupon) {
      state.coupon = "";
      sessionStorage.removeItem("aurea_coupon");
      const input = document.querySelector("#coupon");
      if (input) input.value = "";
      const msg = document.querySelector("#coupon-msg");
      if (msg) {
        msg.className = "form-msg is-error";
        msg.textContent = error.message;
      }
      if (!initial) return refresh();
    }
    toast(error.message, { error: true });
  }
}

async function syncPaymentPrice() {
  if (!state.paymentMethod || !state.totals) return;
  const method = state.methods.find((item) => item.id === state.paymentMethod);
  if (!method || !method.available || state.totals.priceMode === method.priceMode) return;
  const totals = await fetchQuote();
  state.totals = totals;
  state.shippingMethod = totals.shippingMethod;
  renderSummary();
  renderShipping();
}


function prefillFromCustomer() {
  const customer = window.Aurea?.getCurrentCustomer?.();
  if (!customer) return;
  const a = customer.address || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el || !val) return;
    if (!String(el.value || "").trim()) el.value = String(val);
  };
  setVal("name", customer.name || a.name);
  setVal("email", customer.email);
  setVal("phone", customer.phone || a.phone);
  setVal("address", a.address);
  setVal("city", a.city);
  setVal("province", a.province || "Buenos Aires");
  setVal("postal", a.postal);
  setVal("country", a.country || "Argentina");
  if (a.country && document.getElementById("country")) {
    const sel = document.getElementById("country");
    if ([...sel.options].some((o) => o.value === a.country) && !sel.dataset.userSet) {
      sel.value = a.country;
      state.country = a.country;
    }
  }
  // Si hay localidad/provincia de Buenos Aires y falta CP, autocompletar
  autoFillPostalFromCity(true);
  renderAccountHint();
}

let lastPostalLookup = "";
async function autoFillPostalFromCity(onlyIfEmpty = false) {
  const city = document.getElementById("city")?.value?.trim() || "";
  const province = document.getElementById("province")?.value?.trim() || state.country || "Buenos Aires";
  const postalInput = document.getElementById("postal");
  if (!postalInput) return;
  if (onlyIfEmpty && postalInput.value.trim()) return;
  const key = `${province}|${city}`.toLowerCase();
  if (!city) return;
  if (key === lastPostalLookup && !onlyIfEmpty) return;
  lastPostalLookup = key;
  try {
    const res = await fetch(`/api/shipping/postal-code?city=${encodeURIComponent(city)}&province=${encodeURIComponent(province)}`);
    const data = await res.json();
    if (data && data.postalCode) {
      if (!onlyIfEmpty || !postalInput.value.trim()) {
        postalInput.value = data.postalCode;
        postalInput.dataset.autofilled = "1";
      }
    }
  } catch {
    /* silencioso */
  }
}

function renderAccountHint() {
  const form = document.getElementById("checkout-form");
  if (!form) return;
  let hint = document.getElementById("checkout-account-hint");
  const customer = window.Aurea?.getCurrentCustomer?.();
  if (!hint) {
    hint = document.createElement("div");
    hint.id = "checkout-account-hint";
    hint.className = "account-card";
    hint.style.marginBottom = "14px";
    const firstPanel = form.querySelector(".panel");
    if (firstPanel) firstPanel.parentNode.insertBefore(hint, firstPanel);
  }
  if (customer) {
    hint.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <strong style="font-family:var(--serif);font-size:20px;font-weight:400;">Comprando como ${escapeHtml(customer.name || "cliente")}</strong>
          <div class="account-note">Usamos tus datos guardados para completar el envío. Podés editarlos si hace falta.</div>
        </div>
        <button type="button" class="btn btn--ghost" id="checkout-account-edit">Mis datos</button>
      </div>`;
    hint.querySelector("#checkout-account-edit")?.addEventListener("click", () => window.Aurea?.openAccountModal?.("profile"));
  } else {
    hint.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <strong style="font-family:var(--serif);font-size:20px;font-weight:400;">¿Ya tenés cuenta?</strong>
          <div class="account-note">Ingresá o creá tu cuenta para guardar tus datos y completar el envío más rápido.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn--ghost" id="checkout-login">Ingresar</button>
          <button type="button" class="btn btn--ink" id="checkout-register">Crear cuenta</button>
        </div>
      </div>`;
    hint.querySelector("#checkout-login")?.addEventListener("click", () => window.Aurea?.openAccountModal?.("login"));
    hint.querySelector("#checkout-register")?.addEventListener("click", () => window.Aurea?.openAccountModal?.("register"));
  }
}

function setupAccountAndPostalAutofill() {
  // Esperar a que la cuenta cargue y prellenar
  setTimeout(() => { prefillFromCustomer(); }, 200);
  setTimeout(() => { prefillFromCustomer(); }, 900);
  window.addEventListener("aurea:customer-change", () => { prefillFromCustomer(); });

  const city = document.getElementById("city");
  const province = document.getElementById("province");
  const country = document.getElementById("country");
  const postal = document.getElementById("postal");

  const onCityChange = () => {
    // si el usuario cambia localidad, recalcular CP automáticamente
    if (postal) postal.dataset.autofilled = "";
    autoFillPostalFromCity(false);
  };
  if (city) {
    city.addEventListener("blur", onCityChange);
    city.addEventListener("change", onCityChange);
  }
  if (province) {
    province.addEventListener("blur", () => autoFillPostalFromCity(false));
    province.addEventListener("change", () => autoFillPostalFromCity(false));
  }
  if (country) {
    country.addEventListener("change", () => { country.dataset.userSet = "1"; autoFillPostalFromCity(false); });
  }
  if (postal) {
    postal.addEventListener("input", () => { postal.dataset.autofilled = ""; });
  }

  renderAccountHint();
}

function renderSummary() {
  const totals = state.totals;
  if (!totals) return;
  const currency = totals.currency;
  document.querySelector("#summary-items").innerHTML = totals.items
    .map(
      (item) => `
      <div class="summary-item">
        <img class="summary-item__img" src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy">
        <div class="summary-item__body">${escapeHtml(item.name)}<span>${escapeHtml(item.color || "")} · ×${item.qty}</span></div>
        <span class="summary-item__price">${money(item.lineTotal, currency)}</span>
      </div>`,
    )
    .join("");

  document.querySelector("#summary-lines").innerHTML = `
    <div class="summary__line"><span>Subtotal</span><strong>${money(totals.subtotal, currency)}</strong></div>
    ${totals.discount ? `<div class="summary__line"><span>Descuento ${totals.coupon ? `(${totals.coupon.code})` : ""}</span><strong style="color:#2f7a49">−${money(totals.discount, currency)}</strong></div>` : ""}
    <div class="summary__line"><span>Envío</span><strong>${totals.shipping === 0 ? "Gratis" : money(totals.shipping, currency)}</strong></div>
    ${totals.freeShippingRemaining > 0 ? `<div class="summary__line" style="font-size:11px"><span>Te faltan para envío gratis</span><span>${money(totals.freeShippingRemaining, currency)}</span></div>` : ""}`;

  document.querySelector("#summary-total").textContent = money(totals.total, currency);
  document.querySelector("#summary-tax").textContent =
    totals.priceMode === "card" ? `Precio con tarjeta aplicado · ${totals.taxNote}` : totals.taxNote;
  document.querySelector("#eta-label").textContent = totals.shippingEta;
  document.querySelector("#pay-button").disabled = state.submitting;
  document.querySelector("#pay-button").innerHTML = state.submitting
    ? "Creando tu pedido…"
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> Pagar ${money(totals.total, currency)}`;
}

function renderShipping() {
  const totals = state.totals;
  const container = document.querySelector("#ship-options");
  if (!totals || !container) return;
  container.innerHTML = totals.shippingOptions
    .map(
      (option) => `
      <label class="ship-option ${option.id === totals.shippingMethod ? "is-active" : ""}">
        <input type="radio" name="shipping" value="${option.id}" ${option.id === totals.shippingMethod ? "checked" : ""}>
        <span class="ship-option__body"><strong>${option.label}</strong><span>${option.eta}</span></span>
        <span class="ship-option__price">${option.price === 0 ? "Gratis" : money(option.price, totals.currency)}</span>
      </label>`,
    )
    .join("");
}

async function renderMethods() {
  const totals = state.totals;
  const container = document.querySelector("#pay-methods");
  if (!totals || !container) return;

  const result = await api(`/api/payments/methods?country=${encodeURIComponent(state.country)}`);
  state.methods = result.methods;



  const selectable = state.methods.filter((method) => method.available);
  if (!selectable.some((method) => method.id === state.paymentMethod)) {
    state.paymentMethod = selectable[0]?.id || null;
  }

  container.innerHTML = state.methods
    .map(
      (method) => `
      <label class="pay-method ${method.id === state.paymentMethod ? "is-active" : ""} ${method.available ? "" : "is-disabled"}">
        <input type="radio" name="payment" value="${method.id}" ${method.id === state.paymentMethod ? "checked" : ""} ${method.available ? "" : "disabled"}>
        <span class="pay-icon">${iconFor(method.id)}</span>
        <span class="pay-method__body">
          <strong>${method.label}${method.available ? "" : '<span style="font-family:var(--mono);font-size:8px;background:#ece9e1;padding:2px 5px;border-radius:4px;margin-left:4px;letter-spacing:.06em">NO DISPONIBLE</span>'}</strong>
          <span>${method.available ? method.description : "No disponible por ahora"}</span>
        </span>
      </label>`,
    )
    .join("");

  container.querySelectorAll('input[name="payment"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.paymentMethod = input.value;
      container.querySelectorAll(".pay-method").forEach((label) => label.classList.toggle("is-active", label.contains(input)));
      updatePaymentUI();
    });
  });

  const testFill = document.querySelector("#test-fill");
  if (testFill) testFill.innerHTML = "";
}

function updatePaymentUI() {
  const note = document.querySelector("#pay-note");
  if (!note) return;
  const selected = state.methods.find((method) => method.id === state.paymentMethod);
  if (selected && !selected.available) {
    note.textContent = "Ese medio de pago no está disponible por ahora. Elegí transferencia o efectivo.";
    return;
  }
  const copy = {
    mercadopago: "Te redirigimos a MercadoPago para completar el pago. El total incluye el precio con tarjeta.",
    transfer: "Generamos los datos bancarios y confirmás subiendo el comprobante.",
    cash: "Coordinamos la entrega y el pago en efectivo por WhatsApp. Tu pedido queda reservado.",
  };
  note.textContent = copy[state.paymentMethod] || "";
}

function iconFor(method) {
  return {
    mercadopago: "MP",
    transfer: "CBU",
    cash: "CASH",
  }[method] || "PAY";
}

async function submit(event) {
  event.preventDefault();
  if (state.submitting) return;

  const form = event.currentTarget;
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  if (!state.paymentMethod) {
    const box = document.querySelector("#checkout-error");
    box.textContent = "Elegí un medio de pago.";
    return;
  }

  state.submitting = true;
  renderSummary();
  const errorBox = document.querySelector("#checkout-error");
  errorBox.textContent = "";

  const lines = cartLines();
  const payload = {
    customer: {
      name: document.querySelector("#name").value.trim(),
      email: document.querySelector("#email").value.trim(),
      phone: document.querySelector("#phone").value.trim(),
      address: document.querySelector("#address").value.trim(),
      city: document.querySelector("#city").value.trim(),
      province: document.querySelector("#province").value.trim(),
      country: state.country,
      postal: document.querySelector("#postal").value.trim(),
      notes: document.querySelector("#notes").value.trim(),
    },
    items: lines.map((line) => ({ id: line.id, qty: line.qty, color: line.color })),
    couponCode: state.coupon || null,
    country: state.country,
    shippingMethod: state.shippingMethod,
    paymentMethod: state.paymentMethod,
    channel: getChannel(),
    meta: {
      landing: sessionStorage.getItem("aurea_landing") || location.pathname,
    },
  };

  try {
    track("begin_checkout", { value: state.totals?.total, currency: state.totals?.currency });
    const result = await api("/api/checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    sessionStorage.setItem(
      "aurea_last_order",
      JSON.stringify({ order: result.order.id, token: result.token }),
    );

    if (result.payment?.url) {
      location.href = result.payment.url;
      return;
    }
    location.href = `/pedido.html?order=${encodeURIComponent(result.order.id)}&token=${encodeURIComponent(result.token)}`;
  } catch (error) {
    state.submitting = false;
    renderSummary();
    errorBox.textContent = error.message;
    toast(error.message, { error: true });
  }
}
