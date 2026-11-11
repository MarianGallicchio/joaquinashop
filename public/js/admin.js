import { money, escapeHtml, toast } from "./common.js";



/* ══════════════════════════════════════════════════════════════

   La Joaquina · Backoffice

   Login, KPIs, pedidos, catálogo, automatización y marketing.

   ══════════════════════════════════════════════════════════════ */



const TOKEN_KEY = "aurea_admin_token";

const DAYS_KEY = "aurea_admin_days";



const state = {

  token: localStorage.getItem(TOKEN_KEY) || "",

  days: [7, 30, 90, 120].includes(Number(localStorage.getItem(DAYS_KEY)))

    ? Number(localStorage.getItem(DAYS_KEY))

    : 30,

  view: "resumen",

  overview: null,

  orders: [],

  ordersTotal: 0,

  filter: "all",

  query: "",

  catalog: null,

  logistics: null,

  automations: null,

  backups: null,
  adminProducts: null,
  productQuery: "",
  productCategory: "all",
  editingProductId: null,

  loading: false,

};



const VIEW_META = {

  resumen: { eyebrow: "Resumen ejecutivo", title: "Cómo va La Joaquina" },

  pedidos: { eyebrow: "Operación", title: "Pedidos" },

  logistica: { eyebrow: "Operación", title: "Logística y stock" },

  productos: { eyebrow: "Catálogo", title: "Productos y márgenes" },

  automatizacion: { eyebrow: "Sistemas", title: "Automatización" },

  marketing: { eyebrow: "Crecimiento", title: "Marketing y datos" },

  ajustes: { eyebrow: "Configuración", title: "Datos de la tienda" },

};



const OPEN_STATUSES = ["pending", "pending_transfer", "pending_cash", "pending_crypto", "payment_review"];

const FINAL_STATUSES = ["cancelled", "refunded"];



const loginScreen = document.querySelector("#login-screen");

const app = document.querySelector("#app");

const root = document.querySelector("#view-root");



init();



function init() {

  document.querySelector("#login-form")?.addEventListener("submit", login);

  document.querySelector("#logout")?.addEventListener("click", () => logout(true));

  document.querySelector("#refresh")?.addEventListener("click", () => reload({ spin: true }));

  document.querySelector("#export")?.addEventListener("click", exportCsv);



  document.querySelectorAll("[data-view]").forEach((button) => {

    button.addEventListener("click", () => switchView(button.dataset.view));

  });



  document.querySelectorAll("#range-control button").forEach((button) => {

    button.classList.toggle("is-active", Number(button.dataset.days) === state.days);

    button.addEventListener("click", async () => {

      state.days = Number(button.dataset.days);

      localStorage.setItem(DAYS_KEY, String(state.days));

      document.querySelectorAll("#range-control button").forEach((item) => {

        item.classList.toggle("is-active", item === button);

      });

      await loadOverview();

      render();

    });

  });



  document.querySelectorAll("[data-close-modal]").forEach((element) => {

    element.addEventListener("click", closeModal);

  });



  document.addEventListener("keydown", (event) => {

    if (event.key === "Escape") closeModal();

  });



  bindSearch();



  fetch("/api/health")

    .then((response) => response.json())

    .then(({ demoMode }) => {

      if (!demoMode) document.querySelector(".admin-login__foot span")?.remove();

    })

    .catch(() => {});



  if (state.token) {

    enter().catch(() => logout(false));

  }

}



/* ── Autenticación ───────────────────────────────────────────── */



async function login(event) {

  event.preventDefault();

  const input = document.querySelector("#admin-password");

  const button = document.querySelector("#login-submit");

  const msg = document.querySelector("#login-msg");

  msg.className = "form-msg";

  msg.textContent = "";

  button.disabled = true;

  button.textContent = "Verificando…";

  try {

    const response = await fetch("/api/admin/login", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ password: input.value }),

    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || "No pudimos iniciar sesión.");

    state.token = data.token;

    localStorage.setItem(TOKEN_KEY, data.token);

    await enter();

  } catch (error) {

    msg.className = "form-msg is-error";

    msg.textContent = error.message;

  } finally {

    button.disabled = false;

    button.textContent = "Entrar al panel";

  }

}



async function enter() {

  state.overview = await adminApi(`/api/admin/overview?days=${state.days}`);

  loginScreen.hidden = true;

  app.hidden = false;

  updateNav();

  render();

}



function logout(notify = false) {

  state.token = "";

  localStorage.removeItem(TOKEN_KEY);

  app.hidden = true;

  loginScreen.hidden = false;

  document.querySelector("#admin-password").value = "";

  if (notify) toast("Sesión cerrada");

}



function authHeaders() {

  return { Authorization: `Bearer ${state.token}` };

}



