import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    {
      products(first: 50) {
        nodes {
          id
          title
        }
      }
    }
  `);

  const data = await response.json();
  return json(data.data.products.nodes);
};