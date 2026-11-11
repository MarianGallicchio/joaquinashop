/* ══════════════════════════════════════════════════════════════
   La Joaquina · núcleo de frontend
   Carrito, drawer, tracking, formato y helpers compartidos.
   ══════════════════════════════════════════════════════════════ */

const CART_KEY = "aurea_cart_v1";
const SESSION_KEY = "aurea_session_v1";
const CHANNEL_KEY = "aurea_channel_v1";

const state = {
  catalog: null,
  cart: readCart(),
  lastFocus: null,
};

function readCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((line) => line && line.id) : [];
  } catch {
    return [];
  }
}

function writeCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  renderCartCount();
  renderDrawer();
}

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getChannel() {
  let channel = sessionStorage.getItem(CHANNEL_KEY);
  if (channel) return channel;
  const source = new URLSearchParams(location.search).get("utm_source") || document.referrer;
  const value = String(source || "").toLowerCase();
  channel =
    /instagram|facebook|meta|ig\./.test(value) ? "meta"
    : /google|adwords|gclid/.test(value) ? "google"
    : /email|newsletter|klaviyo/.test(value) ? "email"
    : /influencer|tiktok|creator/.test(value) ? "influencer"
    : "organic";
  sessionStorage.setItem(CHANNEL_KEY, channel);
  return channel;
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "No pudimos completar la operación.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const data = await api("/api/catalog");
  state.catalog = data;
  return data;
}

export function catalog() {
  return state.catalog;
}

export function whatsappNumber() {
  return state.catalog?.store?.whatsapp || "5491126730077";
}

export function whatsappLabel() {
  const number = String(whatsappNumber());
  if (number.startsWith("549") && number.length === 13) {
    return `+54 9 ${number.slice(3, 5)} ${number.slice(5, 9)}-${number.slice(9)}`;
  }
  return `+${number}`;
}