async function adminApi(path, options = {}) {

  const response = await fetch(path, {

    ...options,

    headers: {

      "Content-Type": "application/json",

      ...authHeaders(),

      ...(options.headers || {}),

    },

  });

  if (response.status === 401) {

    logout(false);

    throw new Error("Sesión vencida. Volvé a entrar.");

  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error(data.error || "No pudimos completar la operación.");

  return data;

}



/* ── Datos ───────────────────────────────────────────────────── */



async function loadOverview({ silent = false } = {}) {

  state.loading = true;

  if (!silent && !state.overview) root.innerHTML = `<div class="admin-loading">Cargando datos…</div>`;

  try {

    const [overview, automations, backups] = await Promise.all([
      adminApi(`/api/admin/overview?days=${state.days}`),
      adminApi("/api/admin/automations").catch(() => null),
      adminApi("/api/admin/backups").catch(() => null),
    ]);
    state.overview = overview;
    state.automations = automations;
    state.backups = backups;

    updateNav();

  } catch (error) {

    toast(error.message, { error: true });

  } finally {

    state.loading = false;

  }

}



async function loadOrders() {

  const params = new URLSearchParams({

    status: state.filter,

    q: state.query,

    limit: "120",

  });

  const data = await adminApi(`/api/admin/orders?${params}`);

  state.orders = data.orders;

  state.ordersTotal = data.total;

}



async function loadCatalog({ force = false } = {}) {

  if (state.catalog && !force) return state.catalog;

  const response = await fetch("/api/catalog");

  if (!response.ok) throw new Error("No pudimos cargar el catálogo.");

  state.catalog = await response.json();

  return state.catalog;

}



async function loadLogistics() {

  state.logistics = await adminApi("/api/admin/logistics");

  return state.logistics;

}



async function reload({ spin = false } = {}) {

  const button = document.querySelector("#refresh");

  if (spin) button?.classList.add("is-spinning");

  try {

    await loadOverview({ silent: true });

    if (state.view === "pedidos") await loadOrders();

    if (state.view === "logistica") await loadLogistics();

    if (state.view === "productos") await loadCatalog({ force: true });

    render();

  } catch (error) {

    toast(error.message, { error: true });

  } finally {

    button?.classList.remove("is-spinning");

  }

}



async function exportCsv() {

  try {

    const response = await fetch("/api/admin/export.csv", { headers: authHeaders() });

    if (!response.ok) throw new Error("No pudimos exportar los pedidos.");

    const blob = await response.blob();

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = "la-joaquina-pedidos.csv";

    link.click();

    URL.revokeObjectURL(url);

    toast("CSV exportado");

  } catch (error) {

    toast(error.message, { error: true });

  }

}



function updateNav() {

  const statuses = state.overview?.metrics?.statuses || {};

  const open = OPEN_STATUSES.reduce((acc, status) => acc + (statuses[status] || 0), 0);

  const node = document.querySelector("#nav-orders");

  if (node) node.textContent = String(open);

  const logisticsNode = document.querySelector("#nav-logistics");

  if (logisticsNode) logisticsNode.textContent = String(statuses.paid || 0);

}



/* ── Navegación ──────────────────────────────────────────────── */



async function switchView(view) {

  if (!VIEW_META[view]) return;

  state.view = view;

  document.querySelectorAll("[data-view]").forEach((button) => {

    button.classList.toggle("is-active", button.dataset.view === view);

  });

  document.querySelector("#view-eyebrow").textContent = VIEW_META[view].eyebrow;

  document.querySelector("#view-title").textContent = VIEW_META[view].title;

  document.querySelector("#range-control").hidden = !["resumen", "productos", "marketing"].includes(view);

  document.querySelector("#export").hidden = view !== "pedidos";

  render();

  if (view === "pedidos") {

    try {

      await loadOrders();

      render();

    } catch (error) {

      toast(error.message, { error: true });

    }

  }

  if (view === "productos") {

    try {

      await loadCatalog({ force: true });

      render();

    } catch (error) {

      toast(error.message, { error: true });

    }

  }

  if (view === "logistica") {

    try {

      await loadLogistics();

      render();

    } catch (error) {

      toast(error.message, { error: true });

    }

  }

}



function render() {

  if (!state.overview) return;

  const meta = VIEW_META[state.view];

  document.querySelector("#view-eyebrow").textContent = meta.eyebrow;

  document.querySelector("#view-title").textContent = meta.title;

  document.querySelector("#range-control").hidden = !["resumen", "productos", "marketing"].includes(state.view);

  document.querySelector("#export").hidden = state.view !== "pedidos";



  const views = {

    resumen: viewResumen,

    pedidos: viewPedidos,

    logistica: viewLogistica,

    productos: viewProductos,

    automatizacion: viewAutomatizacion,

    marketing: viewMarketing,

    ajustes: viewAjustes,

  };

  root.innerHTML = views[state.view]();

  bindView();

}



/* ── Resumen ─────────────────────────────────────────────────── */



function viewResumen() {

  const m = state.overview.metrics;

  const k = m.kpis;



  return `

    <div class="kpi-grid">

      ${kpi("Ingresos", ars(k.revenue), delta(k.deltas.revenue, "vs. período anterior"), { accent: true })}

      ${kpi("Pedidos pagos", nf(k.orders), delta(k.deltas.orders, "vs. período anterior"))}

      ${kpi("Ticket promedio", ars(k.aov), delta(k.deltas.aov, "vs. período anterior"))}

      ${kpi("ROAS", `${k.roas.toFixed(2)}×`, delta(k.deltas.roas, "retorno por peso invertido"))}

    </div>



    <div class="admin-grid admin-grid--2">

      <section class="admin-card">

        <div class="admin-card__head">

          <div>

            <h2>Ingresos vs. inversión publicitaria</h2>

            <span>${rangeLabel(m.range)}</span>

          </div>

          <span>ARS</span>

        </div>

        <div class="chart-total"><strong>${ars(k.revenue)}</strong><span>en ${m.range.days} días</span></div>

        ${revenueChart(m.daily)}

        <div class="chart-legend">

          <span><i style="background:var(--ink)"></i> Ingresos</span>

          <span><i style="background:var(--clay)"></i> Inversión en ads</span>

          <span><i class="dot" style="background:var(--lime-2)"></i> ${ars(k.adSpend)} invertidos</span>

        </div>

      </section>



      <section class="admin-card">

        <div class="admin-card__head">

          <h2>Funnel de compra</h2>

          <span>${nf(k.sessions)} sesiones</span>

        </div>

        ${funnel(m.funnel)}

        <p class="admin-card__note">Conversión global ${k.cvr}%. El cuello de botella histórico está entre producto y carrito: ahí se concentra el trabajo de oferta y prueba social.</p>

      </section>

    </div>



    <div class="admin-grid admin-grid--half">

      <section class="admin-card">

        <div class="admin-card__head">

          <h2>Canales</h2>

          <a href="#" data-goto="marketing">Ver detalle</a>

        </div>

        ${channelsTable(m.channels, { compact: true })}

      </section>



      <section class="admin-card">

        <div class="admin-card__head">

          <h2>Productos que sostienen la venta</h2>

          <span>${nf(k.units)} unidades</span>

        </div>

        ${productsTable(m.products.slice(0, 5))}

      </section>

    </div>



    <section class="admin-card">

      <div class="admin-card__head">

        <h2>Últimos pedidos</h2>

        <a href="#" data-goto="pedidos">Ver todos</a>

      </div>

      ${ordersTable(state.overview.orders.slice(0, 8))}

    </section>`;

}



/* ── Pedidos ─────────────────────────────────────────────────── */



function viewPedidos() {

  const filters = [

    ["all", "Todos"],

    ["open", "Abiertos"],

    ["paid", "Pagados"],

    ["shipped", "Enviados"],

    ["delivered", "Entregados"],

    ["cancelled", "Cancelados"],

    ["refunded", "Reembolsados"],

  ];



  return `

    <div class="admin-toolbar">

      <div class="admin-filters" role="group" aria-label="Filtrar pedidos">

        ${filters

          .map(

            ([id, label]) =>

              `<button class="admin-filter ${state.filter === id ? "is-active" : ""}" data-filter="${id}">${label}</button>`,

          )

          .join("")}

      </div>

      <label class="admin-search">

        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>

        <input type="search" id="order-search" placeholder="Buscar pedido, nombre o email" value="${escapeHtml(state.query)}" aria-label="Buscar pedidos">

      </label>

      <span class="admin-count">${state.ordersTotal} resultados</span>

    </div>



    <section class="admin-card">

      ${state.orders.length ? ordersTable(state.orders) : `<p class="admin-card__note">No hay pedidos con esos filtros.</p>`}

    </section>`;

}



function ordersTable(orders) {

  if (!orders.length) return `<p class="admin-card__note">Todavía no hay pedidos.</p>`;

  return `

    <div class="admin-table-wrap">

      <table class="admin-table">

        <thead>

          <tr>

            <th>Pedido</th>

            <th>Cliente</th>

            <th>Fecha</th>

            <th class="num">Total</th>

            <th>Pago</th>

            <th>Canal</th>

            <th>Estado</th>

          </tr>

        </thead>

        <tbody>

          ${orders

            .map(

              (order) => `

            <tr class="is-clickable" data-order="${escapeHtml(order.id)}" tabindex="0">

              <td class="mono strong">${escapeHtml(order.id)}</td>

              <td>

                <div class="admin-table__customer">

                  ${escapeHtml(order.customer.name)}

                  <span>${escapeHtml(order.customer.email)}</span>

                </div>

              </td>

              <td class="muted">${escapeHtml(shortDate(order.createdAt))}</td>

              <td class="num strong">${money(order.totals.total, order.currency)}</td>

              <td class="muted">${escapeHtml(methodLabel(order.payment.method))}</td>

              <td class="muted">${escapeHtml(channelLabel(order.channel))}</td>

              <td>${statusBadge(order.status)}</td>

            </tr>`,

            )

            .join("")}

        </tbody>

      </table>

    </div>`;

}



/* ── Productos ───────────────────────────────────────────────── */



function viewLogistica() {

  const data = state.logistics;

  if (!data) return `<div class="admin-loading">Cargando logística…</div>`;



  const summary = data.summary || {};

  const queues = data.queues || {};

  const toShip = queues.toShip || [];

  const inTransit = queues.inTransit || [];

  const pendingPayments = queues.pendingPayments || [];

  const critical = [...(data.outOfStock || []), ...(data.lowStock || [])];

  const inventory = data.inventory || [];

  const productName = new Map(inventory.map((item) => [item.id, item.name]));



  return `

    <div class="kpi-grid">

      ${kpi("Para despachar", String(summary.toShip || 0), "pedidos pagados sin envío", { accent: true })}

      ${kpi("En camino", String(summary.inTransit || 0), "con seguimiento activo")}

      ${kpi("Stock crítico", String(critical.length), `${summary.out || 0} agotados · ${summary.low || 0} bajos`)}

      ${kpi("Pagos a confirmar", String(summary.pendingPayments || 0), "transferencias o revisión")}

    </div>



    <div class="admin-grid admin-grid--2">

      <section class="admin-card">

      <div class="admin-card__head">

        <div><h2>Para despachar</h2><span>Más antiguos primero · ${summary.toShip || 0} en cola</span></div>

        <a href="#" data-orders-filter="paid">Ver todos →</a>

        </div>

        ${logisticsOrdersTable(toShip, { empty: "No hay pedidos pagados esperando despacho." })}

      </section>



      <section class="admin-card">

        <div class="admin-card__head">

          <div><h2>En camino</h2><span>Seguimiento que ya ve el cliente</span></div>

          <a href="#" data-orders-filter="shipped">Ver todos →</a>

        </div>

        ${logisticsOrdersTable(inTransit, { empty: "No hay envíos en tránsito.", tracking: true })}

      </section>

    </div>



    <div class="admin-grid admin-grid--half">

      <section class="admin-card">

        <div class="admin-card__head">

          <div><h2>Reposición</h2><span>Stock bajo o agotado</span></div>

          <a href="#" data-goto="productos">Editar catálogo</a>

        </div>

        ${critical.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Producto</th><th class="num">Stock</th><th>Ajustar</th></tr></thead><tbody>${critical.map((item) => `<tr><td><div class="admin-table__product"><img src="${item.image}" alt="" loading="lazy"><div>${escapeHtml(item.name)}<small>${item.stock <= 0 ? "Agotado" : `Umbral ${item.lowStockThreshold}`}</small></div></div></td><td class="num ${item.stock <= 0 ? "stock-out" : "stock-low"}">${item.stock}</td><td>${stockEditor(item)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="admin-card__note">Todo el catálogo está por encima del umbral de reposición.</p>`}

      </section>



      <section class="admin-card">

        <div class="admin-card__head">

          <div><h2>Pagos a confirmar</h2><span>Más antiguos primero · ${summary.pendingPayments || 0} en total</span></div>

          <a href="#" data-orders-filter="open">Ver todos →</a>

        </div>

        ${logisticsOrdersTable(pendingPayments, { empty: "No hay pagos esperando confirmación." })}

      </section>

    </div>



    <section class="admin-card">

      <div class="admin-card__head">

        <div><h2>Movimientos de stock</h2><span>Ventas, ajustes y reembolsos</span></div>

        <span>Últimos 30</span>

      </div>

      ${

        data.movements?.length

          ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Cuándo</th><th>Producto</th><th class="num">Cambio</th><th class="num">Quedó</th><th>Motivo</th></tr></thead><tbody>${data.movements.map((movement) => `<tr><td class="muted">${escapeHtml(shortDate(movement.at))}</td><td>${escapeHtml(productName.get(movement.productId) || movement.productId)}</td><td class="num ${movement.delta < 0 ? "stock-out" : "stock-in"}">${movement.delta > 0 ? "+" : ""}${movement.delta}</td><td class="num">${movement.stock}</td><td class="muted">${escapeHtml(movement.reason)}</td></tr>`).join("")}</tbody></table></div>`

          : `<p class="admin-card__note">Todavía no hay movimientos de stock.</p>`

      }

      <p class="admin-card__note">El stock se descuenta al confirmar el pago. Un pedido pendiente no reserva unidades; confirmá el pago solo si tenés stock disponible.</p>

    </section>`;

}



function logisticsOrdersTable(orders, { empty = "Sin pedidos.", tracking = false } = {}) {

  if (!orders.length) return `<p class="admin-card__note">${escapeHtml(empty)}</p>`;

  return `

    <div class="admin-table-wrap">

      <table class="admin-table">

        <thead><tr><th>Pedido</th><th>Cliente</th><th>${tracking ? "Seguimiento" : "Fecha"}</th><th>Estado</th><th></th></tr></thead>

        <tbody>

          ${orders.map((order) => `

            <tr class="is-clickable" data-order="${escapeHtml(order.id)}" tabindex="0">

              <td class="mono strong">${escapeHtml(order.id)}</td>

              <td><div class="admin-table__customer">${escapeHtml(order.customer.name)}<span>${escapeHtml(order.customer.city || order.customer.country)}</span></div></td>

              <td class="muted">${tracking ? `${escapeHtml(order.fulfillment?.carrier || "—")}<br><span class="mono">${escapeHtml(order.fulfillment?.tracking || "—")}</span>` : `<div class="logistics-age"><strong>${escapeHtml(shortDate(order.paidAt || order.createdAt))}</strong><span>${escapeHtml(relativeAge(order.paidAt || order.createdAt))}</span></div>`}</td>

              <td>${statusBadge(order.status)}</td>

              <td class="muted">Abrir →</td>

            </tr>`).join("")}

        </tbody>

      </table>

    </div>`;

}



function stockEditor(item) {

  return `<div class="stock-editor"><input type="number" min="0" max="9999" step="1" value="${Number(item.stock) || 0}" data-stock-input="${escapeHtml(item.id)}" aria-label="Stock de ${escapeHtml(item.name)}"><button class="admin-btn" type="button" data-stock-save="${escapeHtml(item.id)}">Guardar</button></div>`;

}




async function loadProducts({ silent = false } = {}) {
  try {
    const data = await adminApi('/api/admin/products');
    state.adminProducts = data;
  } catch (error) {
    if (!silent) toast(error.message, { error: true });
  }
}

function viewProductos() {
  const data = state.adminProducts;
  if (!data) {
    loadProducts().then(() => render());
    return `<div class="admin-loading">Cargando productos y stock…</div>`;
  }

  const products = data.products || [];
  const q = String(state.productQuery || '').toLowerCase().trim();
  const cat = state.productCategory || 'all';
  const filtered = products.filter((p) => {
    if (cat !== 'all' && p.category !== cat) return false;
    if (!q) return true;
    return [p.id, p.name, p.subtitle, p.short, p.supplierSku, p.category].join(' ').toLowerCase().includes(q);
  });

  const summary = data.summary || { total: products.length, out: 0, low: 0 };
  const totalValue = products.reduce((sum, p) => sum + (Number(p.priceArs || 0) * Number(p.inventory?.stock || 0)), 0);
  const published = products.filter((p) => p.published !== false).length;
  const categories = data.categories || [];

  const catOptions = ['<option value="all">Todas las categorías</option>']
    .concat((categories || []).filter(c => c.id !== 'todos').map(c => `<option value="${escapeHtml(c.id)}" ${cat===c.id?'selected':''}>${escapeHtml(c.label)}</option>`))
    .join('');

  const rows = filtered.map((p) => {
    const inv = p.inventory || {};
    const stock = Number(inv.stock || 0);
    const sales = p.sales;
    const status = stock <= 0 ? '<span class="badge badge--cancelled">Sin stock</span>' : stock <= (Number(inv.lowStockThreshold || 5)) ? '<span class="badge badge--payment_review">Stock bajo</span>' : '<span class="badge badge--paid">Activo</span>';
    const margin = (p.priceArs && p.costArs) ? Math.round((1 - (Number(p.costArs) / Number(p.priceArs))) * 100) : null;
    return `
      <tr>
        <td>
          <div class="admin-table__product">
            <img src="${escapeHtml(p.image || '')}" alt="" loading="lazy" style="width:44px;height:44px;object-fit:cover;border-radius:8px;background:#f3f0e7">
            <div>
              <strong>${escapeHtml(p.name || '')}</strong>
              <small style="display:block;color:var(--muted)">${escapeHtml(p.id)} · ${escapeHtml(p.supplierSku || 'sin SKU')}</small>
              <small style="display:block;color:var(--muted)">${escapeHtml(p.subtitle || '')}</small>
            </div>
          </div>
        </td>
        <td class="muted">${escapeHtml(categoryLabel ? categoryLabel(p.category) : (p.category || ''))}</td>
        <td class="num">${money(p.priceArs || 0, 'ARS')}<br><small style="color:var(--muted)">Tarjeta ${p.cardPriceArs ? money(p.cardPriceArs, 'ARS') : '—'}</small></td>
        <td class="num">${p.costArs ? money(p.costArs, 'ARS') : '—'}<br><small style="color:var(--muted)">${margin != null ? margin + '% margen' : ''}</small></td>
        <td class="num">${nf(sales?.units || 0)}<br><small style="color:var(--muted)">${sales ? ars(sales.revenue || 0) : '—'}</small></td>
        <td>${stockEditor({id:p.id, name:p.name, stock})}<small style="display:block;color:var(--muted);margin-top:4px">Umbral bajo: ${Number(inv.lowStockThreshold || 5)}</small></td>
        <td>${status}<br><small style="color:var(--muted)">${p.published === false ? 'No publicado' : 'Publicado'}</small></td>
        <td style="text-align:right;white-space:nowrap">
          <button class="admin-btn admin-btn--primary" data-edit-product="${escapeHtml(p.id)}" style="font-size:11px;padding:7px 12px">Editar</button>
          <button class="admin-btn" data-delete-product="${escapeHtml(p.id)}" data-delete-name="${escapeHtml(p.name || p.id)}" data-delete-custom="${p.isCustom ? '1' : '0'}" style="font-size:11px;padding:7px 12px;color:#7f2d20;border-color:rgba(127,45,32,0.25)">Eliminar</button>
        </td>
      </tr>`;
  }).join('');

  const editing = state.editingProductId;
  const editorProduct = editing === '__new__' ? { __new: true } : products.find(p => p.id === editing);
  const editor = editing ? renderProductEditor(editorProduct, categories) : '';

  return `
    <div class="kpi-grid">
      ${kpi("Productos", String(products.length), `${published} publicados`, { accent: true })}
      ${kpi("Stock total valorizado", ars(totalValue), "precio venta × stock")}
      ${kpi("Stock bajo", String(summary.low || 0), "requieren reposición")}
      ${kpi("Agotados", String(summary.out || 0), "sin unidades")}
    </div>

    <section class="admin-card">
      <div class="admin-card__head">
        <div><h2>Publicación y gestión de productos</h2><span>Items, fotos, información comercial y stock para la venta</span></div>
        <div class="admin-actions" style="margin:0"><button class="admin-btn" id="refresh-products">Actualizar</button><button class="admin-btn admin-btn--primary" id="new-product">Nuevo producto</button></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 220px;gap:10px;margin-bottom:14px">
        <input class="admin-input" id="products-search" type="search" placeholder="Buscar por nombre, SKU, categoría o descripción…" value="${escapeHtml(state.productQuery || '')}">
        <select class="admin-select" id="products-category">${catOptions}</select>
      </div>
      <p class="admin-card__note" style="margin-bottom:12px">Editá precio, tarjeta, costo, descripción, categoría, badge, SKU, envío, colores, beneficios, especificaciones y fotos desde <strong>Editar</strong>. El stock se descuenta al confirmar pagos y se ajusta rápido en la tabla.</p>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Costo / Margen</th><th class="num">Ventas</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${rows || `<tr><td colspan="8" class="muted">No hay productos para los filtros actuales.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    ${editor}
  `;
}

function renderProductEditor(product, categories = []) {
  const isNew = !product || product.__new || state.editingProductId === '__new__';
  const p = (product && !product.__new) ? product : { id: '', name: '', subtitle: '', short: '', category: 'hogar', priceArs: 0, cardPriceArs: '', compareAtArs: 0, costArs: '', badge: '', image: '', gallery: [], colors: [], benefits: [], specs: {}, shippingDays: '5 a 9 días hábiles', supplierSku: '', published: true };
  const catOptions = (categories || []).filter(c=>c.id!=='todos').map(c => `<option value="${escapeHtml(c.id)}" ${p.category===c.id?'selected':''}>${escapeHtml(c.label)}</option>`).join('');
  const gallery = (Array.isArray(p.gallery) && p.gallery.length ? p.gallery : (p.image ? [p.image] : [])).join('\n');
  const colors = (Array.isArray(p.colors) ? p.colors : []).join(', ');
  const benefits = (Array.isArray(p.benefits) ? p.benefits : []).join('\n');
  const specs = p.specs && typeof p.specs === 'object' ? Object.entries(p.specs).map(([k,v]) => `${k}: ${v}`).join('\n') : '';
  return `
  <section class="admin-card" id="product-editor" style="margin-top:18px;border:1px solid var(--line)">
    <div class="admin-card__head">
      <div><h2>${isNew ? 'Nuevo producto' : 'Editar producto'}</h2><span>${isNew ? 'Ficha completa de publicación y venta' : escapeHtml(p.name || p.id)}</span></div>
      <button class="admin-btn" id="close-product-editor">Cerrar</button>
    </div>
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:start">
      <div style="display:grid;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label>Nombre<input class="admin-input" id="pe-name" value="${escapeHtml(p.name||'')}"></label>
          <label>ID / slug<input class="admin-input" id="pe-id" value="${escapeHtml(p.id||'')}" ${isNew?'':'disabled'} placeholder="auto si se deja vacío"></label>
        </div>
        <label>Subtítulo<input class="admin-input" id="pe-subtitle" value="${escapeHtml(p.subtitle||'')}"></label>
        <label>Descripción corta<textarea class="admin-input" id="pe-short" rows="3">${escapeHtml(p.short||'')}</textarea></label>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          <label>Precio (ARS)<input class="admin-input" id="pe-price" type="number" min="0" value="${Number(p.priceArs||0)}"></label>
          <label>Precio tarjeta<input class="admin-input" id="pe-card" type="number" min="0" value="${p.cardPriceArs ?? ''}" placeholder="opcional"></label>
          <label>Costo (ARS)<input class="admin-input" id="pe-cost" type="number" min="0" value="${p.costArs ?? ''}" placeholder="COGS"></label>
          <label>Antes (tachado)<input class="admin-input" id="pe-compare" type="number" min="0" value="${Number(p.compareAtArs||0)}"></label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <label>Categoría<select class="admin-select" id="pe-category">${catOptions}</select></label>
          <label>Badge<input class="admin-input" id="pe-badge" value="${escapeHtml(p.badge||'')}" placeholder="Oferta, Nuevo…"></label>
          <label>SKU proveedor<input class="admin-input" id="pe-sku" value="${escapeHtml(p.supplierSku||'')}"></label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label>Envío<input class="admin-input" id="pe-shipping" value="${escapeHtml(p.shippingDays||'5 a 9 días hábiles')}"></label>
          <label>Colores (separados por coma)<input class="admin-input" id="pe-colors" value="${escapeHtml(colors)}"></label>
        </div>
        <label>Beneficios (uno por línea)<textarea class="admin-input" id="pe-benefits" rows="4">${escapeHtml(benefits)}</textarea></label>
        <label>Especificaciones (formato "Clave: Valor" por línea)<textarea class="admin-input" id="pe-specs" rows="4">${escapeHtml(specs)}</textarea></label>
      </div>
      <div style="display:grid;gap:12px">
        <div>
          <label>Imagen principal (URL)</label>
          <input class="admin-input" id="pe-image" value="${escapeHtml(p.image||'')}" placeholder="/assets/products/... o URL">
          <div style="margin-top:8px;display:flex;gap:10px;align-items:center">
            <img id="pe-image-preview" src="${escapeHtml(p.image||'')}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:12px;background:#f3f0e7;border:1px solid var(--line)">
            <div>
              <input type="file" id="pe-image-file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" style="font-size:12px">
              <button class="admin-btn" id="pe-upload-main" type="button" style="margin-top:6px">Subir imagen principal</button>
            </div>
          </div>
        </div>
        <label>Galería (una URL por línea)<textarea class="admin-input" id="pe-gallery" rows="5">${escapeHtml(gallery)}</textarea></label>
        <div>
          <input type="file" id="pe-gallery-file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple style="font-size:12px">
          <button class="admin-btn" id="pe-upload-gallery" type="button" style="margin-top:6px">Subir fotos a la galería</button>
          <p class="admin-card__note" style="margin-top:6px">Las fotos subidas se guardan en <code>/public/assets/products/uploads/</code>. También podés pegar URLs externas.</p>
        </div>
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="pe-published" ${p.published === false ? '' : 'checked'}> Producto publicado/visible</label>
        <div class="admin-actions">
          <button class="admin-btn admin-btn--primary" id="pe-save">${isNew ? 'Crear producto' : 'Guardar cambios'}</button>
        </div>
        <p class="admin-card__note">Campos de venta incluidos: nombre, precios (venta/tarjeta/costo/tachado), categoría, badge, SKU, descripción, colores, beneficios, especificaciones, envío, imagen principal y galería. El stock se ajusta desde la tabla.</p>
      </div>
    </div>
  </section>`;
}

function bindProductos() {
  document.querySelector('#refresh-products')?.addEventListener('click', async () => {
    state.adminProducts = null; state.editingProductId = null; await loadProducts(); render();
  });
  document.querySelector('#new-product')?.addEventListener('click', () => {
    state.editingProductId = '__new__'; render();
    setTimeout(() => document.querySelector('#product-editor')?.scrollIntoView({ behavior: 'smooth' }), 50);
  });
  document.querySelector('#products-search')?.addEventListener('input', (e) => { state.productQuery = e.target.value || ''; render(); const el=document.querySelector('#products-search'); if(el){el.focus(); el.setSelectionRange(el.value.length, el.value.length);} });
  document.querySelector('#products-category')?.addEventListener('change', (e) => { state.productCategory = e.target.value || 'all'; render(); });
  document.querySelectorAll('[data-edit-product]').forEach((btn) => btn.addEventListener('click', () => {
    state.editingProductId = btn.dataset.editProduct; render();
    setTimeout(() => document.querySelector('#product-editor')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }));
  document.querySelectorAll('[data-delete-product]').forEach((btn) => btn.addEventListener('click', async () => {
    const id = btn.dataset.deleteProduct;
    const name = btn.dataset.deleteName || id;
    const isCustom = btn.dataset.deleteCustom === '1';
    const msg = isCustom
      ? `¿Eliminar "${name}"? Esta acción borra el producto personalizado del inventario.`
      : `¿Ocultar "${name}" de la tienda? Es un producto base del catálogo: se despublicará (podés volver a publicarlo editándolo).`;
    if (!window.confirm(msg)) return;
    btn.disabled = true;
    try {
      const res = await adminApi('/api/admin/products/' + encodeURIComponent(id), { method: 'DELETE' });
      toast(res.deleted ? 'Producto eliminado.' : 'Producto ocultado de la tienda.');
      state.adminProducts = null;
      await loadProducts();
      await loadOverview({ silent: true });
      render();
    } catch (e) {
      toast(e.message, { error: true });
      btn.disabled = false;
    }
  }));
  document.querySelector('#close-product-editor')?.addEventListener('click', () => { state.editingProductId = null; render(); });
  document.querySelectorAll('[data-stock-save]').forEach((btn) => btn.addEventListener('click', () => saveStock(btn)));

  const isEditing = !!state.editingProductId;
  if (!isEditing) return;
  const editingNew = state.editingProductId === '__new__';

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No se pudo leer la imagen'));
    r.readAsDataURL(file);
  });

  async function uploadOne(file, productId) {
    const dataUrl = await readFileAsDataUrl(file);
    const res = await adminApi('/api/admin/products/upload-image', { method: 'POST', body: JSON.stringify({ dataUrl, filename: file.name, productId: productId || 'product' }) });
    return res.url || res.path;
  }

  document.querySelector('#pe-upload-main')?.addEventListener('click', async () => {
    const file = document.querySelector('#pe-image-file')?.files?.[0];
    if (!file) return toast('Seleccioná una imagen primero.', { error: true });
    const btn = document.querySelector('#pe-upload-main');
    btn.disabled = true; btn.textContent = 'Subiendo…';
    try {
      const url = await uploadOne(file, document.querySelector('#pe-id')?.value || 'product');
      document.querySelector('#pe-image').value = url;
      const prev = document.querySelector('#pe-image-preview'); if (prev) prev.src = url;
      toast('Imagen principal subida.');
    } catch (e) { toast(e.message, { error: true }); }
    finally { btn.disabled = false; btn.textContent = 'Subir imagen principal'; }
  });

  document.querySelector('#pe-upload-gallery')?.addEventListener('click', async () => {
    const files = Array.from(document.querySelector('#pe-gallery-file')?.files || []);
    if (!files.length) return toast('Seleccioná una o más imágenes.', { error: true });
    const btn = document.querySelector('#pe-upload-gallery');
    btn.disabled = true; btn.textContent = 'Subiendo…';
    try {
      const pid = document.querySelector('#pe-id')?.value || 'product';
      const urls = [];
      for (const f of files) urls.push(await uploadOne(f, pid));
      const ta = document.querySelector('#pe-gallery');
      const existing = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
      ta.value = existing.concat(urls).join('\n');
      toast(`${urls.length} imagen(es) agregadas a la galería.`);
    } catch (e) { toast(e.message, { error: true }); }
    finally { btn.disabled = false; btn.textContent = 'Subir fotos a la galería'; }
  });

  document.querySelector('#pe-save')?.addEventListener('click', async () => {
    const btn = document.querySelector('#pe-save');
    const id = (document.querySelector('#pe-id')?.value || '').trim();
    const body = {
      name: document.querySelector('#pe-name')?.value || '',
      subtitle: document.querySelector('#pe-subtitle')?.value || '',
      short: document.querySelector('#pe-short')?.value || '',
      priceArs: Number(document.querySelector('#pe-price')?.value || 0),
      cardPriceArs: document.querySelector('#pe-card')?.value ? Number(document.querySelector('#pe-card').value) : undefined,
      costArs: document.querySelector('#pe-cost')?.value ? Number(document.querySelector('#pe-cost').value) : undefined,
      compareAtArs: Number(document.querySelector('#pe-compare')?.value || 0),
      category: document.querySelector('#pe-category')?.value || 'hogar',
      badge: document.querySelector('#pe-badge')?.value || '',
      supplierSku: document.querySelector('#pe-sku')?.value || '',
      shippingDays: document.querySelector('#pe-shipping')?.value || '',
      colors: (document.querySelector('#pe-colors')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
      benefits: (document.querySelector('#pe-benefits')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
      image: (document.querySelector('#pe-image')?.value || '').trim(),
      gallery: (document.querySelector('#pe-gallery')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
      published: !!document.querySelector('#pe-published')?.checked,
    };
    const specs = {};
    (document.querySelector('#pe-specs')?.value || '').split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) { const k = line.slice(0, idx).trim(); const v = line.slice(idx+1).trim(); if (k && v) specs[k] = v; }
    });
    body.specs = specs;
    if (body.gallery.length && !body.image) body.image = body.gallery[0];
    if (!body.gallery.length && body.image) body.gallery = [body.image];

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (editingNew) {
        if (id) body.id = id;
        await adminApi('/api/admin/products', { method: 'POST', body: JSON.stringify(body) });
        toast('Producto creado.');
      } else {
        await adminApi('/api/admin/products/' + encodeURIComponent(state.editingProductId), { method: 'PUT', body: JSON.stringify(body) });
        toast('Producto actualizado.');
      }
      state.editingProductId = null;
      state.adminProducts = null;
      await loadProducts();
      await loadOverview({ silent: true });
      render();
    } catch (e) {
      toast(e.message, { error: true });
      btn.disabled = false; btn.textContent = editingNew ? 'Crear producto' : 'Guardar cambios';
    }
  });
}



