(function () {

  // ── Wait until globals are ready ─────────────────────────────────────────────
  // variant-filter.liquid must run first and set window.__PRODUCT_ID__
  // If it hasn't (e.g. script order issue), we bail out cleanly.
  if (!window.__PRODUCT_ID__) {
    console.error("[VF] window.__PRODUCT_ID__ is undefined. " +
      "Make sure variant-filter.liquid runs BEFORE this script " +
      "and that {% render 'variant-filter' %} is inside the {% if product %} block.");
    return;
  }

  var ALL_CONFIGS = window.__VARIANT_CONFIG__ || [];
  var PRODUCT_ID  = window.__PRODUCT_ID__;
  var PRODUCT_GID = "gid://shopify/Product/" + PRODUCT_ID;

  var CONFIG = ALL_CONFIGS.filter(function (c) {
    return c.productId === PRODUCT_GID;
  });

  console.log("[VF] PRODUCT_GID :", PRODUCT_GID);
  console.log("[VF] ALL_CONFIGS :", ALL_CONFIGS.length);
  console.log("[VF] CONFIG match:", CONFIG.length);

  // ── Variant ID ───────────────────────────────────────────────────────────────
  function getCurrentVariantId() {
    var input = document.querySelector('input[name="id"]');
    if (input && input.value) return input.value;
    return new URLSearchParams(window.location.search).get("variant");
  }

  // ── Filter ───────────────────────────────────────────────────────────────────
  function filterImages() {
    var variantId = getCurrentVariantId();
    if (!variantId) return;

    var fullGid = "gid://shopify/ProductVariant/" + variantId;
    var match   = null;

    for (var i = 0; i < CONFIG.length; i++) {
      if (CONFIG[i].variantId === fullGid) { match = CONFIG[i]; break; }
    }

    var allowedIds = [];
    if (match && match.imageIds && match.imageIds.length > 0) {
      allowedIds = match.imageIds.map(function (id) { return id.split("/").pop(); });
    }
    var hasMapping = allowedIds.length > 0;

    console.log("[VF] filterImages — variantId:", variantId, "| match:", !!match, "| allowedIds:", allowedIds);

    // Main gallery
    document.querySelectorAll(".product__media-item").forEach(function (el) {
      var mediaId = (el.id || "").split("-").pop();
      if (!mediaId) return;
      var show = !hasMapping || allowedIds.indexOf(mediaId) !== -1;
      el.style.display = show ? "" : "none";
      el.classList.toggle("variant-hidden", !show);
    });

    // Thumbnail strip
    document.querySelectorAll("[data-media-id]").forEach(function (el) {
      var mediaId = String(el.dataset.mediaId || "");
      if (!mediaId) return;
      var show = !hasMapping || allowedIds.indexOf(mediaId) !== -1;
      el.style.display = show ? "" : "none";
      el.classList.toggle("variant-hidden", !show);
    });
  }

  // ── Observer ─────────────────────────────────────────────────────────────────
  function attachVariantObserver() {
    var input = document.querySelector('input[name="id"]');
    if (!input) return false;

    // Patch value setter — catches Dawn's programmatic input.value = "xxx"
    try {
      var desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
      if (desc && desc.set) {
        var _set = desc.set;
        Object.defineProperty(input, "value", {
          set: function (v) { _set.call(this, v); filterImages(); },
          get: desc.get,
          configurable: true
        });
      }
    } catch (e) {}

    // MutationObserver as backup
    new MutationObserver(filterImages)
      .observe(input, { attributes: true, attributeFilter: ["value"] });

    return true;
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    filterImages();

    if (!attachVariantObserver()) {
      var dw = new MutationObserver(function () {
        if (attachVariantObserver()) dw.disconnect();
      });
      dw.observe(document.body, { childList: true, subtree: true });
    }

    // <select> variant pickers
    document.addEventListener("change", function (e) {
      if (e.target && e.target.name === "id") filterImages();
    });

    // Browser back/forward
    window.addEventListener("popstate", filterImages);

    // Polling safety net for pushState URL changes
    var last = getCurrentVariantId();
    setInterval(function () {
      var cur = getCurrentVariantId();
      if (cur && cur !== last) { last = cur; filterImages(); }
    }, 500);
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();

})();
