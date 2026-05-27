import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) return json([]);

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
  const val = data.data.product?.metafield?.value;

  try {
    return json(val ? JSON.parse(val) : []);
  } catch {
    return json([]);
  }
};