/* ── Automatización ─────────────────────────────────────────── */



function viewAutomatizacion() {
  const flags = state.overview.flags || {};
  const gateways = Object.entries(flags.gateways || {});
  const supplier = flags.supplier || {};
  const queue = supplier.queue || {};
  const providerLabel =
    supplier.provider === "cj" ? "CJ Dropshipping" : supplier.provider === "manual" ? "Manual" : "No configurado";
  const supplierReady = supplier.provider === "cj" ? Boolean(supplier.configured) : supplier.provider === "manual";
  const canSync = supplier.provider === "cj" && supplierReady;
  const fulfillmentCopy =
    supplier.provider === "cj"
      ? `La cola se procesa cada 60 s con reintentos exponenciales. El tracking se sincroniza cada ${supplier.syncMinutes || 15} min y también por webhook firmado.`
      : supplier.provider === "manual"
        ? "El fulfillment se gestiona manualmente desde Pedidos y Logística."
        : "No hay proveedor automático configurado. Podés operar con carga manual.";

  const auto = state.automations || { rules: [], lastResult: null, lastRun: null, running: false };
  const last = auto.lastResult || null;
  const rules = (auto.rules || []).map((r) => `
    <div class="status-row">
      <div>
        <strong style="font-size:11.5px">${escapeHtml(r.name)}</strong>
        <div style="font-size:10px;color:var(--muted)">${escapeHtml(r.description || "")}</div>
      </div>
      <span class="status-chip ${r.active ? "is-on" : "is-demo"}"><i></i>${r.active ? "Activa" : "Inactiva"}</span>
    </div>
  `).join("");

  return `
    <section class="admin-card" style="margin-bottom:18px">
      <div class="admin-card__head">
        <div>
          <h2>Agente de automatizaciones</h2>
          <span>Monitoreo y acciones automáticas sobre pedidos</span>
        </div>
        <span class="status-chip is-on"><i></i>${auto.running ? "Ejecutando" : "Activo"}</span>
      </div>
      <div class="status-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:2px 24px">
        <div class="status-row"><span>Última ejecución</span><strong>${auto.lastRun ? escapeHtml(fullDate(auto.lastRun)) : "—"}</strong></div>
        <div class="status-row"><span>Pedidos escaneados</span><strong>${nf(last?.scanned || 0)}</strong></div>
        <div class="status-row"><span>Recordatorios</span><strong>${nf(last?.reminders || 0)}</strong></div>
        <div class="status-row"><span>Seguimientos efectivo</span><strong>${nf(last?.cashFollowups || 0)}</strong></div>
        <div class="status-row"><span>Cancelaciones automáticas</span><strong>${nf(last?.cancelled || 0)}</strong></div>
        <div class="status-row"><span>Alertas de gestión</span><strong>${nf(last?.alerts || 0)}</strong></div>
      </div>
      <div class="admin-actions">
        <button class="admin-btn admin-btn--primary" id="run-automations">Ejecutar agente ahora</button>
      </div>
      <p class="admin-card__note">El agente corre automáticamente cada 30 minutos y también puede ejecutarse manualmente. Acciones: recordatorios de transferencia, seguimiento de pagos en efectivo, cancelación de pedidos pendientes vencidos y alertas de pedidos pagados sin gestión.</p>
    </section>

    <section class="admin-card" style="margin-bottom:18px">
      <div class="admin-card__head">
        <div>
          <h2>Reglas del agente</h2>
          <span>Automatizaciones activas</span>
        </div>
      </div>
      <div class="status-list">
        ${rules || `<p class="admin-card__note">No hay reglas cargadas.</p>`}
      </div>
    </section>

    ${renderBackupsCard()}

    <section class="admin-card" style="margin-bottom:18px">
      <div class="admin-card__head">
        <div>
          <h2>Proveedor de dropshipping</h2>
          <span>Alta, pago y tracking automáticos</span>
        </div>
        <span class="status-chip ${supplierReady ? "is-on" : ""}"><i></i>${supplierReady ? escapeHtml(providerLabel) : "Sin configurar"}</span>
      </div>
      <div class="status-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:2px 24px">
        <div class="status-row"><span>Proveedor</span><strong>${escapeHtml(providerLabel)}</strong></div>
        <div class="status-row"><span>Modo</span><strong>${escapeHtml(supplier.mode || supplier.provider || "manual")}</strong></div>
        <div class="status-row"><span>Pago automático</span><strong>${supplier.autoPay ? "Sí · saldo CJ" : supplier.provider === "cj" ? "No · pagar en CJ" : "—"}</strong></div>
        <div class="status-row"><span>Webhook</span><strong>${supplier.provider === "cj" ? (supplier.webhookReady ? "Verificado" : "Falta CJ_OPEN_ID") : "—"}</strong></div>
        <div class="status-row"><span>Cola</span><strong>${nf(queue.queued || 0)} en cola · ${nf(queue.retry || 0)} reintentos</strong></div>
        <div class="status-row"><span>Errores</span><strong>${nf(queue.failed || 0)}</strong></div>
        <div class="status-row"><span>Última sync</span><strong>${supplier.lastSyncAt ? escapeHtml(fullDate(supplier.lastSyncAt)) : "—"}</strong></div>
      </div>
      ${queue.failed ? `<p class="form-msg is-error" style="margin-top:10px">Hay ${nf(queue.failed)} pedido(s) con error de proveedor. Abrilos en Pedidos y usá “Reintentar”.</p>` : ""}
      ${supplier.provider === "cj" && !supplier.configured ? `<p class="form-msg is-error" style="margin-top:10px">Falta <code>CJ_API_KEY</code> para habilitar el proveedor CJ.</p>` : ""}
      <div class="admin-actions">
        <button class="admin-btn" id="retry-queue">Procesar cola</button>
        <button class="admin-btn admin-btn--primary" id="sync-supplier" ${canSync ? "" : "disabled"}>Sincronizar tracking</button>
      </div>
      <p class="admin-card__note">Webhook de proveedor: <code>${escapeHtml(supplier.callbackUrl || "—")}</code> · ${escapeHtml(fulfillmentCopy)}</p>
    </section>

    <div class="admin-grid admin-grid--half">
      <section class="admin-card">
        <div class="admin-card__head">
          <h2>Pasarelas conectadas</h2>
          <span>${escapeHtml(flags.env || "producción")}</span>
        </div>
        <div class="status-list">
          ${gateways
            .map(
              ([id]) => `
            <div class="status-row">
              <span>${escapeHtml(methodLabel(id))}</span>
              <span class="status-chip is-on"><i></i>Activo</span>
            </div>`,
            )
            .join("") || `<p class="admin-card__note">Sin pasarelas configuradas.</p>`}
        </div>
        <p class="admin-card__note">Medios activos: MercadoPago, transferencia bancaria y efectivo. Los webhooks validan firma e idempotencia.</p>
      </section>

      <section class="admin-card">
        <div class="admin-card__head">
          <h2>Infraestructura</h2>
          <span>${escapeHtml(flags.env || "—")}</span>
        </div>
        <div class="status-list">
          <div class="status-row"><span>Emails transaccionales</span><span class="status-chip ${flags.emailProvider === "resend" ? "is-on" : ""}"><i></i>${escapeHtml(flags.emailProvider || "log")}</span></div>
          <div class="status-row"><span>Banco · alias</span><strong style="font-family:var(--mono);font-size:10.5px">${escapeHtml(flags.bank?.alias || "—")}</strong></div>
          <div class="status-row"><span>Banco · titular</span><strong style="font-size:10.5px">${escapeHtml(flags.bank?.holder || "—")}</strong></div>
          <div class="status-row"><span>Leads capturados</span><strong>${nf(state.overview.leads || 0)}</strong></div>
          <div class="status-row"><span>Solicitudes de devolución</span><strong>${nf(state.overview.returns || 0)}</strong></div>
        </div>
        <p class="admin-card__note">${escapeHtml(fulfillmentCopy)}</p>
      </section>
    </div>

    <div class="admin-grid admin-grid--2">
      <section class="admin-card">
        <div class="admin-card__head">
          <h2>Flujo automático de un pedido</h2>
          <span>Sin intervención manual</span>
        </div>
        <div class="flow">
          ${[
            ["01", "Checkout y cotización", "Precio, cupón, envío y moneda se calculan en el servidor. El cliente no puede alterar totales."],
            ["02", "Pago", "MercadoPago, transferencia bancaria o efectivo coordinado por WhatsApp."],
            ["03", "Webhook firmado", "MercadoPago notifica con firma. El evento es idempotente: repetirlo no duplica el pedido."],
            ["04", "Aprobación", "Se valida monto y estado. Si no coincide, queda en revisión manual con timeline completo."],
            ["05", "Gestión de fulfillment", "El pedido pasa a preparación y se gestiona según el proveedor configurado."],
            ["06", "Seguimiento y comunicación", "Se envían notificaciones y el cliente puede seguir el estado del pedido."],
          ]
            .map(
              ([num, title, copy]) => `
            <div class="flow__step">
              <span class="flow__num">${num}</span>
              <div class="flow__body"><strong>${title}</strong><span>${copy}</span></div>
            </div>`,
            )
            .join("")}
        </div>
      </section>

      <section class="admin-card">
        <div class="admin-card__head">
          <h2>Métodos de pago activos</h2>
          <span>Argentina</span>
        </div>
        <div class="status-list">
          ${(flags.methods || [])
            .filter((m) => ["mercadopago", "transfer", "cash"].includes(m.id))
            .map(
              (method) => `
            <div class="status-row">
              <div>
                <strong style="font-size:11.5px">${escapeHtml(method.label)}</strong>
                <div style="font-size:10px;color:var(--muted)">${escapeHtml(method.description || "")}</div>
              </div>
              <span class="status-chip is-on"><i></i>Activo</span>
            </div>`,
            )
            .join("")}
        </div>
      </section>
    </div>

    <section class="admin-card">
      <div class="admin-card__head">
        <h2>Log de emails</h2>
        <span>${(state.overview.emails || []).length} recientes</span>
      </div>
      ${
        (state.overview.emails || []).length
          ? `<div class="email-log">
              ${state.overview.emails
                .map(
                  (email) => `
                <div class="email-entry">
                  <div class="email-entry__meta">
                    <strong>${escapeHtml(email.subject || "")}</strong>
                    <span>${escapeHtml(email.to || "")} · ${escapeHtml(email.template || "")} · ${email.at ? escapeHtml(fullDate(email.at)) : ""}</span>
                  </div>
                  <span class="status-chip ${email.status === "sent" ? "is-on" : ""}"><i></i>${escapeHtml(email.status || "log")}</span>
                </div>`,
                )
                .join("")}
            </div>`
          : `<p class="admin-card__note">Todavía no hay emails registrados.</p>`
      }
    </section>`;

}


