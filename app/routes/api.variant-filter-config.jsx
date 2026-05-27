import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle");

  if (!handle) return json({ error: "handle required" }, { status: 400 });

  // Get product by handle
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

  const data = await res.json();
  const product = data.data?.productByHandle;

  if (!product) return json({ error: "product not found" }, { status: 404 });

  let configs = [];
  try {
    const raw = product.metafield?.value;
    if (raw) configs = JSON.parse(raw);
  } catch {}

  // Extract numeric product ID from GID
  const productId = product.id.split("/").pop();

  return json({ productId, configs });
};