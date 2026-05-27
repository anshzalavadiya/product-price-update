(function () {

  var productId  = window.__PRODUCT_ID__;
  var allConfigs = window.__VARIANT_CONFIG__ || [];

  if (!productId) {
    console.error("[VF] __PRODUCT_ID__ missing");
    return;
  }

  var productGid = "gid://shopify/Product/" + productId;
  var config     = [];

  for (var i = 0; i < allConfigs.length; i++) {
    if (allConfigs[i].productId === productGid) {
      config.push(allConfigs[i]);
    }
  }

  console.log("[VF] product:", productGid, "matched configs:", config.length);

  function extractId(gid) {
    return String(gid || "").split("/").pop();
  }

  function getVariantId() {
    var input = document.querySelector('input[name="id"]');
    if (input && input.value) return String(input.value);
    var param = new URLSearchParams(window.location.search).get("variant");
    if (param) return String(param);
    return null;
  }

  function filterImages() {
    var variantId = getVariantId();
    if (!variantId) {
      console.warn("[VF] no variantId");
      return;
    }

    var fullGid = "gid://shopify/ProductVariant/" + variantId;
    var match   = null;

    for (var i = 0; i < config.length; i++) {
      if (config[i].variantId === fullGid) {
        match = config[i];
        break;
      }
    }

    var allowedIds = [];
    var hasMapping = false;

    if (match && Array.isArray(match.imageIds) && match.imageIds.length > 0) {
      hasMapping = true;
      for (var j = 0; j < match.imageIds.length; j++) {
        allowedIds.push(extractId(match.imageIds[j]));
      }
    }

    console.log("[VF] variant:", variantId, "hasMapping:", hasMapping, "allowed:", allowedIds);

    // Gallery items
    var galleryItems = document.querySelectorAll(".product__media-item[data-media-id]");
    console.log("[VF] gallery items:", galleryItems.length);

    var visibleMediaIds = [];

    for (var g = 0; g < galleryItems.length; g++) {
      var el        = galleryItems[g];
      var mediaId   = el.getAttribute("data-media-id") || "";
      var numericId = mediaId.split("-").pop();
      var show      = !hasMapping || allowedIds.indexOf(numericId) !== -1;
      if (show) {
        el.classList.add("vf-visible");
        el.style.display = "";
        visibleMediaIds.push(mediaId);
      } else {
        el.classList.remove("vf-visible");
        el.style.display = "none";
      }
    }

    // Thumbnails
    var thumbItems = document.querySelectorAll(".thumbnail-list__item[data-target]");
    console.log("[VF] thumb items:", thumbItems.length);

    for (var t = 0; t < thumbItems.length; t++) {
      var tel    = thumbItems[t];
      var target = tel.getAttribute("data-target") || "";
      var showT  = !hasMapping || visibleMediaIds.indexOf(target) !== -1;
      if (showT) {
        tel.classList.add("vf-visible");
        tel.style.display = "";
      } else {
        tel.classList.remove("vf-visible");
        tel.style.display = "none";
      }
    }

    // Click first visible thumbnail and trigger slider update
    for (var f = 0; f < thumbItems.length; f++) {
      if (thumbItems[f].style.display !== "none") {
        var firstBtn = thumbItems[f].querySelector("button");
        if (firstBtn) {
          setTimeout(function () {
            firstBtn.click();
            var sliderEvent = new CustomEvent("slide-changed", { bubbles: true });
            firstBtn.dispatchEvent(sliderEvent);
          }, 100);
        }
        break;
      }
    }

    // Force slider to recalculate visible slides
    setTimeout(function () {
      var slider = document.querySelector(".product__media-list");
      if (slider) {
        slider.dispatchEvent(new CustomEvent("slide-changed", { bubbles: true }));
        window.dispatchEvent(new Event("resize"));
      }
    }, 150);
  }

  function patchInput(input) {
    if (!input || input.__vfPatched) return;
    input.__vfPatched = true;
    try {
      var proto = Object.getPrototypeOf(input);
      var desc  = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) {
        var orig = desc.set;
        Object.defineProperty(input, "value", {
          configurable: true,
          get: desc.get,
          set: function (v) {
            orig.call(this, v);
            console.log("[VF] variant changed:", v);
            filterImages();
          }
        });
        console.log("[VF] input patched");
      }
    } catch (e) {
      console.warn("[VF] patch error:", e);
    }
  }

  function init() {
    console.log("[VF] init");
    filterImages();

    document.addEventListener("variant:change", function () {
      setTimeout(filterImages, 50);
    });

    document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t) return;
      var name = t.getAttribute ? t.getAttribute("name") : "";
      if (name === "id" || t.type === "radio" || t.tagName === "SELECT") {
        setTimeout(filterImages, 50);
      }
    });

    patchInput(document.querySelector('input[name="id"]'));

    var watcher = new MutationObserver(function () {
      var input = document.querySelector('input[name="id"]');
      if (input) patchInput(input);
    });
    watcher.observe(document.body, { childList: true, subtree: true });

    var lastVariant = getVariantId();
    setInterval(function () {
      var cur = getVariantId();
      if (cur && cur !== lastVariant) {
        lastVariant = cur;
        filterImages();
      }
    }, 300);

    window.addEventListener("popstate", filterImages);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

}());