import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const FILTER_JS = `(function () {
  var productId  = window.__PRODUCT_ID__;
  var allConfigs = window.__VARIANT_CONFIG__ || [];
  if (!productId) return;
  var productGid = "gid://shopify/Product/" + productId;
  var config = [];
  for (var i = 0; i < allConfigs.length; i++) {
    if (allConfigs[i].productId === productGid) config.push(allConfigs[i]);
  }
  function extractNumericId(str) {
    return String(str || "").split("/").pop().split("-").pop();
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
    if (!variantId) return;
    var fullGid = "gid://shopify/ProductVariant/" + variantId;
    var match = null;
    for (var i = 0; i < config.length; i++) {
      if (config[i].variantId === fullGid) { match = config[i]; break; }
    }
    var allowedNumericIds = [];
    var hasMapping = false;
    if (match && Array.isArray(match.imageIds) && match.imageIds.length > 0) {
      hasMapping = true;
      for (var j = 0; j < match.imageIds.length; j++) {
        allowedNumericIds.push(extractNumericId(match.imageIds[j]));
      }
    }
    var firstVisibleTarget = null;
    var galleryItems = document.querySelectorAll(".product__media-item[id]");
    for (var g = 0; g < galleryItems.length; g++) {
      var el = galleryItems[g];
      var numericId = el.id.split("-").pop();
      var show = !hasMapping || allowedNumericIds.indexOf(numericId) !== -1;
      if (show) {
        el.classList.add("vf-visible");
        el.style.display = "";
        if (!firstVisibleTarget) firstVisibleTarget = el.getAttribute("data-media-id") || "";
      } else {
        el.classList.remove("vf-visible");
        el.style.display = "none";
      }
    }
    var thumbItems = document.querySelectorAll(".thumbnail-list__item[data-target]");
    for (var t = 0; t < thumbItems.length; t++) {
      var tel = thumbItems[t];
      var thumbNum = tel.getAttribute("data-target").split("-").pop();
      var showThumb = !hasMapping || allowedNumericIds.indexOf(thumbNum) !== -1;
      if (showThumb) { tel.classList.add("vf-visible"); tel.style.display = ""; }
      else { tel.classList.remove("vf-visible"); tel.style.display = "none"; }
    }
    if (firstVisibleTarget) {
      var btn = document.querySelector('.thumbnail-list__item[data-target="' + firstVisibleTarget + '"] button');
      if (btn) setTimeout(function () { btn.click(); }, 80);
    }
  }
  function patchInput(input) {
    if (!input || input.__vfPatched) return;
    input.__vfPatched = true;
    try {
      var proto = Object.getPrototypeOf(input);
      var desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) {
        var orig = desc.set;
        Object.defineProperty(input, "value", {
          configurable: true, get: desc.get,
          set: function (v) { orig.call(this, v); filterImages(); }
        });
      }
    } catch (e) {}
  }
  function waitForGallery(cb) {
    if (document.querySelector(".product__media-item[id]")) { cb(); return; }
    var obs = new MutationObserver(function () {
      if (document.querySelector(".product__media-item[id]")) { obs.disconnect(); cb(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  function init() {
    waitForGallery(filterImages);
    document.addEventListener("variant:change", function () { setTimeout(filterImages, 80); });
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t) return;
      var name = t.getAttribute ? t.getAttribute("name") : "";
      if (name === "id" || t.type === "radio" || t.tagName === "SELECT") setTimeout(filterImages, 80);
    });
    patchInput(document.querySelector('input[name="id"]'));
    var dw = new MutationObserver(function () {
      var inp = document.querySelector('input[name="id"]');
      if (inp) patchInput(inp);
    });
    dw.observe(document.body, { childList: true, subtree: true });
    var last = getVariantId();
    setInterval(function () {
      var cur = getVariantId();
      if (cur && cur !== last) { last = cur; filterImages(); }
    }, 300);
    window.addEventListener("popstate", filterImages);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());`;

const FILTER_CSS = `
.template-product .product__media-item,
.template-product .thumbnail-list__item {
  display: none !important;
}
.template-product .product__media-item.vf-visible {
  display: block !important;
}
.template-product .thumbnail-list__item.vf-visible {
  display: list-item !important;
}
`;

