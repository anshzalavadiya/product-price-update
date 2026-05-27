import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {

  const { admin } = await authenticate.admin(request);

  // Check metafield exists
  const res = await admin.graphql(`
    {
      shop {
        id
        metafield(
          namespace: "variant_image_map"
          key: "configs"
        ) {
          id
          value
          updatedAt
        }
      }
    }
  `);

  const data = await res.json();
  console.log("DEBUG metafield:", JSON.stringify(data, null, 2));

  return json(data);

};