function viewMarketing() {

  const m = state.overview.metrics;

  const k = m.kpis;

  const dailySpend = Math.round(k.adSpend / Math.max(1, m.range.days));



  return `

    <div class="metric-strip">

      ${kpi("Margen bruto", ars(k.grossProfit), `${k.marginPct}% del ingreso`)}

      ${kpi("Conversión", `${k.cvr}%`, delta(k.deltas.cvr, "puntos porcentuales"))}

      ${kpi("CAC", ars(k.cac), "costo por cliente nuevo", { accent: true })}

      ${kpi("Recompra", `${k.repeatRate}%`, `${nf(k.sessions)} sesiones`)}

    </div>



    <div class="admin-grid admin-grid--2">

      <section class="admin-card">

        <div class="admin-card__head">

          <h2>Inversión y retorno por canal</h2>

          <span>${ars(dailySpend)} / día</span>

        </div>

        ${channelsTable(m.channels)}

        <p class="admin-card__note">Regla de corte: si un canal lleva 7 días con ROAS menor a 2,0 se pausa y se reasigna el presupuesto al canal con mejor CAC marginal.</p>

      </section>



      <section class="admin-card">

        <div class="admin-card__head">

          <h2>Eficiencia del funnel</h2>

          <span>${m.range.days} días</span>

        </div>

        ${funnel(m.funnel)}

        <div class="admin-actions">

          <a class="admin-btn admin-btn--primary" href="/playbook">Abrir playbook</a>

        </div>

      </section>

    </div>



    <div class="admin-grid admin-grid--half">

      <section class="admin-card">

        <div class="admin-card__head">

          <h2>Mix de pagos</h2>

          <span>Pedidos pagos</span>

        </div>

        ${paymentMix(m.payments)}

      </section>



      <section class="admin-card">

        <div class="admin-card__head">

          <h2>Países</h2>

          <span>Ingresos convertidos a ARS</span>

        </div>

        ${countriesTable(m.countries)}

      </section>

    </div>`;

}



