import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  ProductImageSchema,
  type ProductImage,
  type ProductImageRecord
} from "../domain/product-image.js";
import { buildImageRecordId } from "../domain/vector-record-id.js";

export const PRODUCT_IMAGE_CONTENT_VERSION = 1;

export function productImageToRecord(
  image: ProductImage
): ProductImageRecord {
  return {
    id: buildImageRecordId(image.sku, image.imageRole),
    uri: image.imageUrl,
    // document 只用于展示；向量来自真实图片 URI，不是这段文字。
    document: image.visualDescription,
    metadata: {
      recordType: "product-image",
      sku: image.sku,
      imageRole: image.imageRole,
      visualDescription: image.visualDescription,
      sourcePage: image.sourcePage,
      author: image.author,
      license: image.license,
      contentVersion: PRODUCT_IMAGE_CONTENT_VERSION
    }
  };
}

export async function loadProductImageRecords(
  source = new URL("../../data/images.json", import.meta.url)
): Promise<ProductImageRecord[]> {
  const raw = await readFile(source, "utf8");
  const images = z.array(ProductImageSchema).min(1).parse(JSON.parse(raw));
  const records = images.map(productImageToRecord);
  const ids = records.map((record) => record.id);

  if (new Set(ids).size !== ids.length) {
    throw new Error("Product image data contains duplicate IDs");
  }

  return records;
}
