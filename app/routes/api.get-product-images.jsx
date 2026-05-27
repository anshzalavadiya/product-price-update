import { json } from "@remix-run/node";
import {
  useLoaderData,
  useFetcher,
  useSearchParams,
} from "@remix-run/react";
import {
  Page, Card, BlockStack, InlineStack,
  Text, Button, Select,
  Badge, Banner,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";

// ─────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url       = new URL(request.url);
  const productId = url.searchParams.get("productId");

  const listRes  = await admin.graphql(`{
    products(first: 50) {
      nodes { id title }
    }
  }`);
  const listData = await listRes.json();
  const products = listData.data.products.nodes;

  if (!productId) return json({ products, variants: [], images: [], configs: [] });

  const prodRes  = await admin.graphql(`
    query GetProduct($id: ID!) {
      product(id: $id) {
        variants(first: 50) {
          nodes { id title }
        }
        media(first: 50) {
          nodes {
            ... on MediaImage {
              id
              image { url }
            }
          }
        }
        metafield(namespace: "custom", key: "variant_image_config") {
          value
        }
      }
    }
  `, { variables: { id: productId } });

  const prodData = await prodRes.json();
  const product  = prodData.data.product;

  const variants = product.variants.nodes;
  const images   = product.media.nodes
    .filter(m => m.image)
    .map(m => ({ id: m.id, url: m.image.url }));

  let configs = [];
  try {
    const raw = product.metafield?.value;
    if (raw) configs = JSON.parse(raw);
  } catch {}

  return json({ products, variants, images, configs });
};