/* ── Componentes ─────────────────────────────────────────────── */



function kpi(label, value, foot, { accent = false } = {}) {

  return `

    <div class="kpi ${accent ? "kpi--accent" : ""}">

      <span class="kpi__label">${label}</span>

      <strong class="kpi__value">${value}</strong>

      <div class="kpi__foot">${foot}</div>

    </div>`;

}



function delta(value, label) {

  if (value === null || value === undefined || !Number.isFinite(Number(value))) {

    return `<span>${escapeHtml(label)}</span>`;

  }

  const number = Number(value);

  const positive = number >= 0;

  return `

    <span class="delta ${positive ? "delta--up" : "delta--down"}">${positive ? "↑" : "↓"} ${Math.abs(number).toFixed(1)}${label.includes("puntos") ? " pp" : "%"}</span>

    <span>${escapeHtml(label)}</span>`;

}



function revenueChart(daily) {

  const width = 720;

  const height = 240;

  const pad = { top: 16, right: 10, bottom: 24, left: 10 };

  const innerW = width - pad.left - pad.right;

  const innerH = height - pad.top - pad.bottom;

  const max = Math.max(...daily.map((day) => Math.max(day.revenue, day.adSpend)), 1);

  const x = (index) => pad.left + (daily.length > 1 ? (index * innerW) / (daily.length - 1) : innerW / 2);

  const y = (value) => pad.top + innerH - (value / max) * innerH;



  const revenuePoints = daily.map((day, index) => [x(index), y(day.revenue)]);

  const spendPoints = daily.map((day, index) => [x(index), y(day.adSpend)]);

  const line = (points) =>

    points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");

  const area = `${line(revenuePoints)} L${x(daily.length - 1).toFixed(1)},${height - pad.bottom} L${x(0).toFixed(1)},${height - pad.bottom} Z`;



  const grid = [0.25, 0.5, 0.75, 1].map((fraction) => {

    const lineY = pad.top + innerH - innerH * fraction;

    return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${lineY}" y2="${lineY}" stroke="rgba(11,16,14,.08)" stroke-dasharray="3 5"/>

      <text x="${width - pad.right}" y="${lineY - 5}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="8" fill="#8d978f">${compactArs(max * fraction)}</text>`;

  }).join("");



  const labels = [0, Math.floor(daily.length / 2), daily.length - 1]

    .map((index) => {

      const day = daily[index];

      if (!day) return "";

      return `<text x="${x(index)}" y="${height - 6}" text-anchor="${index === 0 ? "start" : index === daily.length - 1 ? "end" : "middle"}" font-family="IBM Plex Mono, monospace" font-size="8" fill="#8d978f">${escapeHtml(shortDate(day.date))}</text>`;

    })

    .join("");



  const last = daily[daily.length - 1];



  return `

    <div class="chart-wrap">

      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Ingresos diarios versus inversión publicitaria">

        <defs>

          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">

            <stop offset="0%" stop-color="#0b100e" stop-opacity="0.16"/>

            <stop offset="100%" stop-color="#0b100e" stop-opacity="0"/>

          </linearGradient>

        </defs>

        ${grid}

        <path d="${area}" fill="url(#revFill)"/>

        <path d="${line(spendPoints)}" fill="none" stroke="#c99f79" stroke-width="1.4" stroke-dasharray="4 4" stroke-linejoin="round"/>

        <path d="${line(revenuePoints)}" fill="none" stroke="#0b100e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>

        <circle cx="${x(daily.length - 1)}" cy="${y(last.revenue)}" r="3.5" fill="#c9f25a" stroke="#0b100e" stroke-width="1.5"/>

        <circle cx="${x(daily.length - 1)}" cy="${y(last.adSpend)}" r="3" fill="#c99f79" stroke="#fff" stroke-width="1.2"/>

        ${labels}

      </svg>

    </div>`;

}



