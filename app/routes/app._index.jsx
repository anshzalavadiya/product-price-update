import {
  Page,
  Card,
  Button,
  BlockStack,
  Checkbox,
  InlineStack,
  Text,
  Banner,
  Badge,
} from "@shopify/polaris";
import { useEffect, useState } from "react";

export default function AppIndex() {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState("");
  const [images, setImages] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [savedMappings, setSavedMappings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [setupStatus, setSetupStatus] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
  }

  async function loadProductData(productId) {
    setSelectedProduct(productId);
    setSelectedVariant("");
    setSelectedImages([]);
    setErrorMsg("");
    setSuccessMsg("");
    setSavedMappings([]);

    if (!productId) return;

    const res = await fetch(`/api/product-data?productId=${productId}`);
    const data = await res.json();

    setVariants(Array.isArray(data.variants) ? data.variants : []);
    setImages(Array.isArray(data.images) ? data.images : []);

    await loadMappings(productId);
  }

  async function loadMappings(productId) {
    const pid = productId || selectedProduct;
    if (!pid) return;

    const res = await fetch(`/api/get-variant-config?productId=${pid}`);
    const data = await res.json();
    setSavedMappings(Array.isArray(data) ? data : []);
  }

  function onVariantSelect(variantId) {
    setSelectedVariant(variantId);
    setErrorMsg("");
    setSuccessMsg("");

    const existing = savedMappings.find(m => m.variantId === variantId);
    setSelectedImages(existing ? existing.imageIds : []);
  }

  function toggleImage(id) {
    setSelectedImages(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  async function saveMapping() {
    if (!selectedVariant || selectedImages.length === 0) {
      setErrorMsg("Please select a variant and at least one image.");
      return;
    }

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const variant = variants.find(v => v.id === selectedVariant);
    const selectedImageObjects = images.filter(img =>
      selectedImages.includes(img.id)
    );

    const res = await fetch("/api/save-variant-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: selectedProduct,
        variantId: selectedVariant,
        variantTitle: variant?.title ?? "",
        imageIds: selectedImages,
        images: selectedImageObjects,
      }),
    });

    const result = await res.json();
    setSaving(false);

    if (result.success) {
      setSuccessMsg(`Mapping saved for "${variant?.title}"!`);
      setSelectedVariant("");
      setSelectedImages([]);
      await loadMappings(selectedProduct);
    } else {
      setErrorMsg(result.error || result.errors?.[0]?.message || "Something went wrong.");
    }
  }

  async function deleteMapping(mapping) {
    const res = await fetch("/api/save-variant-config", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: mapping.productId,
        variantId: mapping.variantId,
      }),
    });
    const result = await res.json();
    if (result.success) {
      await loadMappings(selectedProduct);
    }
  }

  function startEdit(mapping) {
    setSelectedVariant(mapping.variantId);
    setSelectedImages(mapping.imageIds || []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resolveImages(mapping) {
    if (Array.isArray(mapping.images) && mapping.images.length > 0) {
      return mapping.images;
    }
    return (mapping.imageIds || [])
      .map(id => images.find(i => i.id === id))
      .filter(Boolean);
  }

  async function setupTheme() {
    setSetupLoading(true);
    setSetupStatus("");
    try {
      const res = await fetch("/api/setup-theme", { method: "POST" });
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

  return (
    <Page title="Variant Image Mapping">

      {/* ── Theme Setup Card ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: "20px" }}>
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Step 0 — Install Filter into Your Theme
            </Text>
            <Text as="p" tone="subdued">
              Click the button below once to automatically install the variant
              image filter into your active theme. No code editing required.
              If you switch themes, click it again.
            </Text>

            {setupStatus === "success" && (
              <Banner tone="success" onDismiss={() => setSetupStatus("")}>
                Theme setup complete! The variant image filter is now active on
                your storefront.
              </Banner>
            )}
            {setupStatus.startsWith("error:") && (
              <Banner tone="critical" onDismiss={() => setSetupStatus("")}>
                Setup failed: {setupStatus.replace("error:", "")}
              </Banner>
            )}

            <div>
              <Button
                variant="primary"
                onClick={setupTheme}
                loading={setupLoading}
              >
                Install Filter into Theme
              </Button>
            </div>
          </BlockStack>
        </Card>
      </div>

      {/* ── Success / Error banners ──────────────────────────────────────── */}
      {successMsg && (
        <div style={{ marginBottom: "15px" }}>
          <Banner tone="success" onDismiss={() => setSuccessMsg("")}>
            {successMsg}
          </Banner>
        </div>
      )}
      {errorMsg && (
        <div style={{ marginBottom: "15px" }}>
          <Banner tone="critical" onDismiss={() => setErrorMsg("")}>
            {errorMsg}
          </Banner>
        </div>
      )}

      {/* ── Mapping Card ─────────────────────────────────────────────────── */}
      <Card>
        <BlockStack gap="500">

          {/* Step 1 — Product */}
          <div>
            <Text variant="headingMd" as="h3">Step 1 — Select Product</Text>
            <select
              value={selectedProduct}
              onChange={e => loadProductData(e.target.value)}
              style={{
                padding: "10px",
                width: "300px",
                borderRadius: "8px",
                marginTop: "10px",
                border: "1px solid #c9cccf",
              }}
            >
              <option value="">— Select a product —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          {/* Step 2 — Variant */}
          {variants.length > 0 && (
            <div>
              <Text variant="headingMd" as="h3">Step 2 — Select Variant</Text>
              <select
                value={selectedVariant}
                onChange={e => onVariantSelect(e.target.value)}
                style={{
                  padding: "10px",
                  width: "300px",
                  borderRadius: "8px",
                  marginTop: "10px",
                  border: "1px solid #c9cccf",
                }}
              >
                <option value="">— Select a variant —</option>
                {variants.map(v => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
              </select>
              {selectedVariant && savedMappings.find(m => m.variantId === selectedVariant) && (
                <div style={{ marginTop: "8px" }}>
                  <Badge tone="success">Already has a saved mapping</Badge>
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Images */}
          {selectedVariant && images.length > 0 && (
            <div>
              <Text variant="headingMd" as="h3">
                Step 3 — Select Images for this Variant
              </Text>
              <Text as="p" tone="subdued">
                {selectedImages.length} of {images.length} selected.
                Same image can be used in multiple variants.
              </Text>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: "12px",
                marginTop: "15px",
              }}>
                {images.map(image => {
                  const isSelected = selectedImages.includes(image.id);
                  return (
                    <div
                      key={image.id}
                      onClick={() => toggleImage(image.id)}
                      style={{
                        cursor: "pointer",
                        borderRadius: "10px",
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
                        }}>✓</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Save button */}
          {selectedVariant && (
            <div>
              <Button
                variant="primary"
                onClick={saveMapping}
                loading={saving}
                disabled={selectedImages.length === 0}
              >
                Save Mapping
              </Button>
            </div>
          )}

        </BlockStack>
      </Card>

      {/* ── Saved mappings ───────────────────────────────────────────────── */}
      {savedMappings.length > 0 && (
        <div style={{ marginTop: "30px" }}>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">
                Current Variant Image Assignments
              </Text>

              {savedMappings.map((mapping, index) => {
                const resolvedImgs = resolveImages(mapping);
                return (
                  <details
                    key={mapping.variantId || index}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "10px",
                      padding: "15px",
                      background: "#fafafa",
                    }}
                  >
                    <summary style={{
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: "16px",
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}>
                      ▶ {mapping.variantTitle}
                      <span style={{
                        fontWeight: "400",
                        color: "#666",
                        fontSize: "14px",
                      }}>
                        ({resolvedImgs.length} images)
                      </span>
                    </summary>

                    <div style={{ marginTop: "15px" }}>
                      {resolvedImgs.length === 0 ? (
                        <Text tone="subdued">
                          No images found. Re-save this mapping to fix.
                        </Text>
                      ) : (
                        <InlineStack gap="300" wrap>
                          {resolvedImgs.map(img => (
                            <img
                              key={img.id}
                              src={img.url}
                              width="90"
                              style={{
                                borderRadius: "10px",
                                border: "1px solid #e1e3e5",
                              }}
                            />
                          ))}
                        </InlineStack>
                      )}

                      <div style={{
                        marginTop: "15px",
                        display: "flex",
                        gap: "10px",
                      }}>
                        <Button onClick={() => startEdit(mapping)}>Edit</Button>
                        <Button
                          tone="critical"
                          onClick={() => deleteMapping(mapping)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </details>
                );
              })}
            </BlockStack>
          </Card>
        </div>
      )}

    </Page>
  );
}