import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// ─── helpers ────────────────────────────────────────────────────────────────

async function getProductConfigs(admin, productId) {
  const res = await admin.graphql(`
    query GetProductMeta($id: ID!) {
      product(id: $id) {
        metafield(namespace: "custom", key: "variant_image_config") {
          value
        }
      }
    }
  `, { variables: { id: productId } });

  const data = await res.json();
  const val  = data.data.product?.metafield?.value;
  try {
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
}

async function saveProductConfigs(admin, productId, configs) {
  const res = await admin.graphql(`
    mutation SetProductMeta($input: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $input) {
        metafields { id namespace key }
        userErrors  { message field }
      }
    }
  `, {
    variables: {
      input: [{
        ownerId:   productId,
        namespace: "custom",
        key:       "variant_image_config",
        type:      "json",
        value:     JSON.stringify(configs),
      }]
    }
  });

  const data   = await res.json();
  const errors = data.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    console.error("[VF] metafieldsSet userErrors:", errors);
    throw new Error(errors.map(e => e.message).join(", "));
  }

  return data.data.metafieldsSet.metafields;
}

// Make metafield readable by Liquid templates
// Safe to call multiple times — ignores "already exists" errors
async function ensureStorefrontVisible(admin) {
  try {
    const res = await admin.graphql(`
      mutation MakeMetafieldVisible {
        metafieldStorefrontVisibilityCreate(input: {
          namespace: "custom"
          key: "variant_image_config"
          ownerType: PRODUCT
        }) {
          metafieldStorefrontVisibility { id }
          userErrors { field message }
        }
      }
    `);
    const data   = await res.json();
    const errors = data.data?.metafieldStorefrontVisibilityCreate?.userErrors ?? [];
    if (errors.length > 0) {
      // "already exists" is fine — not a real error
      console.log("[VF] storefront visibility note:", errors.map(e => e.message).join(", "));
    } else {
      console.log("[VF] storefront visibility set ✓");
    }
  } catch (e) {
    // Non-fatal — log and continue
    console.warn("[VF] ensureStorefrontVisible failed (non-fatal):", e.message);
  }
}

// ─── action ─────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // POST — save variant→images mapping
  if (request.method === "POST") {
    const body = await request.json();
    const { productId, variantId, variantTitle, imageIds, images } = body;

    if (!productId || !variantId) {
      return json({ error: "productId and variantId are required" }, { status: 400 });
    }

    const configs     = await getProductConfigs(admin, productId);
    const existingIdx = configs.findIndex(
      c => c.variantId === variantId && c.productId === productId
    );

    const newConfig = { productId, variantId, variantTitle, imageIds, images };

    if (existingIdx >= 0) {
      configs[existingIdx] = newConfig;
    } else {
      configs.push(newConfig);
    }

    await saveProductConfigs(admin, productId, configs);

    // Ensure Liquid can read this metafield
    await ensureStorefrontVisible(admin);

    return json({ success: true });
  }

  // DELETE — remove variant mapping
  if (request.method === "DELETE") {
    const body = await request.json();
    const { productId, variantId } = body;

    if (!productId || !variantId) {
      return json({ error: "productId and variantId are required" }, { status: 400 });
    }

    const configs    = await getProductConfigs(admin, productId);
    const newConfigs = configs.filter(
      c => !(c.variantId === variantId && c.productId === productId)
    );

    await saveProductConfigs(admin, productId, newConfigs);
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};