function funnel(funnelData) {

  const steps = [

    ["Sesiones", funnelData.sessions],

    ["Vieron producto", funnelData.productViews],

    ["Agregaron al carrito", funnelData.addToCart],

    ["Iniciaron checkout", funnelData.beginCheckout],

    ["Compraron", funnelData.purchase],

  ];

  const top = Math.max(steps[0][1], 1);



  return `

    <div class="funnel">

      ${steps

        .map(([label, value], index) => {

          const width = Math.max(2, (value / top) * 100);

          const rate = index === 0 ? 100 : steps[0][1] ? (value / steps[0][1]) * 100 : 0;

          return `

          <div class="funnel__row">

            <div class="funnel__meta">

              <span>${label}</span>

              <span><strong>${nf(value)}</strong> · ${rate.toFixed(rate < 1 ? 1 : 0)}%</span>

            </div>

            <div class="funnel__bar"><div class="funnel__fill" style="width:${width}%"></div></div>

          </div>`;

        })

        .join("")}

    </div>`;

}



function channelsTable(channels, { compact = false } = {}) {

  if (!channels.length) return `<p class="admin-card__note">Sin datos de canales.</p>`;

  return `

    <div class="admin-table-wrap">

      <table class="admin-table">

        <thead>

          <tr>

            <th>Canal</th>

            <th class="num">Sesiones</th>

            <th class="num">Pedidos</th>

            <th class="num">Conv.</th>

            <th class="num">Inversión</th>

            <th class="num">ROAS</th>

            ${compact ? "" : `<th class="num">CAC</th>`}

          </tr>

        </thead>

        <tbody>

          ${channels

            .map(

              (channel) => `

            <tr>

              <td class="strong">${escapeHtml(channelLabel(channel.id))}</td>

              <td class="num muted">${nf(channel.sessions)}</td>

              <td class="num">${nf(channel.orders)}</td>

              <td class="num muted">${channel.conversion === null ? "—" : `${channel.conversion}%`}</td>

              <td class="num muted">${channel.spend ? ars(channel.spend) : "—"}</td>

              <td class="num ${channel.roas && channel.roas >= 2 ? "strong" : ""}">${channel.roas === null ? "—" : `${channel.roas}×`}</td>

              ${compact ? "" : `<td class="num muted">${channel.cac === null ? "—" : ars(channel.cac)}</td>`}

            </tr>`,

            )

            .join("")}

        </tbody>

      </table>

    </div>`;

}



function productsTable(products) {

  if (!products.length) return `<p class="admin-card__note">Sin ventas en el período.</p>`;

  return `

    <div class="admin-table-wrap">

      <table class="admin-table">

        <thead>

          <tr>

            <th>Producto</th>

            <th class="num">Unid.</th>

            <th class="num">Ingresos</th>

            <th class="num">Margen</th>

          </tr>

        </thead>

        <tbody>

          ${products

            .map(

              (product) => `

            <tr>

              <td>

                <div class="admin-table__product">

                  <img src="${product.image}" alt="" loading="lazy">

                  <div>${escapeHtml(product.name)}</div>

                </div>

              </td>

              <td class="num">${nf(product.units)}</td>

              <td class="num">${ars(product.revenue)}</td>

              <td class="num strong">${product.marginPct.toFixed(0)}%</td>

            </tr>`,

            )

            .join("")}

        </tbody>

      </table>

    </div>`;

}



function paymentMix(payments) {

  if (!payments.length) return `<p class="admin-card__note">Sin pagos aprobados.</p>`;

  const total = payments.reduce((acc, payment) => acc + payment.revenue, 0);

  return `

    <div class="funnel">

      ${payments

        .map((payment) => {

          const share = total ? (payment.revenue / total) * 100 : 0;

          return `

          <div class="funnel__row">

            <div class="funnel__meta">

              <span>${escapeHtml(methodLabel(payment.method))} · ${nf(payment.orders)} pedidos</span>

              <span><strong>${share.toFixed(0)}%</strong> · ${ars(payment.revenue)}</span>

            </div>

            <div class="funnel__bar"><div class="funnel__fill" style="width:${Math.max(2, share)}%"></div></div>

          </div>`;

        })

        .join("")}

    </div>`;

}



function countriesTable(countries) {

  if (!countries.length) return `<p class="admin-card__note">Sin datos geográficos.</p>`;

  return `

    <div class="admin-table-wrap">

      <table class="admin-table">

        <thead>

          <tr><th>País</th><th class="num">Pedidos</th><th class="num">Ingresos</th></tr>

        </thead>

        <tbody>

          ${countries

            .map(

              (country) => `

            <tr>

              <td>${escapeHtml(country.country)}</td>

              <td class="num muted">${nf(country.orders)}</td>

              <td class="num">${ars(country.revenue)}</td>

            </tr>`,

            )

            .join("")}

        </tbody>

      </table>

    </div>`;

}



/* ── Ajustes ─────────────────────────────────────────────────── */



function viewAjustes() {

  const settings = state.overview.settings || {};

  const bank = settings.bank || {};

  return `

    <section class="admin-card" style="max-width:900px">

      <div class="admin-card__head">

        <div>

          <h2>Contacto y datos de cobro</h2>

          <span>Se aplican en la tienda, el checkout y los emails</span>

        </div>

        <span class="status-chip is-on"><i></i>Editable</span>

      </div>

      <form id="settings-form" autocomplete="off">

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">

          <div class="field" style="grid-column:1/-1;max-width:380px">

            <label for="set-whatsapp">WhatsApp</label>

            <input class="input" id="set-whatsapp" name="whatsapp" type="tel" value="${escapeHtml(settings.whatsapp || "")}" placeholder="5491126730077" required>

            <span style="font-size:10.5px;color:var(--muted-2)">Con código de país, sin + ni espacios. Ejemplo: 5491126730077.</span>

          </div>

          <div class="field">

            <label for="set-holder">Titular de la cuenta</label>

            <input class="input" id="set-holder" name="holder" value="${escapeHtml(bank.holder || "")}" maxlength="80" required>

          </div>

          <div class="field">

            <label for="set-bank">Banco o billetera</label>

            <input class="input" id="set-bank" name="bank" value="${escapeHtml(bank.name || "")}" maxlength="60" placeholder="Mercado Pago" required>

          </div>

          <div class="field">

            <label for="set-alias">Alias</label>

            <input class="input" id="set-alias" name="alias" value="${escapeHtml(bank.alias || "")}" maxlength="30" placeholder="joaquina.shop.mp" required>

          </div>

          <div class="field">

            <label for="set-cbu">CBU <span style="font-weight:400;color:var(--muted-2)">(opcional)</span></label>

            <input class="input" id="set-cbu" name="cbu" value="${escapeHtml(bank.cbu || "")}" inputmode="numeric" maxlength="22" placeholder="22 dígitos">

          </div>

          <div class="field">

            <label for="set-cuit">CUIT <span style="font-weight:400;color:var(--muted-2)">(opcional)</span></label>

            <input class="input" id="set-cuit" name="cuit" value="${escapeHtml(bank.cuit || "")}" inputmode="numeric" maxlength="13" placeholder="30-12345678-9">

          </div>

        </div>

        <div class="admin-actions">

          <button class="admin-btn admin-btn--primary" type="submit" id="settings-submit">Guardar cambios</button>

        </div>

        <p class="form-msg" id="settings-msg" role="status"></p>

      </form>

      <p class="admin-card__note">El WhatsApp se usa en los enlaces de contacto y en el seguimiento del pedido. Los datos bancarios aparecen en la confirmación de transferencia. Dejá CBU y CUIT vacíos si todavía no los tenés: se ocultan en la tienda hasta que los cargues.</p>

    </section>`;

}



async function saveSettings(event) {

  event.preventDefault();

  const msg = document.querySelector("#settings-msg");

  const button = document.querySelector("#settings-submit");

  msg.className = "form-msg";

  msg.textContent = "";

  button.disabled = true;

  button.textContent = "Guardando…";

  try {

    const { settings } = await adminApi("/api/admin/settings", {

      method: "POST",

      body: JSON.stringify({

        whatsapp: document.querySelector("#set-whatsapp").value,

        bank: {

          holder: document.querySelector("#set-holder").value,

          name: document.querySelector("#set-bank").value,

          alias: document.querySelector("#set-alias").value,

          cbu: document.querySelector("#set-cbu").value,

          cuit: document.querySelector("#set-cuit").value,

        },

      }),

    });

    state.overview.settings = settings;

    state.overview.flags.bank = { alias: settings.bank.alias, holder: settings.bank.holder };

    document.querySelector("#set-whatsapp").value = settings.whatsapp;

    document.querySelector("#set-alias").value = settings.bank.alias;

    document.querySelector("#set-cbu").value = settings.bank.cbu;

    document.querySelector("#set-cuit").value = settings.bank.cuit;

    msg.textContent = "Datos guardados. Ya se ven en la tienda.";

    toast("Datos de la tienda actualizados");

  } catch (error) {

    msg.className = "form-msg is-error";

    msg.textContent = error.message;

  } finally {

    button.disabled = false;

    button.textContent = "Guardar cambios";

  }

}



/* ── Interacciones de vista ──────────────────────────────────── */



function bindView() {

  root.querySelectorAll("[data-order]").forEach((row) => {

    row.addEventListener("click", () => openOrder(row.dataset.order));

    row.addEventListener("keydown", (event) => {

      if (event.key === "Enter" || event.key === " ") {

        event.preventDefault();

        openOrder(row.dataset.order);

      }

    });

  });



  root.querySelector("#settings-form")?.addEventListener("submit", saveSettings);

  root.querySelectorAll("[data-stock-save]").forEach((button) => {

    button.addEventListener("click", () => saveStock(button));

  });



  root.querySelectorAll("[data-goto]").forEach((link) => {

    link.addEventListener("click", (event) => {

      event.preventDefault();

      switchView(link.dataset.goto);

    });

  });



  root.querySelectorAll("[data-orders-filter]").forEach((link) => {

    link.addEventListener("click", async (event) => {

      event.preventDefault();

      state.filter = link.dataset.ordersFilter;

      state.query = "";

      await switchView("pedidos");

    });

  });



  root.querySelectorAll("[data-filter]").forEach((button) => {

    button.addEventListener("click", async () => {

      state.filter = button.dataset.filter;

      await loadOrders();

      render();

    });

  });



  document.querySelector("#retry-queue")?.addEventListener("click", async () => {

    const button = document.querySelector("#retry-queue");

    button.disabled = true;

    button.textContent = "Procesando…";

    try {

      const { result } = await adminApi("/api/admin/fulfillment/queue", {

        method: "POST",

        body: "{}",

      });

      await loadOverview({ silent: true });

      render();

      toast(`Cola procesada: ${result.processed || 0} pedido(s)`);

    } catch (error) {

      toast(error.message, { error: true });

      button.disabled = false;

      button.textContent = "Procesar cola";

    }

  });



  document.querySelector("#sync-supplier")?.addEventListener("click", async () => {

    const button = document.querySelector("#sync-supplier");

    button.disabled = true;

    button.textContent = "Sincronizando…";

    try {

      const { result } = await adminApi("/api/admin/fulfillment/sync", {

        method: "POST",

        body: "{}",

      });

      await loadOverview({ silent: true });

      render();

      toast(`Tracking: ${result.checked || 0} revisados · ${result.updated || 0} actualizados`);

    } catch (error) {

      toast(error.message, { error: true });

      button.disabled = false;

      button.textContent = "Sincronizar tracking";

    }

  });



  document.querySelector("#run-automations")?.addEventListener("click", async () => {
    const button = document.querySelector("#run-automations");
    button.disabled = true;
    button.textContent = "Ejecutando…";
    try {
      const { result } = await adminApi("/api/admin/automations/run", { method: "POST", body: "{}" });
      state.automations = { ...(state.automations || {}), lastRun: result?.finishedAt || new Date().toISOString(), lastResult: result, running: false };
      await loadOverview({ silent: true });
      render();
      toast(`Agente ejecutado: ${result?.scanned || 0} pedidos revisados`);
    } catch (error) {
      toast(error.message, { error: true });
      button.disabled = false;
      button.textContent = "Ejecutar agente ahora";
    }
  });

  document.querySelector("#create-backup")?.addEventListener("click", async () => {
    const button = document.querySelector("#create-backup");
    button.disabled = true;
    button.textContent = "Creando…";
    try {
      const data = await adminApi("/api/admin/backups", { method: "POST", body: JSON.stringify({ reason: "manual-admin" }) });
      state.backups = { status: data.status, backups: data.backups };
      await loadOverview({ silent: true });
      render();
      toast("Backup creado correctamente.");
    } catch (error) {
      toast(error.message, { error: true });
      button.disabled = false;
      button.textContent = "Crear backup ahora";
    }
  });

  document.querySelectorAll("[data-restore-backup]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.restoreBackup;
      if (!name) return;
      if (!confirm(`¿Restaurar el backup "${name}"? Esto reemplazará la base de datos actual (se creará una copia de seguridad previa automáticamente).`)) return;
      btn.disabled = true;
      btn.textContent = "Restaurando…";
      try {
        await adminApi("/api/admin/backups/restore", { method: "POST", body: JSON.stringify({ name }) });
        await loadOverview({ silent: true });
        render();
        toast("Backup restaurado. Recargá si ves datos desactualizados.");
      } catch (error) {
        toast(error.message, { error: true });
        btn.disabled = false;
        btn.textContent = "Restaurar";
      }
    });
  });

}



