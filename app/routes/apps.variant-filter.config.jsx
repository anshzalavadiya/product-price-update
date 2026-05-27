import { json } from "@remix-run/node";

export const loader = async ({ request }) => {
  const url    = new URL(request.url);
  const handle = url.searchParams.get("handle");
  const shop   = url.searchParams.get("shop");

  console.log("[VF-PROXY] handle:", handle, "shop:", shop);

  if (!handle || !shop) {
    return json({ productId: null, configs: [] });
  }

  try {
    const { unauthenticated } = await import("../shopify.server");
    const { admin } = await unauthenticated.admin(shop);

    const res = await admin.graphql(`
      query GetProduct($handle: String!) {
        productByHandle(handle: $handle) {
          id
          metafield(namespace: "custom", key: "variant_image_config") {
            value
          }
        }
      }
    `, { variables: { handle } });

    const data    = await res.json();
    const product = data.data?.productByHandle;

    if (!product) return json({ productId: null, configs: [] });

    let configs = [];
    try {
      const raw = product.metafield?.value;
      if (raw) configs = JSON.parse(raw);
    } catch {}

    const productId = product.id.split("/").pop();

    return json(
      { productId, configs },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );

  } catch (err) {
    console.error("[VF-PROXY] error:", err);
    return json({ productId: null, configs: [] });
  }
};