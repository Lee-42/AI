import { z } from "zod";

const IdPartSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "ID parts must use lowercase letters, digits, and internal hyphens"
  );

export type VectorRecordId =
  | {
      id: string;
      kind: "product";
      sku: string;
      role: "profile";
    }
  | {
      id: string;
      kind: "manual";
      sku: string;
      role: "chunk";
      chunkIndex: number;
    }
  | {
      id: string;
      kind: "image";
      sku: string;
      role: string;
    };

export type VectorRecordIdAudit = {
  total: number;
  valid: number;
  byKind: Record<VectorRecordId["kind"], number>;
  duplicateIds: string[];
  invalidIds: string[];
};

function idPart(value: string, name: string): string {
  const result = IdPartSchema.safeParse(value);

  if (!result.success) {
    throw new Error(`Invalid ${name}: ${result.error.issues[0]?.message}`);
  }

  return result.data;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }

  return value;
}

export function buildProductRecordId(sku: string): string {
  return `product:${idPart(sku, "SKU")}:profile`;
}

export function buildManualChunkRecordId(
  sku: string,
  chunkIndex: number
): string {
  const normalizedSku = idPart(sku, "SKU");
  const normalizedIndex = positiveInteger(chunkIndex, "Chunk index");

  // 补零让日志和控制台按字符串排序时仍接近自然的切片顺序。
  return (
    `manual:${normalizedSku}:chunk:` +
    String(normalizedIndex).padStart(4, "0")
  );
}

export function buildImageRecordId(
  sku: string,
  imageRole: string
): string {
  return (
    `image:${idPart(sku, "SKU")}:` +
    idPart(imageRole, "image role")
  );
}

export function parseVectorRecordId(id: string): VectorRecordId {
  const parts = id.split(":");

  // 只接受构建函数能够重新生成的规范格式，避免同一身份出现多种写法。
  if (
    parts.length === 3 &&
    parts[0] === "product" &&
    parts[2] === "profile"
  ) {
    const sku = idPart(parts[1] ?? "", "SKU");
    return { id, kind: "product", sku, role: "profile" };
  }

  if (
    parts.length === 4 &&
    parts[0] === "manual" &&
    parts[2] === "chunk" &&
    /^\d{4,}$/.test(parts[3] ?? "")
  ) {
    const sku = idPart(parts[1] ?? "", "SKU");
    const chunkIndex = positiveInteger(
      Number(parts[3]),
      "Chunk index"
    );

    if (buildManualChunkRecordId(sku, chunkIndex) !== id) {
      throw new Error(`Manual chunk ID is not canonical: ${id}`);
    }

    return {
      id,
      kind: "manual",
      sku,
      role: "chunk",
      chunkIndex
    };
  }

  if (parts.length === 3 && parts[0] === "image") {
    const sku = idPart(parts[1] ?? "", "SKU");
    const role = idPart(parts[2] ?? "", "image role");
    return { id, kind: "image", sku, role };
  }

  throw new Error(`Unsupported vector record ID: ${id}`);
}

export function auditVectorRecordIds(
  ids: string[]
): VectorRecordIdAudit {
  const seen = new Set<string>();
  const duplicateIds = new Set<string>();
  const invalidIds = new Set<string>();
  const byKind = {
    product: 0,
    manual: 0,
    image: 0
  };
  let valid = 0;

  ids.forEach((id) => {
    if (seen.has(id)) {
      duplicateIds.add(id);
    }
    seen.add(id);

    try {
      const parsed = parseVectorRecordId(id);
      byKind[parsed.kind] += 1;
      valid += 1;
    } catch {
      invalidIds.add(id);
    }
  });

  return {
    total: ids.length,
    valid,
    byKind,
    duplicateIds: [...duplicateIds].sort(),
    invalidIds: [...invalidIds].sort()
  };
}
