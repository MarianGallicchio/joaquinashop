import { init, catalog, productCard, revealAll, track } from "./common.js";

await init({ page: "home" });

const data = catalog();
const grid = document.querySelector("#product-grid");
const searchInput = document.querySelector("#product-search");
const sortSelect = document.querySelector("#product-sort");
const countLabel = document.querySelector("#catalog-count");
const products = data?.products || [];

let activeFilter = "todos";
let query = "";
let sort = "featured";

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function renderProducts() {
  if (!grid) return;
  const term = normalize(query).trim();
  const visible = products
    .filter((product) => {
      if (activeFilter !== "todos" && product.category !== activeFilter) return false;
      if (!term) return true;
      const haystack = normalize(
        [product.name, product.subtitle, product.short, product.eyebrow, product.category].join(" "),
      );
      return haystack.includes(term);
    })
    .sort((a, b) => {
      if (sort === "price-asc") return a.priceArs - b.priceArs;
      if (sort === "price-desc") return b.priceArs - a.priceArs;
      if (sort === "name") return a.name.localeCompare(b.name, "es");
      return 0;
    });

  grid.innerHTML = visible.length
    ? visible.map((product, index) => productCard(product, { index })).join("")
    : `
      <div class="catalog-empty">
        <span class="catalog-empty__mark" aria-hidden="true"></span>
        <p class="eyebrow">Sin resultados</p>
        <h3>No encontramos ese producto.</h3>
        <p>Probá con otra palabra o volvé a ver todo el catálogo.</p>
        <button class="btn btn--ghost btn--sm" type="button" data-reset-filters>Ver todo el catálogo</button>
      </div>`;

  if (countLabel) {
    countLabel.textContent = `${visible.length} de ${products.length} productos`;
  }
  revealAll();
}

function selectFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll("[data-filter]").forEach((item) => {
    const active = item.dataset.filter === filter;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
  });
}

renderProducts();

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    selectFilter(button.dataset.filter);
    renderProducts();
    track("page_view", { page: `home_filter_${button.dataset.filter}` });
  });
});

searchInput?.addEventListener("input", () => {
  query = searchInput.value;
  renderProducts();
});

sortSelect?.addEventListener("change", () => {
  sort = sortSelect.value;
  renderProducts();
  track("page_view", { page: `home_sort_${sort}` });
});

grid?.addEventListener("click", (event) => {
  if (!event.target.closest("[data-reset-filters]")) return;
  query = "";
  sort = "featured";
  if (searchInput) searchInput.value = "";
  if (sortSelect) sortSelect.value = "featured";
  selectFilter("todos");
  renderProducts();
});

document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = new Date().getFullYear();
});

/* Si el usuario llega con ?producto= desde un anuncio, abre el detalle. */
const preset = new URLSearchParams(location.search).get("producto");
if (preset) location.href = `/producto.html?id=${encodeURIComponent(preset)}`;