// ─────────────────────────────────────────────────────────────
// ACTION — save / delete
// ─────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();

  if (request.method === "POST") {
    const { productId, variantId, variantTitle, imageIds } = body;

    if (!productId || !variantId || !imageIds) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    const existingRes  = await admin.graphql(`
      query GetMeta($id: ID!) {
        product(id: $id) {
          metafield(namespace: "custom", key: "variant_image_config") {
            value
          }
        }
      }
    `, { variables: { id: productId } });
    const existingData = await existingRes.json();

    let configs = [];
    try {
      const raw = existingData.data.product?.metafield?.value;
      if (raw) configs = JSON.parse(raw);
    } catch {}

    const idx       = configs.findIndex(
      c => c.variantId === variantId && c.productId === productId
    );
    const newConfig = { productId, variantId, variantTitle, imageIds };
    if (idx >= 0) configs[idx] = newConfig;
    else configs.push(newConfig);

    const saveRes  = await admin.graphql(`
      mutation SaveMeta($input: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $input) {
          metafields { id }
          userErrors  { field message }
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

    const saveData = await saveRes.json();
    const errors   = saveData.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length > 0) {
      return json({ error: errors.map(e => e.message).join(", ") }, { status: 400 });
    }

    return json({ success: true, configs });
  }

  if (request.method === "DELETE") {
    const { productId, variantId } = body;

    const existingRes  = await admin.graphql(`
      query GetMeta($id: ID!) {
        product(id: $id) {
          metafield(namespace: "custom", key: "variant_image_config") {
            value
          }
        }
      }
    `, { variables: { id: productId } });
    const existingData = await existingRes.json();

    let configs = [];
    try {
      const raw = existingData.data.product?.metafield?.value;
      if (raw) configs = JSON.parse(raw);
    } catch {}

    configs = configs.filter(
      c => !(c.variantId === variantId && c.productId === productId)
    );

    await admin.graphql(`
      mutation SaveMeta($input: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $input) {
          metafields { id }
          userErrors  { field message }
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

    return json({ success: true, configs });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

// ─────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────
export default function VariantImageMapping() {
  const { products, variants, images, configs } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();

  const selectedProductId = searchParams.get("productId") || "";
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedImageIds, setSelectedImageIds]   = useState([]);
  const [savedBanner, setSavedBanner]             = useState(false);

  // Theme setup state
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupStatus, setSetupStatus]   = useState("");

  useEffect(() => {
    if (!selectedVariantId) { setSelectedImageIds([]); return; }
    const existing = configs.find(
      c => c.variantId === selectedVariantId && c.productId === selectedProductId
    );
    setSelectedImageIds(existing?.imageIds ?? []);
  }, [selectedVariantId, configs, selectedProductId]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 3000);
    }
  }, [fetcher.state, fetcher.data]);

  const handleProductChange = useCallback((value) => {
    setSearchParams({ productId: value });
    setSelectedVariantId("");
    setSelectedImageIds([]);
  }, [setSearchParams]);

  const toggleImage = useCallback((id) => {
    setSelectedImageIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!selectedProductId || !selectedVariantId) return;
    const variant = variants.find(v => v.id === selectedVariantId);
    fetcher.submit(
      {
        productId:    selectedProductId,
        variantId:    selectedVariantId,
        variantTitle: variant?.title ?? "",
        imageIds:     selectedImageIds,
      },
      { method: "POST", encType: "application/json" }
    );
  }, [selectedProductId, selectedVariantId, selectedImageIds, variants, fetcher]);

  const handleDelete = useCallback(() => {
    if (!selectedProductId || !selectedVariantId) return;
    fetcher.submit(
      { productId: selectedProductId, variantId: selectedVariantId },
      { method: "DELETE", encType: "application/json" }
    );
    setSelectedImageIds([]);
  }, [selectedProductId, selectedVariantId, fetcher]);

  async function setupTheme() {
    setSetupLoading(true);
    setSetupStatus("");
    try {
      const res  = await fetch("/api/setup-theme", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSetupStatus("success");
      } else {
        setSetupStatus("error:" + (data.error || "Unknown error"));
      }
    } catch (e) {
      setSetupStatus("error:" + e.message);
    }
    setSetupLoading(false);
  }

  const productOptions = [
    { label: "— Select a product —", value: "" },
    ...products.map(p => ({ label: p.title, value: p.id })),
  ];
  const variantOptions = [
    { label: "— Select a variant —", value: "" },
    ...variants.map(v => ({ label: v.title, value: v.id })),
  ];

  const isSaving             = fetcher.state !== "idle";
  const currentVariantConfig = configs.find(
    c => c.variantId === selectedVariantId && c.productId === selectedProductId
  );

  return (
    <Page title="Variant Image Filter">
      <BlockStack gap="500">

        {/* ── Theme Setup Card ─────────────────────────────────────────── */}
       <Card>
  <BlockStack gap="300">
    <Text variant="headingMd">✅ Filter is Active</Text>
    <Text as="p" tone="subdued">
      The variant image filter is automatically active on your storefront.
      Just select a product below, pick a variant, choose its images, and save.
      The filter will work instantly on your live store.
    </Text>
  </BlockStack>
</Card>

        {/* ── Save / Error banners ─────────────────────────────────────── */}
        {savedBanner && (
          <Banner tone="success" onDismiss={() => setSavedBanner(false)}>
            Saved successfully! Variant image mapping updated.
          </Banner>
        )}
        {fetcher.data?.error && (
          <Banner tone="critical">
            Error: {fetcher.data.error}
          </Banner>
        )}

        {/* ── Step 1 — Product ─────────────────────────────────────────── */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">Step 1 — Select product</Text>
            <Select
              label="Product"
              options={productOptions}
              value={selectedProductId}
              onChange={handleProductChange}
            />
          </BlockStack>
        </Card>

        {/* ── Step 2 — Variant ─────────────────────────────────────────── */}
        {selectedProductId && (
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">Step 2 — Select variant</Text>
              <Select
                label="Variant"
                options={variantOptions}
                value={selectedVariantId}
                onChange={setSelectedVariantId}
              />
              {currentVariantConfig && (
                <Text tone="subdued">
                  {currentVariantConfig.imageIds.length} image(s) already saved
                  for this variant
                </Text>
              )}
            </BlockStack>
          </Card>
        )}

        {/* ── Step 3 — Images ──────────────────────────────────────────── */}
        {selectedVariantId && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd">
                  Step 3 — Select images to show for this variant
                </Text>
                <Text tone="subdued">
                  {selectedImageIds.length} of {images.length} selected
                </Text>
              </InlineStack>

              {images.length === 0 ? (
                <Text tone="subdued">No images found for this product.</Text>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: "12px",
                }}>
                  {images.map(image => {
                    const isSelected = selectedImageIds.includes(image.id);
                    return (
                      <div
                        key={image.id}
                        onClick={() => toggleImage(image.id)}
                        style={{
                          cursor: "pointer",
                          borderRadius: "8px",
                          border: isSelected
                            ? "3px solid #008060"
                            : "3px solid transparent",
                          outline: isSelected ? "none" : "1px solid #e1e3e5",
                          overflow: "hidden",
                          position: "relative",
                          background: "#f6f6f7",
                        }}
                      >
                        <img
                          src={image.url}
                          alt=""
                          style={{
                            width: "100%",
                            aspectRatio: "1",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        {isSelected && (
                          <div style={{
                            position: "absolute",
                            top: "6px",
                            right: "6px",
                            background: "#008060",
                            borderRadius: "50%",
                            width: "22px",
                            height: "22px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: "13px",
                            fontWeight: "700",
                            lineHeight: 1,
                          }}>✓</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={handleSave}
                  loading={isSaving}
                  disabled={selectedImageIds.length === 0}
                >
                  Save for this variant
                </Button>
                {currentVariantConfig && (
                  <Button
                    tone="critical"
                    onClick={handleDelete}
                    loading={isSaving}
                  >
                    Remove mapping
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* ── Saved configs summary ─────────────────────────────────────── */}
        {selectedProductId && configs.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">Saved mappings for this product</Text>
              {configs.map(c => (
                <InlineStack key={c.variantId} align="space-between">
                  <Text>{c.variantTitle}</Text>
                  <Badge>{c.imageIds.length} images</Badge>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        )}

      </BlockStack>
    </Page>
  );
}