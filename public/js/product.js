import {
  init,
  catalog,
  money,
  stars,
  escapeHtml,
  addToCart,
  productCard,
  revealAll,
  track,
  toast,
  openLightbox,
} from "./common.js";

await init({ page: "product" });

const data = catalog();
if (!data) throw new Error("catálogo no disponible");

const slug = new URLSearchParams(location.search).get("id") || "massage-gun";
const all = [...data.products, data.bundle].filter(Boolean);
const product = all.find((item) => item.id === slug || item.slug === slug);

if (!product) {
  location.replace("/#bestsellers");
  throw new Error("producto inexistente");
}

const $ = (selector) => document.querySelector(selector);
const selected = { qty: 1, color: product.colors?.[0] || null };
const stock = Math.max(0, Number(product.stock) || 0);
const maxQty = Math.min(10, stock);
const discount = product.compareAtArs
  ? Math.round((1 - product.priceArs / product.compareAtArs) * 100)
  : 0;

document.title = `${product.name} · La Joaquina Hogar & Deco`;
const meta = document.querySelector('meta[name="description"]');
if (meta) meta.content = `${product.name}: ${product.short}`;
$("[data-breadcrumb]").textContent = product.name;
$("[data-year]").textContent = new Date().getFullYear();

$("#pdp-title").textContent = product.name;
$("#pdp-sub").textContent = product.subtitle;
$("#pdp-image").src = product.image;
$("#pdp-image").alt = `${product.name} de La Joaquina Hogar & Deco`;
$("#pdp-short").textContent = product.short;
$("#pdp-shipping").textContent = product.shippingDays;
if (product.reviews > 0) {
  $("#pdp-rating").innerHTML = `${stars(product.rating)} <span>${product.rating} · ${Number(product.reviews).toLocaleString("es-AR")} opiniones</span>`;
} else {
  $("#pdp-rating").hidden = true;
}

$("#pdp-price").textContent = money(product.priceArs);
$("#pdp-compare").textContent = product.compareAtArs ? money(product.compareAtArs) : "";
$("#pdp-card-price").textContent = product.cardPriceArs ? `Con tarjeta: ${money(product.cardPriceArs)}` : "";
$("#pdp-installments").textContent = product.cardPriceArs
  ? `o 3 cuotas de ${money(Math.round(product.cardPriceArs / 3 / 100) * 100)} con tarjeta`
  : "";

const stockNode = $("#pdp-stock");
stockNode.className = `pdp__stock${stock <= 0 ? " is-out" : stock <= 3 ? " is-low" : ""}`;
stockNode.textContent = stock <= 0 ? "Agotado · volvé a mirar pronto" : stock <= 3 ? `Últimas ${stock} unidades` : `${stock} unidades disponibles`;
if (maxQty <= 0) {
  $("#add-to-cart").disabled = true;
  $("#buy-now").disabled = true;
}

if (discount > 0) {
  const save = $("#pdp-save");
  save.hidden = false;
  save.textContent = `−${discount}%`;
}

$("#pdp-badges").innerHTML = `
  ${product.badge ? `<span class="pill pill--lime">${escapeHtml(product.badge)}</span>` : ""}
  <span class="pill">Producto nuevo</span>
  <span class="pill">Envío con seguimiento</span>`;

$("#pdp-benefits").innerHTML = product.benefits.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
$("#pdp-specs").innerHTML = Object.entries(product.specs)
  .map(([key, value]) => `<li><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</li>`)
  .join("");

/* Galería + lightbox */
const thumbs = $("#pdp-thumbs");
const galleryImages = (product.gallery && product.gallery.length ? product.gallery : [product.image]).filter(Boolean);
let currentImageIndex = 0;
const mainWrap = document.querySelector(".pdp__main");
const mainImg = $("#pdp-image");
if (mainWrap) {
  mainWrap.classList.add("is-hover-zoom");
  mainWrap.setAttribute("tabindex", "0");
  mainWrap.setAttribute("role", "button");
  mainWrap.setAttribute("aria-label", "Ampliar imagen del producto");
  const openCurrent = () => openLightbox(galleryImages, currentImageIndex);
  mainWrap.addEventListener("click", openCurrent);
  mainWrap.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCurrent(); } });
}

if (galleryImages.length > 1) {
  thumbs.innerHTML = galleryImages
    .map(
      (src, index) => `
      <button class="pdp__thumb ${index === 0 ? "is-active" : ""}" data-image="${src}" data-index="${index}" aria-label="Ver imagen ${index + 1}">
        <img src="${src}" alt="" loading="lazy">
      </button>`,
    )
    .join("");
  thumbs.querySelectorAll("[data-image]").forEach((button) => {
    button.addEventListener("click", () => {
      currentImageIndex = Number(button.dataset.index || 0);
      mainImg.src = button.dataset.image;
      thumbs.querySelectorAll(".pdp__thumb").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
    });
  });
} else {
  thumbs.hidden = true;
}

/* Colores */
const colors = $("#pdp-colors");
if (product.colors?.length) {
  colors.innerHTML = product.colors
    .map(
      (color, index) =>
        `<button class="color ${index === 0 ? "is-active" : ""}" data-color="${escapeHtml(color)}" aria-pressed="${index === 0}">${escapeHtml(color)}</button>`,
    )
    .join("");
  $("#pdp-color-label").textContent = product.colors[0];
  colors.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => {
      selected.color = button.dataset.color;
      $("#pdp-color-label").textContent = selected.color;
      colors.querySelectorAll(".color").forEach((item) => {
        item.classList.toggle("is-active", item === button);
        item.setAttribute("aria-pressed", String(item === button));
      });
    });
  });
} else {
  $("#pdp-options").hidden = true;
}

/* Cantidad */
$("#qty-minus").addEventListener("click", () => {
  selected.qty = Math.max(1, selected.qty - 1);
  $("#qty-value").textContent = selected.qty;
});
$("#qty-plus").addEventListener("click", () => {
  selected.qty = Math.min(Math.max(1, maxQty), selected.qty + 1);
  $("#qty-value").textContent = selected.qty;
});

$("#add-to-cart").addEventListener("click", () => {
  addToCart(product.id, selected.qty, selected.color);
});

$("#buy-now").addEventListener("click", () => {
  addToCart(product.id, selected.qty, selected.color, { open: false });
  location.href = "/checkout.html";
});

/* Compartir ficha: usa el menú nativo y cae a copiar el enlace. */
$("#share-product").addEventListener("click", async () => {
  const url = location.href;
  const shareData = { title: `${product.name} · La Joaquina`, text: product.short, url };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(url);
    toast("Link copiado. Ya podés compartirlo.");
  } catch (error) {
    if (error?.name !== "AbortError") toast("No pudimos compartir el link. Probá de nuevo.", { error: true });
  }
});

/* Reseñas: la tienda todavía no tiene opiniones cargadas. */
const reviewsSection = document.querySelector(".reviews-section");
if (reviewsSection) reviewsSection.hidden = true;

/* Relacionados */
const related = data.products
  .filter((item) => item.id !== product.id)
  .sort((a, b) => (a.category === product.category ? -1 : 0) - (b.category === product.category ? -1 : 0))
  .slice(0, 3);
$("#related-grid").innerHTML = related.map((item, index) => productCard(item, { index })).join("");
revealAll();

track("view_item", { id: product.id });
