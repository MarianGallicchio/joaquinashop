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
let searchTimer = null;
let renderToken = 0;

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function syncUrl(push = false) {
  const params = new URLSearchParams();
  if (activeFilter !== "todos") params.set("cat", activeFilter);
  if (query.trim()) params.set("q", query.trim());
  if (sort !== "featured") params.set("sort", sort);
  const qs = params.toString();
  const url = qs ? `/?${qs}` : "/";
  const method = push ? "pushState" : "replaceState";
  history[method]({}, "", url);
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  activeFilter = params.get("cat") || "todos";
  query = params.get("q") || "";
  sort = params.get("sort") || "featured";
  if (searchInput) searchInput.value = query;
  if (sortSelect) sortSelect.value = sort;
  document.querySelectorAll("[data-filter]").forEach((item) => {
    const active = item.dataset.filter === activeFilter;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-pressed", String(active));
  });
}

function renderProducts({ animate = true } = {}) {
  if (!grid) return;
  const token = ++renderToken;
  if (animate) grid.classList.add("is-updating");

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

  const apply = () => {
    if (token !== renderToken) return;
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
    requestAnimationFrame(() => grid.classList.remove("is-updating"));
  };

  if (animate) setTimeout(apply, 120);
  else apply();
}

function selectFilter(filter, { push = true } = {}) {
  activeFilter = filter;
  document.querySelectorAll("[data-filter]").forEach((item) => {
    const active = item.dataset.filter === filter;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  syncUrl(push);
  renderProducts();
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    selectFilter(button.dataset.filter, { push: true });
    try { navigator.vibrate?.(8); } catch {}
    track("page_view", { page: `home_filter_${button.dataset.filter}` });
  });
});

searchInput?.addEventListener("input", (event) => {
  query = event.target.value || "";
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    syncUrl(true);
    renderProducts();
  }, 220);
});

sortSelect?.addEventListener("change", (event) => {
  sort = event.target.value || "featured";
  syncUrl(true);
  renderProducts();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-reset-filters]")) return;
  query = "";
  sort = "featured";
  if (searchInput) searchInput.value = "";
  if (sortSelect) sortSelect.value = "featured";
  selectFilter("todos", { push: true });
});

window.addEventListener("popstate", () => {
  readUrl();
  renderProducts({ animate: false });
});

readUrl();
if (products.length) renderProducts({ animate: false });
else if (countLabel) countLabel.textContent = "Catálogo disponible en breve";
