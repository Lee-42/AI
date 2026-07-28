import { z } from "zod";

const StableIdPartSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "must use lowercase letters, digits, and internal hyphens"
  );

const HttpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "must use http or https");

export const ProductImageSchema = z.object({
  sku: StableIdPartSchema,
  imageRole: StableIdPartSchema,
  imageUrl: HttpUrlSchema,
  visualDescription: z.string().trim().min(1),
  sourcePage: HttpUrlSchema,
  author: z.string().trim().min(1),
  license: z.string().trim().min(1)
});

export type ProductImage = z.infer<typeof ProductImageSchema>;

export type ProductImageMetadata = {
  recordType: "product-image";
  sku: string;
  imageRole: string;
  visualDescription: string;
  sourcePage: string;
  author: string;
  license: string;
  embeddingModel: string;
  vectorDimension: number;
  contentVersion: number;
};

export type ProductImageRecord = {
  id: string;
  uri: string;
  document: string;
  metadata: Omit<
    ProductImageMetadata,
    "embeddingModel" | "vectorDimension"
  >;
};