export function whatsappUrl(message = "") {
  const base = `https://wa.me/${whatsappNumber()}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

function applyStoreLinks() {
  document.querySelectorAll("a[data-whatsapp]").forEach((link) => {
    let text = link.dataset.whatsappText || "";
    if (!text) {
      try {
        text = new URL(link.href).searchParams.get("text") || "";
      } catch { /* ignore */ }
    }
    link.href = whatsappUrl(text);
  });
  document.querySelectorAll("[data-whatsapp-label]").forEach((node) => {
    node.textContent = whatsappLabel();
  });
}

export function money(value, currency = "ARS") {
  return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "ARS" ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function stars(rating) {
  const full = Math.round(Number(rating) || 0);
  return `<span class="stars" aria-label="${rating} de 5 estrellas">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function cartCount() {
  return state.cart.reduce((acc, line) => acc + (line.qty || 0), 0);
}

export function cartLines() {
  if (!state.catalog) return [];
  const all = [...(state.catalog.products || []), state.catalog.bundle].filter(Boolean);
  return state.cart
    .map((line) => {
      const product = all.find((item) => item.id === line.id);
      if (!product) return null;
      return {
        ...line,
        product,
        lineTotal: product.priceArs * line.qty,
      };
    })
    .filter(Boolean);
}

export function cartSubtotal() {
  return cartLines().reduce((acc, line) => acc + line.lineTotal, 0);
}

export function addToCart(id, qty = 1, color = null, { open = true } = {}) {
  const product = [...(state.catalog?.products || []), state.catalog?.bundle].filter(Boolean).find((item) => item.id === id);
  const stock = Number(product?.stock);
  const available = Number.isFinite(stock) ? stock : 0;
  if (available <= 0) {
    toast("Este producto está agotado.", { error: true });
    return;
  }
  const max = Math.min(10, available);
  const line = state.cart.find((item) => item.id === id && (!color || item.color === color));
  const nextQty = (line?.qty || 0) + qty;
  if (nextQty > max) {
    toast(`Solo hay ${available} unidad${available === 1 ? "" : "es"} disponibles.`, { error: true });
    return;
  }
  if (line) line.qty = nextQty;
  else state.cart.push({ id, qty: Math.min(max, qty), color: color || product?.colors?.[0] || null });
  writeCart();
  track("add_to_cart", { id });
  toast(`${product?.name || "Producto"} agregado al carrito`);
  if (open) openCart();
}

export function updateQty(index, delta) {
  const line = state.cart[index];
  if (!line) return;
  const product = [...(state.catalog?.products || []), state.catalog?.bundle]
    .filter(Boolean)
    .find((item) => item.id === line.id);
  const max = Math.max(0, Math.min(10, Number(product?.stock) || 0));
  line.qty += delta;
  if (line.qty <= 0) state.cart.splice(index, 1);
  else line.qty = Math.min(max, line.qty);
  writeCart();
}

export function removeLine(index) {
  state.cart.splice(index, 1);
  writeCart();
}

/* Limpia líneas de carritos viejos que ya no existen en el catálogo. */
function sanitizeCart() {
  const ids = new Set(
    [...(state.catalog?.products || []), state.catalog?.bundle].filter(Boolean).map((item) => item.id),
  );
  if (!ids.size) return;
  const next = state.cart
    .map((line) => {
      const product = [...(state.catalog?.products || []), state.catalog?.bundle]
        .filter(Boolean)
        .find((item) => item.id === line.id);
      if (!product) return null;
      const max = Math.min(10, Number(product.stock) || 0);
      if (max <= 0) return null;
      return line.qty > max ? { ...line, qty: max } : line;
    })
    .filter(Boolean);
  if (next.length !== state.cart.length) {
    state.cart = next;
    writeCart();
  }
}

/* ── Tracking ────────────────────────────────────────────────── */
const trackedSession = new Set();

export function track(type, extra = {}) {
  const payload = JSON.stringify({
    type,
    channel: getChannel(),
    sessionId: getSessionId(),
    ...extra,
  });
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

/* ── Toast ───────────────────────────────────────────────────── */
let toastTimer = null;
export function toast(message, { error = false } = {}) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle("is-error", error);
  requestAnimationFrame(() => el.classList.add("is-on"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 3200);
}

/* ── Drawer del carrito ──────────────────────────────────────── */
function drawerTemplate() {
  return `
    <div class="overlay" data-close-cart></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="Carrito de compras" aria-hidden="true">
      <div class="drawer__head">
        <h2>Tu carrito <span class="cart-count" data-drawer-count hidden>0</span></h2>
        <button class="icon-btn" data-close-cart aria-label="Cerrar carrito">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="drawer__body" data-cart-body></div>
      <div class="drawer__foot" data-cart-foot></div>
    </aside>`;
}

function ensureDrawer() {
  if (document.querySelector(".drawer")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = drawerTemplate();
  while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
  document.querySelectorAll("[data-close-cart]").forEach((el) =>
    el.addEventListener("click", closeCart),
  );
}

export function renderCartCount() {
  const count = cartCount();
  document.querySelectorAll(".cart-count").forEach((el) => {
    el.textContent = count;
    el.hidden = count === 0;
  });
}

export function renderDrawer() {
  ensureDrawer();
  const body = document.querySelector("[data-cart-body]");
  const foot = document.querySelector("[data-cart-foot]");
  if (!body || !foot) return;

  const lines = cartLines();
  if (!lines.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <p>Tu carrito está vacío.<br>Empezá por los más vendidos.</p>
        <a class="btn btn--primary btn--sm" href="/#bestsellers" data-close-cart>Ver productos</a>
      </div>`;
    foot.innerHTML = `<p class="drawer__note">Envío gratis desde ${money(state.catalog?.store?.freeShippingThreshold || 80000)}</p>`;
    body.querySelector("[data-close-cart]")?.addEventListener("click", closeCart);
    return;
  }

  body.innerHTML = lines
    .map(
      (line, index) => `
      <div class="cart-line">
        <img class="cart-line__img" src="${line.product.image}" alt="${escapeHtml(line.product.name)}" loading="lazy">
        <div>
          <p class="cart-line__name">${escapeHtml(line.product.name)}</p>
          <p class="cart-line__meta">${escapeHtml(line.color || line.product.colors?.[0] || "")}</p>
          <p class="cart-line__price">${money(line.lineTotal)}</p>
          <div class="qty">
            <button data-qty="${index}" data-delta="-1" aria-label="Quitar una unidad">−</button>
            <span>${line.qty}</span>
            <button data-qty="${index}" data-delta="1" aria-label="Agregar una unidad">+</button>
          </div>
        </div>
        <button class="cart-line__remove" data-remove="${index}">Quitar</button>
      </div>`,
    )
    .join("");

  const subtotal = cartSubtotal();
  const threshold = state.catalog?.store?.freeShippingThreshold || 80000;
  const remaining = Math.max(0, threshold - subtotal);
  const progress = Math.min(100, (subtotal / threshold) * 100);

  foot.innerHTML = `
    <div class="ship-progress">
      <div class="ship-progress__label">
        <span>${remaining ? `Te faltan ${money(remaining)} para el envío gratis` : "¡Tenés envío gratis!"}</span>
        <span>${Math.round(progress)}%</span>
      </div>
      <div class="ship-progress__bar"><div class="ship-progress__fill" style="width:${progress}%"></div></div>
    </div>
    <div class="drawer__subtotal"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
    <a class="btn btn--primary btn--block" href="/checkout.html">Ir al checkout</a>
    <p class="drawer__note">Pago seguro · Envío con seguimiento</p>`;

  body.querySelectorAll("[data-qty]").forEach((btn) => {
    btn.addEventListener("click", () => updateQty(Number(btn.dataset.qty), Number(btn.dataset.delta)));
  });
  body.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeLine(Number(btn.dataset.remove)));
  });
}

export function openCart() {
  ensureDrawer();
  const drawer = document.querySelector(".drawer");
  const overlay = document.querySelector(".overlay");
  state.lastFocus = document.activeElement;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-open");
  document.body.classList.add("is-locked");
  drawer.querySelector("[data-close-cart]")?.focus();
}

export function closeCart() {
  const drawer = document.querySelector(".drawer");
  if (!drawer) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  document.querySelector(".overlay")?.classList.remove("is-open");
  document.body.classList.remove("is-locked");
  if (state.lastFocus && typeof state.lastFocus.focus === "function") state.lastFocus.focus();
}

/* ── Product card ────────────────────────────────────────────── */
export function productCard(product, { index = 0 } = {}) {
  const href = `/producto.html?id=${encodeURIComponent(product.slug || product.id)}`;
  const badgeClass = index === 0 ? "card__badge card__badge--lime" : "card__badge";
  const stock = Number(product.stock);
  const available = Number.isFinite(stock) ? stock : 0;
  const stockClass = available <= 0 ? "card__stock is-out" : available <= 3 ? "card__stock is-low" : "card__stock";
  const stockLabel = available <= 0 ? "Agotado" : available <= 3 ? `Últimas ${available}` : `${available} disponibles`;
  const hoverSrc = product.imageHover || null;
  const mediaAttrs = `
      ${hoverSrc ? `data-hover="${escapeHtml(hoverSrc)}"` : ""}
      ${hoverSrc ? `data-hover-ready="1"` : ""}`;
  return `
    <article class="card reveal" data-category="${product.category}">
      <a class="card__media${mediaAttrs}" href="${href}" aria-label="Ver ${escapeHtml(product.name)}">
        <img src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy" width="1000" height="1000">
        <span class="${badgeClass}">${escapeHtml(product.badge || "Nuevo")}</span>
        <span class="${stockClass}">${stockLabel}</span>
        <span class="card__quick" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 5v14M5 12h14"/></svg>
        </span>
      </a>
      <div class="card__body">
        <p class="card__cat">${escapeHtml(product.eyebrow || categoryLabel(product.category))}</p>
        <a href="${href}"><h3 class="card__name">${escapeHtml(product.name)}</h3></a>
        <p class="card__sub">${escapeHtml(product.subtitle || "")}</p>
        ${product.reviews > 0 ? `<div class="card__rating">${stars(product.rating)} <span>${product.rating} · ${Number(product.reviews).toLocaleString("es-AR")} opiniones</span></div>` : ""}
        <div class="card__footer">
          <div>
            <span class="price">${money(product.priceArs)}</span>
            ${product.compareAtArs ? `<span class="price--compare">${money(product.compareAtArs)}</span>` : ""}
            ${product.cardPriceArs ? `<span class="card__card-price">Tarjeta ${money(product.cardPriceArs)}</span>` : ""}
          </div>
          <button class="add-btn" data-add="${product.id}" aria-label="Agregar ${escapeHtml(product.name)} al carrito" ${available <= 0 ? "disabled" : ""}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 5v14M5 12h14"/></svg>
            ${available <= 0 ? "Agotado" : "Agregar"}
          </button>
        </div>
      </div>
    </article>`;
}

export function categoryLabel(id) {
  return {
    cocina: "Cocina",
    bano: "Baño",
    deco: "Deco",
    hogar: "Hogar",
    tecnologia: "Tecnología",
    cuidado: "Cuidado personal",
    todos: "Hogar & Deco",
  }[id] || "La Joaquina";
}

/* ── Header e interacciones globales ────────────────────────── */
function initHeader() {
  const menuBtn = document.querySelector("[data-menu]");
  const menu = document.querySelector(".mobile-menu");
  menuBtn?.addEventListener("click", () => {
    const open = menu?.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", String(Boolean(open)));
    document.body.classList.toggle("is-locked", Boolean(open));
  });
  menu?.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      menu.classList.remove("is-open");
      document.body.classList.remove("is-locked");
    }),
  );

  document.querySelectorAll("[data-open-cart]").forEach((btn) =>
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      openCart();
    }),
  );

  const header = document.querySelector(".header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
}

function initNewsletter() {
  document.querySelectorAll("[data-newsletter]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = form.querySelector('input[type="email"]');
      const msg = form.querySelector(".form-msg");
      const button = form.querySelector("button");
      if (!email?.value.trim()) return;
      button.disabled = true;
      try {
        const data = await api("/api/leads", {
          method: "POST",
          body: JSON.stringify({ email: email.value.trim(), source: form.dataset.source || "newsletter" }),
        });
        if (msg) {
          msg.textContent = `Listo. Usá el cupón ${data.coupon} en tu primera compra.`;
          msg.className = "form-msg is-ok";
        }
        form.reset();
      } catch (error) {
        if (msg) {
          msg.textContent = error.message;
          msg.className = "form-msg is-error";
        }
      } finally {
        button.disabled = false;
      }
    });
  });
}

function initReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
  );
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

function initEscape() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCart();
  });
}

export async function revealAll() {
  initReveal();

  try {
    await import("./motion.js").then((m) => m.initMotion());
  } catch (error) {
    console.warn("motion: initMotion falló", error);
  }
}

export async function init({ page = "home" } = {}) {
  initHeader();
  initNewsletter();
  initEscape();
  renderCartCount();
  try {
    await loadCatalog();
  } catch {
    toast("No pudimos cargar el catálogo. Recargá la página.", { error: true });
  }

  applyStoreLinks();
  ensureDrawer();
  sanitizeCart();
  renderCartCount();
  renderDrawer();

  if (!trackedSession.has(page)) {
    track("session_start");
    trackedSession.add(page);
  }
  track("page_view", { page });

  initReveal();

  window.Aurea.onCartChange = (onChange) => {
    const listener = () => onChange();
    writeCart = () => {
      localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
      renderCartCount();
      renderDrawer();
      listener();
    };
  };

  document.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add]");
    if (add) {
      event.preventDefault();
      addToCart(add.dataset.add, 1, null);
    }
  });
}

window.Aurea = {
  api,
  loadCatalog,
  catalog,
  money,
  stars,
  escapeHtml,
  addToCart,
  openCart,
  closeCart,
  toast,
  track,
  productCard,
  categoryLabel,
  whatsappNumber,
  whatsappLabel,
  whatsappUrl,
  getChannel,
  revealAll,
  init,
};
