import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) return json({ variants: [], images: [] });

  const response = await admin.graphql(`
    query GetProductData($id: ID!) {
      product(id: $id) {
        variants(first: 50) {
          nodes {
            id
            title
          }
        }
        media(first: 50) {
          nodes {
            ... on MediaImage {
              id
              image { url }
            }
          }
        }
      }
    }
  `, { variables: { id: productId } });

  const data = await response.json();
  const product = data.data.product;

  return json({
    variants: product.variants.nodes,
    images: product.media.nodes
      .filter(m => m.image)
      .map(m => ({ id: m.id, url: m.image.url }))
  });
};