const LIQUID_SNIPPET = `{% if template.name == 'product' %}
  {% assign vf_meta = product.metafields.custom.variant_image_config %}
  <script>
    window.__PRODUCT_ID__ = {{ product.id | json }};
    (function () {
      try {
        var raw = {{ vf_meta.value | json }};
        var parsed = (typeof raw === "string") ? JSON.parse(raw) : raw;
        window.__VARIANT_CONFIG__ = Array.isArray(parsed) ? parsed : [];
      } catch(e) { window.__VARIANT_CONFIG__ = []; }
    }());
  </script>
  <link rel="stylesheet" href="{{ 'variant-filter.css' | asset_url }}">
  <script src="{{ 'variant-filter.js' | asset_url }}"></script>
{% endif %}`;

const VF_BEGIN = "<!-- variant-filter:begin -->";
const VF_END   = "<!-- variant-filter:end -->";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    // 1. Get active theme via GraphQL
    const themeRes  = await admin.graphql(`{
      themes(first: 20, roles: [MAIN]) {
        nodes { id name role }
      }
    }`);
    const themeData = await themeRes.json();
    console.log("[SETUP] themes:", JSON.stringify(themeData));

    const themes    = themeData.data?.themes?.nodes || [];
    const mainTheme = themes[0];

    if (!mainTheme) {
      return json({ error: "No active theme found" }, { status: 404 });
    }

    const themeId = mainTheme.id;
    console.log("[SETUP] themeId:", themeId);

    // 2. Upload JS
    const jsRes = await admin.graphql(`
      mutation {
        themeFilesUpsert(themeId: "${themeId}", files: [{
          filename: "assets/variant-filter.js",
          body: { type: TEXT, value: ${JSON.stringify(FILTER_JS)} }
        }]) {
          upsertedThemeFiles { filename }
          userErrors { filename message }
        }
      }
    `);
    const jsData = await jsRes.json();
    console.log("[SETUP] JS upload:", JSON.stringify(jsData));

    // 3. Upload CSS
    const cssRes = await admin.graphql(`
      mutation {
        themeFilesUpsert(themeId: "${themeId}", files: [{
          filename: "assets/variant-filter.css",
          body: { type: TEXT, value: ${JSON.stringify(FILTER_CSS)} }
        }]) {
          upsertedThemeFiles { filename }
          userErrors { filename message }
        }
      }
    `);
    const cssData = await cssRes.json();
    console.log("[SETUP] CSS upload:", JSON.stringify(cssData));

    // 4. Read theme.liquid
    const readRes  = await admin.graphql(`{
      theme(id: "${themeId}") {
        files(filenames: ["layout/theme.liquid"]) {
          nodes {
            filename
            body { ... on OnlineStoreThemeFileBodyText { content } }
          }
        }
      }
    }`);
    const readData = await readRes.json();
    console.log("[SETUP] read theme.liquid:", JSON.stringify(readData).substring(0, 200));

    let themeContent = readData.data?.theme?.files?.nodes?.[0]?.body?.content || "";

    if (!themeContent) {
      return json({ error: "Could not read theme.liquid" }, { status: 500 });
    }

    // 5. Remove old injection
    const oldStart = themeContent.indexOf(VF_BEGIN);
    const oldEnd   = themeContent.indexOf(VF_END);
    if (oldStart !== -1 && oldEnd !== -1) {
      themeContent =
        themeContent.substring(0, oldStart) +
        themeContent.substring(oldEnd + VF_END.length);
    }

    // 6. Inject before </body>
    const injection = "\n" + VF_BEGIN + "\n" + LIQUID_SNIPPET + "\n" + VF_END + "\n";
    if (themeContent.includes("</body>")) {
      themeContent = themeContent.replace("</body>", injection + "</body>");
    } else {
      themeContent += injection;
    }

    // 7. Save theme.liquid
    const saveRes = await admin.graphql(`
      mutation {
        themeFilesUpsert(themeId: "${themeId}", files: [{
          filename: "layout/theme.liquid",
          body: { type: TEXT, value: ${JSON.stringify(themeContent)} }
        }]) {
          upsertedThemeFiles { filename }
          userErrors { filename message }
        }
      }
    `);
    const saveData = await saveRes.json();
    console.log("[SETUP] save theme.liquid:", JSON.stringify(saveData));

    const saveErrors = saveData.data?.themeFilesUpsert?.userErrors || [];
    if (saveErrors.length > 0) {
      return json({ error: saveErrors.map(e => e.message).join(", ") }, { status: 400 });
    }

    return json({ success: true, theme: mainTheme.name });

  } catch (err) {
    console.error("[SETUP] error:", err);
    return json({ error: err.message }, { status: 500 });
  }
};