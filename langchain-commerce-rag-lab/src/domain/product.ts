import { z } from "zod";

const SpecificationValue = z.union([
  z.string(),
  z.number(),
  z.boolean()
]);

export const ProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  brand: z.string().min(1),
  price: z.number().nonnegative(),
  inStock: z.boolean(),
  description: z.string().min(1),
  useCases: z.array(z.string().min(1)),
  specifications: z.record(z.string(), SpecificationValue),
  imageUrl: z.string().url().nullable().default(null),
  manualPath: z.string().min(1).nullable().default(null)
});

export type Product = z.infer<typeof ProductSchema>;
