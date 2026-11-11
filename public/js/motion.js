import { cartCount } from "./common.js";

/* ── Haptic / pressure-pressure cue (visual-only side channel) ── */
function fireHaptic(el) {
  if (!el) return;
  if (el.classList.contains("haptic--ink")) {
    el.style.background = "var(--ink-2)";
    el.style.color = "var(--white)";
    setTimeout(() => { el.style.background = ""; el.style.color = ""; }, 140);
  } else if (el.classList.contains("haptic--lime")) {
    el.style.background = "var(--lime-2)";
    setTimeout(() => { el.style.background = ""; }, 140);
  }
}
function initHaptic() {
  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest("[data-haptic]");
    if (!target) return;
    if (target.disabled || target.getAttribute("disabled")) return;
    target.classList.add("is-pressed");
    fireHaptic(target);
    const clear = () => target.classList.remove("is-pressed");
    target.addEventListener("pointerup", clear, { once: true });
    target.addEventListener("pointercancel", clear, { once: true });
    target.addEventListener("pointerleave", clear, { once: true });
  });
}

/* ── Parallax hero ─────────────────────────────────────────── */
function initParallax() {
  const section = document.querySelector(".hero");
  if (!section || !("requestAnimationFrame" in window)) return;
  const parallax = document.createElement("div");
  parallax.className = "hero__parallax";
  parallax.innerHTML =
    '<img src="/assets/hero-parallax.jpg?v=20261111" alt="" aria-hidden="true" loading="eager" decoding="async">';
  section.querySelector(".hero__visual")?.after(parallax);

  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY || window.pageYOffset;
    const sectionTop = section.offsetTop;
    const sectionHeight = section.offsetHeight;
    const viewportMiddle = y + window.innerHeight / 2;
    if (viewportMiddle < sectionTop || viewportMiddle > sectionTop + sectionHeight + 120) {
      parallax.style.transform = "translateY(0)";
      return;
    }
    const progress =
      Math.max(0, (y - sectionTop)) / Math.max(1, sectionHeight);
    const shift = -Math.max(0, Math.min(120, progress * 120));
    parallax.style.transform = `translateY(${shift}px)`;
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  update();
}

/* ── Scroll reveal (adds is-in to .reveal, staggers bundles/sections) ── */
function initReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    return;
  }
  const seen = new WeakSet();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || seen.has(entry.target)) return;
        seen.add(entry.target);
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

/* ── Stacked cards (lift + shadow once in view) ───────────── */
function initStackedCards() {
  if (!("IntersectionObserver" in window)) return;
  const seen = new WeakSet();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || seen.has(entry.target)) return;
        seen.add(entry.target);
        const cards = Array.from(
          entry.target.querySelectorAll(
            ".product-grid > .card, .values > .value, .steps > .step, .stats > .stat, .testimonials > .quote-card, .bundle"
          )
        );
        cards.forEach((card, i) => {
          setTimeout(() => {
            card.classList.add("is-stacked");
            if (card.querySelector(".add-btn")) {
              card.addEventListener("animationend", () => {
                card.classList.add("add-btn--settled");
              }, { once: true });
            }
          }, i * 60 + 40);
        });
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.18, rootMargin: "0px 0px -4% 0px" }
  );
  document.querySelectorAll(".product-grid, .values, .steps, .stats, .testimonials, .bundle").forEach((el) =>
    observer.observe(el)
  );
}

/* ── Hover-ready cards: marks cards that contain a secondary image swap ── */
function initHoverReady() {
  const cards = document.querySelectorAll(".card");
  cards.forEach((card) => {
    const media = card.querySelector(".card__media");
    const img = media?.querySelector("img");
    if (!img || !img.src) return;
    const primarySrc = img.src;
    const hoverSrc = media?.dataset?.hover || primarySrc;
    if (hoverSrc === primarySrc) return;

    /* Keep the existing photo on top; swap only if the hover image differs. */
    const primary = document.createElement("img");
    primary.className = "card__media__img is-primary";
    primary.src = primarySrc;
    primary.alt = img.alt;
    primary.width = 1000;
    primary.height = 1000;
    primary.loading = "lazy";
    img.replaceWith(primary);

    const hover = document.createElement("img");
    hover.className = "card__media__img is-hover";
    hover.src = hoverSrc;
    hover.alt = "";
    hover.width = 1000;
    hover.height = 1000;
    hover.loading = "lazy";
    hover.decoding = "async";
    media.append(hover);

    /* Prefetch the hover asset so the swap is instant. */
    const prefetch = document.createElement("link");
    prefetch.rel = "preload";
    prefetch.as = "image";
    prefetch.href = hoverSrc;
    document.head.append(prefetch);
  });
}

/* ── Button micro-interactions ─────────────────────────────── */
function initAddButtonFeedback() {
  const map = new WeakMap();
  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".add-btn");
    if (!btn) return;
    if (btn.disabled || btn.getAttribute("disabled")) return;
    event.preventDefault();
    btn.classList.add("is-added");
    clearTimeout(map.get(btn));
    map.set(btn, setTimeout(() => btn.classList.remove("is-added"), 900));
  });
}

/* ── Cart count bump ───────────────────────────────────────── */
function observeCartCount() {
  let last = -1;
  let timer = null;
  const bump = () => {
    const count = cartCount();
    if (count === last) return;
    last = count;
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.querySelectorAll(".cart-count").forEach((el) => {
        if (count > 0) el.classList.add("is-bump");
        setTimeout(() => el.classList.remove("is-bump"), 320);
      });
    }, 90);
  };
  window.Aurea ? window.Aurea.onCartChange?.(observeCartCount) : null;
  const onceCart = () => {
    if (window.Aurea?.cart) {
      window.Aurea.cart.addEventListener("change", bump);
      return;
    }
    setTimeout(onceCart, 60);
  };
  onceCart();
  bump();
}

/* ── Button hover light-follow (CSS handles most; this adds a tiny JS polish on focus-visible) ── */
function initButtonFocusFollow() {
  document.addEventListener("focusin", (event) => {
    const btn = event.target.closest("button, a, label, .pay-method, .ship-option");
    if (!btn) return;
    btn.classList.add("is-focused");
    const leaveTimer = setTimeout(() => btn.classList.remove("is-focused"), 600);
    const onBlur = () => {
      clearTimeout(leaveTimer);
      btn.classList.remove("is-focused");
    };
    btn.addEventListener("blur", onBlur, { once: true });
  });
}

/* ── Init ──────────────────────────────────────────────────── */
export function initMotion() {
  initParallax();
  initReveal();
  initStackedCards();
  initHoverReady();
  initAddButtonFeedback();
  observeCartCount();
  initButtonFocusFollow();
  initHaptic();
}