async function saveStock(button) {

  const id = button.dataset.stockSave;

  const input = root.querySelector(`[data-stock-input="${id}"]`);

  const stock = Number(input?.value);

  if (!Number.isInteger(stock) || stock < 0) {

    toast("El stock debe ser un número entero mayor o igual a 0.", { error: true });

    return;

  }



  button.disabled = true;

  button.textContent = "…";

  try {

    const result = await adminApi(`/api/admin/inventory/${encodeURIComponent(id)}`, {

      method: "PATCH",

      body: JSON.stringify({ stock }),

    });

    const product = state.catalog?.products?.find((item) => item.id === id);

    if (product) product.stock = result.inventory.stock;

    if (state.view === "logistica") await loadLogistics();

    render();

    toast(`Stock de ${result.inventory.name} actualizado a ${result.inventory.stock}`);

  } catch (error) {

    toast(error.message, { error: true });

    button.disabled = false;

    button.textContent = "Guardar";

  }

}



function bindSearch() {

  document.addEventListener("input", (event) => {

    if (event.target.id !== "order-search") return;

    state.query = event.target.value;

    clearTimeout(bindSearch.timer);

    bindSearch.timer = setTimeout(async () => {

      try {

        await loadOrders();

        const value = state.query;

        render();

        const input = document.querySelector("#order-search");

        if (input) {

          input.focus();

          input.setSelectionRange(value.length, value.length);

        }

      } catch (error) {

        toast(error.message, { error: true });

      }

    }, 320);

  });

}



/* ── Modal de pedido ─────────────────────────────────────────── */



async function openOrder(id) {

  const modal = document.querySelector("#order-modal");

  const body = document.querySelector("#modal-body");

  document.querySelector("#modal-title").textContent = id;

  body.innerHTML = `<div class="admin-loading">Cargando pedido…</div>`;

  modal.hidden = false;

  document.body.style.overflow = "hidden";



  try {

    const { order } = await adminApi(`/api/admin/orders/${encodeURIComponent(id)}`);

    body.innerHTML = renderOrderDetail(order);

    bindModalActions(order);

  } catch (error) {

    body.innerHTML = `<p class="admin-card__note">${escapeHtml(error.message)}</p>`;

  }

}



function renderOrderDetail(order) {

  const isCj = order.fulfillment?.provider === "cj";

  const canConfirmPayment = ["pending", "pending_transfer", "pending_cash", "pending_crypto", "payment_review"].includes(order.status) && !isCj;

  const canTrack = ["paid", "shipped", "delivered"].includes(order.status) && !isCj;

  const canShip = order.status === "paid" && !isCj;

  const canDeliver = order.status === "shipped" && !isCj;

  const canRefund = ["paid", "shipped", "delivered"].includes(order.status);

  const canRetrySupplier =

    isCj &&

    (["queued", "retry", "failed"].includes(order.fulfillment.status) ||

      order.fulfillment.paymentStatus === "failed");



  return `

    <section class="modal-section">

      <h3>Estado</h3>

      <div class="modal-kv">

        <div><span>Pedido</span>${statusBadge(order.status)}</div>

        <div><span>Pago</span><strong>${escapeHtml(methodLabel(order.payment.method))} · ${escapeHtml(order.payment.status)}</strong></div>

        <div><span>Canal</span><strong>${escapeHtml(channelLabel(order.channel))}</strong></div>

        <div><span>Creado</span><strong>${escapeHtml(fullDate(order.createdAt))}</strong></div>

      </div>

      ${order.inventoryShortage?.length ? `<p class="form-msg is-error" style="margin-top:10px">Falta stock: ${escapeHtml(order.inventoryShortage.map((item) => `${item.name} (hay ${item.available})`).join(" · "))}</p>` : ""}

      ${canConfirmPayment ? `<div class="admin-actions"><button class="admin-btn admin-btn--lime" type="button" data-confirm-payment>Confirmar pago manualmente</button></div>` : ""}

    </section>



    <section class="modal-section">

      <h3>Cliente</h3>

      <div class="modal-kv">

        <div><span>Nombre</span><strong>${escapeHtml(order.customer.name)}</strong></div>

        <div><span>Email</span><strong>${escapeHtml(order.customer.email)}</strong></div>

        <div><span>Teléfono</span><strong>${escapeHtml(order.customer.phone)}</strong></div>

        <div><span>Dirección</span><strong>${escapeHtml(order.customer.address || "—")}</strong></div>

        <div><span>Ciudad</span><strong>${escapeHtml([order.customer.city, order.customer.province, order.customer.postal].filter(Boolean).join(", ") || "—")}</strong></div>

        <div><span>País</span><strong>${escapeHtml(order.customer.country)}</strong></div>

        ${order.customer.notes ? `<div><span>Notas</span><strong>${escapeHtml(order.customer.notes)}</strong></div>` : ""}

      </div>

    </section>



    <section class="modal-section">

      <h3>Productos</h3>

      <div class="modal-items">

        ${order.items

          .map(

            (item) => `

          <div class="modal-item">

            <img src="${item.image}" alt="" loading="lazy">

            <div>${escapeHtml(item.name)}<span>${escapeHtml(item.color || "")} · ×${item.qty}</span></div>

            <strong>${money(item.lineTotal, order.currency)}</strong>

          </div>`,

          )

          .join("")}

      </div>

      <div class="modal-kv" style="margin-top:14px">

        <div><span>Subtotal</span><strong>${money(order.totals.subtotal, order.currency)}</strong></div>

        ${order.totals.discount ? `<div><span>Descuento</span><strong>−${money(order.totals.discount, order.currency)}</strong></div>` : ""}

        <div><span>Envío</span><strong>${order.totals.shipping === 0 ? "Gratis" : money(order.totals.shipping, order.currency)}</strong></div>

        <div><span>Total</span><strong>${money(order.totals.total, order.currency)}</strong></div>

      </div>

    </section>



    <section class="modal-section">

      <h3>Logística</h3>

      <div class="modal-kv">

        <div><span>Estado</span><strong>${escapeHtml(order.fulfillment.status)}</strong></div>

        <div><span>Proveedor</span><strong>${escapeHtml(order.fulfillment.supplierRef || "—")}</strong></div>

        <div><span>Transporte</span><strong>${escapeHtml(order.fulfillment.carrier || "—")}</strong></div>

        <div><span>Tracking</span><strong>${escapeHtml(order.fulfillment.tracking || "—")}</strong></div>

      </div>

      ${canTrack ? `

        <div class="shipment-fields">

          <div class="field"><label for="ship-carrier">Transporte</label><input class="input" id="ship-carrier" maxlength="60" value="${escapeHtml(order.fulfillment.carrier || "")}" placeholder="Andreani, Correo Argentino, moto…"></div>

          <div class="field"><label for="ship-tracking">Código de seguimiento</label><input class="input" id="ship-tracking" maxlength="100" value="${escapeHtml(order.fulfillment.tracking || "")}" placeholder="AR123456789"></div>

          <div class="field field--full"><label for="ship-url">URL de seguimiento <span>(opcional)</span></label><input class="input" id="ship-url" type="url" maxlength="500" value="${escapeHtml(order.fulfillment.trackingUrl || "")}" placeholder="https://…"></div>

        </div>

        <label class="checkline"><input type="checkbox" id="ship-notify" checked> Avisar al cliente por email</label>

      ` : `<p class="admin-card__note" style="margin-top:10px">${canConfirmPayment ? "Confirmá el pago para habilitar el despacho." : isCj ? "El seguimiento se sincroniza automáticamente con CJ." : ""}</p>`}

      <div class="admin-actions">

        ${canTrack ? `<button class="admin-btn admin-btn--primary" type="button" data-shipment-save>${canShip ? "Guardar y marcar enviado" : "Actualizar seguimiento"}</button>` : ""}

        ${canDeliver ? `<button class="admin-btn admin-btn--lime" type="button" data-shipment-deliver>Marcar entregado</button>` : ""}

        ${canRefund ? `<button class="admin-btn admin-btn--danger" data-refund>Reembolsar</button>` : ""}

      </div>

      ${canTrack ? `<p class="admin-card__note" style="margin-top:10px">El código y la URL aparecen en el seguimiento del cliente. Si el email no está configurado, queda registrado en el log del backoffice.</p>` : ""}

    </section>



    <section class="modal-section">

      <h3>Proveedor</h3>

      <div class="modal-kv">

        <div><span>Proveedor</span><strong>${escapeHtml(isCj ? "CJ Dropshipping" : order.fulfillment?.provider || "—")}</strong></div>

        <div><span>Orden remota</span><strong>${escapeHtml(order.fulfillment?.remoteOrderId || "—")}</strong></div>

        <div><span>Estado remoto</span><strong>${escapeHtml(order.fulfillment?.remoteStatus || "—")}</strong></div>

        <div><span>Pago proveedor</span><strong>${escapeHtml(order.fulfillment?.paymentStatus || "—")}</strong></div>

        <div><span>Última sync</span><strong>${order.fulfillment?.lastSyncAt ? escapeHtml(fullDate(order.fulfillment.lastSyncAt)) : "—"}</strong></div>

      </div>

      ${order.fulfillment?.lastError ? `<p class="form-msg is-error" style="margin-top:8px">${escapeHtml(order.fulfillment.lastError)}</p>` : ""}

      ${canRetrySupplier ? `<div class="admin-actions"><button class="admin-btn admin-btn--primary" data-retry-supplier>Reintentar en el proveedor</button></div>` : ""}

    </section>



    <section class="modal-section">

      <h3>Timeline</h3>

      <div class="flow">

        ${order.timeline

          .map(

            (event, index) => `

          <div class="flow__step">

            <span class="flow__num">${String(index + 1).padStart(2, "0")}</span>

            <div class="flow__body"><strong>${escapeHtml(event.label)}</strong><span>${escapeHtml(fullDate(event.at))}</span></div>

          </div>`,

          )

          .join("")}

      </div>

    </section>`;

}



