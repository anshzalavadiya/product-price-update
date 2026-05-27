import {
  Page,
  Card,
  Button,
  BlockStack,
  TextField,
  Checkbox,
  InlineStack,
  Text
} from "@shopify/polaris";

import { useEffect, useState } from "react";

export default function VariantConfig() {

  const [variantName, setVariantName] =
    useState("");

  const [images, setImages] =
    useState([]);

  const [selectedImages, setSelectedImages] =
    useState([]);

  useEffect(() => {

    loadProductImages();

  }, []);

  async function loadProductImages() {

    try {

      const response = await fetch(
        "/api/get-product-images"
      );

      const data = await response.json();

      setImages(data);

      console.log(data);

    } catch (error) {

      console.log(error);

    }

  }

  function toggleImage(id) {

    if (selectedImages.includes(id)) {

      setSelectedImages(
        selectedImages.filter(
          item => item !== id
        )
      );

    } else {

      setSelectedImages([
        ...selectedImages,
        id
      ]);

    }

  }

  async function saveConfig() {

    const response = await fetch(
      "/api/save-variant-config",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          variantName,
          imageIds: selectedImages
        })
      }
    );

    const data =
      await response.json();

    console.log(data);

    alert("Saved");

  }

  return (

    <Page title="Variant Image Mapping">

      <Card>

        <BlockStack gap="400">

          <TextField
            label="Variant Combination"
            value={variantName}
            onChange={setVariantName}
            placeholder="Rose Gold + Round"
          />

          <Text variant="headingMd" as="h3">
            Product Images
          </Text>

          <InlineStack gap="400">

            {images.map(image => (

              <div
                key={image.id}
                style={{
                  width: "120px"
                }}
              >

                <img
                  src={image.url}
                  width="100%"
                  style={{
                    borderRadius: "10px"
                  }}
                />

                <Checkbox
                  label="Select"
                  checked={
                    selectedImages.includes(
                      image.id
                    )
                  }

                  onChange={() =>
                    toggleImage(image.id)
                  }
                />

              </div>

            ))}

          </InlineStack>

          <Button
            variant="primary"
            onClick={saveConfig}
          >
            Save Mapping
          </Button>

        </BlockStack>

      </Card>

    </Page>

  );
}