async function refreshAfterOrderChange() {

  closeModal();

  await loadOverview({ silent: true });

  if (state.view === "pedidos") await loadOrders();

  if (state.view === "logistica") await loadLogistics();

  render();

}



function bindModalActions(order) {

  document.querySelector("[data-confirm-payment]")?.addEventListener("click", async () => {

    if (!confirm(`¿Confirmar el pago de ${order.id}? Se descuenta stock y se avisa al cliente.`)) return;

    const button = document.querySelector("[data-confirm-payment]");

    button.disabled = true;

    button.textContent = "Confirmando…";

    try {

      await adminApi(`/api/admin/orders/${encodeURIComponent(order.id)}/confirm-payment`, {

        method: "POST",

        body: "{}",

      });

      toast("Pago confirmado. El pedido pasó a preparación.");

      await refreshAfterOrderChange();

    } catch (error) {

      toast(error.message, { error: true });

      button.disabled = false;

      button.textContent = "Confirmar pago manualmente";

    }

  });



  document.querySelector("[data-shipment-save]")?.addEventListener("click", async () => {

    const carrier = document.querySelector("#ship-carrier")?.value.trim() || "";

    const tracking = document.querySelector("#ship-tracking")?.value.trim() || "";

    const trackingUrl = document.querySelector("#ship-url")?.value.trim() || "";

    const notify = Boolean(document.querySelector("#ship-notify")?.checked);

    if (!carrier || !tracking) {

      toast("Completá transporte y código de seguimiento.", { error: true });

      return;

    }



    const button = document.querySelector("[data-shipment-save]");

    button.disabled = true;

    button.textContent = "Guardando…";

    try {

      await adminApi(`/api/admin/orders/${encodeURIComponent(order.id)}/shipment`, {

        method: "POST",

        body: JSON.stringify({ carrier, tracking, trackingUrl, notify }),

      });

      toast(order.status === "paid" ? "Pedido marcado como enviado." : "Seguimiento actualizado.");

      await refreshAfterOrderChange();

    } catch (error) {

      toast(error.message, { error: true });

      button.disabled = false;

      button.textContent = order.status === "paid" ? "Guardar y marcar enviado" : "Actualizar seguimiento";

    }

  });



  document.querySelector("[data-shipment-deliver]")?.addEventListener("click", async () => {

    if (!confirm(`¿Marcar ${order.id} como entregado y avisar al cliente?`)) return;

    const button = document.querySelector("[data-shipment-deliver]");

    button.disabled = true;

    button.textContent = "Guardando…";

    try {

      await adminApi(`/api/admin/orders/${encodeURIComponent(order.id)}/deliver`, {

        method: "POST",

        body: JSON.stringify({ notify: true }),

      });

      toast("Pedido marcado como entregado.");

      await refreshAfterOrderChange();

    } catch (error) {

      toast(error.message, { error: true });

      button.disabled = false;

      button.textContent = "Marcar entregado";

    }

  });



  document.querySelector("[data-retry-supplier]")?.addEventListener("click", async () => {

    const button = document.querySelector("[data-retry-supplier]");

    button.disabled = true;

    button.textContent = "Reintentando…";

    try {

      await adminApi(`/api/admin/orders/${encodeURIComponent(order.id)}/retry`, {

        method: "POST",

        body: "{}",

      });

      toast("Pedido reenviado al proveedor");

      closeModal();

      await loadOverview({ silent: true });

      if (state.view === "pedidos") await loadOrders();

      render();

    } catch (error) {

      toast(error.message, { error: true });

      button.disabled = false;

      button.textContent = "Reintentar en el proveedor";

    }

  });



  document.querySelectorAll("[data-fulfill]").forEach((button) => {

    button.addEventListener("click", async () => {

      button.disabled = true;

      try {

        await adminApi(`/api/admin/orders/${encodeURIComponent(order.id)}/fulfill`, {

          method: "POST",

          body: JSON.stringify({ step: button.dataset.fulfill }),

        });

        toast(button.dataset.fulfill === "delivered" ? "Pedido entregado" : "Pedido marcado como enviado");

        closeModal();

        await loadOverview({ silent: true });

        if (state.view === "pedidos") await loadOrders();

        render();

      } catch (error) {

        toast(error.message, { error: true });

        button.disabled = false;

      }

    });

  });



  document.querySelector("[data-refund]")?.addEventListener("click", async () => {

    if (!confirm(`¿Reembolsar ${order.id}? Esta acción queda registrada en el timeline.`)) return;

    const button = document.querySelector("[data-refund]");

    button.disabled = true;

    try {

      await adminApi(`/api/admin/orders/${encodeURIComponent(order.id)}/refund`, {

        method: "POST",

        body: JSON.stringify({ reason: "Reembolso manual desde el backoffice" }),

      });

      toast("Reembolso registrado");

      closeModal();

      await loadOverview({ silent: true });

      if (state.view === "pedidos") await loadOrders();

      render();

    } catch (error) {

      toast(error.message, { error: true });

      button.disabled = false;

    }

  });

}



function closeModal() {

  const modal = document.querySelector("#order-modal");

  if (!modal || modal.hidden) return;

  modal.hidden = true;

  document.body.style.overflow = "";

}



/* ── Formato ─────────────────────────────────────────────────── */



const nfFormatter = new Intl.NumberFormat("es-AR");

const nf = (value) => nfFormatter.format(Number(value) || 0);



function ars(value) {

  return money(Math.round(Number(value) || 0), "ARS");

}



function compactArs(value) {

  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;

  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;

  return `$${Math.round(value)}`;

}



function shortDate(iso) {

  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(iso));

}



function relativeAge(iso) {

  const time = new Date(iso).getTime();

  if (!Number.isFinite(time)) return "";

  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));

  if (minutes < 1) return "recién";

  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);

  if (days < 30) return `hace ${days} d`;

  const months = Math.floor(days / 30);

  return `hace ${months} mes${months === 1 ? "" : "es"}`;

}



function fullDate(iso) {

  return new Intl.DateTimeFormat("es-AR", {

    day: "2-digit",

    month: "short",

    year: "numeric",

    hour: "2-digit",

    minute: "2-digit",

  }).format(new Date(iso));

}



function rangeLabel(range) {

  return `${shortDate(range.from)} — ${shortDate(range.to)}`;

}



function statusBadge(status) {

  const labels = {

    pending: "Pendiente",

    pending_transfer: "Transferencia",

    pending_cash: "Efectivo",

    payment_review: "En revisión",

    paid: "Pagado",

    shipped: "Enviado",

    delivered: "Entregado",

    cancelled: "Cancelado",

    refunded: "Reembolsado",

  };

  return `<span class="badge badge--${escapeHtml(status)}">${escapeHtml(labels[status] || status)}</span>`;

}



function methodLabel(method) {

  return {

    mercadopago: "MercadoPago",

    transfer: "Transferencia",

    cash: "Efectivo",

  }[method] || method;

}



function channelLabel(channel) {

  return {

    meta: "Meta Ads",

    google: "Google Ads",

    email: "Email",

    influencer: "Influencers",

    organic: "Orgánico",

  }[channel] || channel;

}



function categoryLabel(category) {

  return {

    cocina: "Cocina",

    bano: "Baño",

    deco: "Deco",

    hogar: "Hogar",

    tecnologia: "Tecnología",

    cuidado: "Cuidado personal",

    todos: "General",

  }[category] || category;

}



/* Evita que un estado final quede fuera de los filtros. */

void FINAL_STATUSES;

function renderBackupsCard() {
  const b = state.backups || { status: {}, backups: [] };
  const status = b.status || {};
  const list = (b.backups || []).slice(0, 10);
  const rows = list.map((item) => `
    <tr>
      <td><strong style="font-size:11px">${escapeHtml(item.name || "")}</strong><br><small style="color:var(--muted)">${escapeHtml(item.reason || "")}</small></td>
      <td>${item.createdAt ? escapeHtml(fullDate(item.createdAt)) : "—"}</td>
      <td class="num">${item.size ? `${Math.round(item.size / 1024)} KB` : "—"}</td>
      <td>${item.encrypted ? '<span class="badge badge--paid">Cifrado</span>' : '<span class="badge">Plano</span>'}</td>
      <td style="text-align:right"><button class="admin-btn admin-btn--ghost" data-restore-backup="${escapeHtml(item.name || "")}" style="font-size:10px;padding:6px 10px">Restaurar</button></td>
    </tr>
  `).join("");

  return `
    <section class="admin-card" style="margin-bottom:18px">
      <div class="admin-card__head">
        <div>
          <h2>Respaldos automáticos</h2>
          <span>Copias de seguridad de la base de datos</span>
        </div>
        <span class="status-chip ${status.enabled ? "is-on" : ""}"><i></i>${status.enabled ? "Activos" : "Inactivos"}</span>
      </div>
      <div class="status-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:2px 24px;margin-bottom:14px">
        <div class="status-row"><span>Cifrado en reposo</span><strong>${status.encryptedAtRest ? "Sí (AES-256-GCM)" : "No (configurá BACKUP_ENCRYPTION_KEY)"}</strong></div>
        <div class="status-row"><span>Backups guardados</span><strong>${nf(status.count || list.length || 0)}</strong></div>
        <div class="status-row"><span>Último backup</span><strong>${status.latest?.createdAt ? escapeHtml(fullDate(status.latest.createdAt)) : "—"}</strong></div>
        <div class="status-row"><span>Carpeta</span><strong style="font-size:10px;word-break:break-all">${escapeHtml(status.backupDir || "data/backups")}</strong></div>
      </div>
      <div class="admin-actions" style="margin-bottom:14px">
        <button class="admin-btn admin-btn--primary" id="create-backup">Crear backup ahora</button>
      </div>
      ${list.length ? `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Archivo</th><th>Fecha</th><th class="num">Tamaño</th><th>Estado</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<p class="admin-card__note">No hay backups disponibles todavía.</p>`}
      <p class="admin-card__note">Los backups automáticos se ejecutan al iniciar y cada 6 horas (últimos 30). Restaurar reemplaza la base actual; se crea una copia de seguridad previa automáticamente. Si un backup está cifrado, se necesita la misma <code>BACKUP_ENCRYPTION_KEY</code> para restaurarlo.</p>
    </section>`;
}
