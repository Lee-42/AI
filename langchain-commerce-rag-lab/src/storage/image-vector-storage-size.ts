import type { Collection, Metadata } from "chromadb";

export type StoredImageVectorRecord = {
  id: string;
  embedding: number[];
  document: string;
  metadata: Metadata;
  uri: string;
};

export type ImageVectorStorageReport = {
  id: string;
  dimension: number;
  vectorFloat32Bytes: number;
  vectorJsonBytes: number;
  idBytes: number;
  documentBytes: number;
  metadataJsonBytes: number;
  uriBytes: number;
  logicalPayloadBytes: number;
};

export type ImageVectorStorageSummary = {
  recordCount: number;
  dimension: number;
  totalVectorFloat32Bytes: number;
  totalVectorJsonBytes: number;
  totalLogicalPayloadBytes: number;
  records: ImageVectorStorageReport[];
};

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function requireText(value: string, field: string): string {
  if (value.length === 0) {
    throw new Error(`Stored image ${field} must not be empty`);
  }

  return value;
}

export function analyzeStoredImageVector(
  record: StoredImageVectorRecord
): ImageVectorStorageReport {
  requireText(record.id, "ID");
  requireText(record.document, "document");
  requireText(record.uri, "URI");

  if (
    record.embedding.length === 0 ||
    record.embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      `Stored image ${record.id} embedding must contain finite values`
    );
  }

  const vectorFloat32Bytes =
    record.embedding.length * Float32Array.BYTES_PER_ELEMENT;
  const idBytes = utf8Bytes(record.id);
  const documentBytes = utf8Bytes(record.document);
  const metadataJsonBytes = utf8Bytes(JSON.stringify(record.metadata));
  const uriBytes = utf8Bytes(record.uri);

  return {
    id: record.id,
    dimension: record.embedding.length,
    vectorFloat32Bytes,
    vectorJsonBytes: utf8Bytes(JSON.stringify(record.embedding)),
    idBytes,
    documentBytes,
    metadataJsonBytes,
    uriBytes,
    // 这是逻辑载荷估算，不包含索引、WAL、压缩和数据库页开销。
    logicalPayloadBytes:
      vectorFloat32Bytes +
      idBytes +
      documentBytes +
      metadataJsonBytes +
      uriBytes
  };
}

export function summarizeImageVectorStorage(
  records: StoredImageVectorRecord[]
): ImageVectorStorageSummary {
  if (records.length === 0) {
    throw new Error("Image collection contains no records to inspect");
  }

  const reports = records.map(analyzeStoredImageVector);
  const dimension = reports[0]?.dimension ?? 0;

  reports.forEach((report) => {
    if (report.dimension !== dimension) {
      throw new Error(
        `Stored image ${report.id} has dimension ${report.dimension}; expected ${dimension}`
      );
    }
  });

  return {
    recordCount: reports.length,
    dimension,
    totalVectorFloat32Bytes: reports.reduce(
      (total, report) => total + report.vectorFloat32Bytes,
      0
    ),
    totalVectorJsonBytes: reports.reduce(
      (total, report) => total + report.vectorJsonBytes,
      0
    ),
    totalLogicalPayloadBytes: reports.reduce(
      (total, report) => total + report.logicalPayloadBytes,
      0
    ),
    records: reports
  };
}

export async function inspectImageVectorStorage(
  collection: Collection
): Promise<ImageVectorStorageSummary> {
  const result = await collection.get({
    include: ["embeddings", "documents", "metadatas", "uris"]
  });
  const records = result.rows().map((row) => {
    if (!row.embedding) {
      throw new Error(`Stored image ${row.id} is missing its embedding`);
    }

    if (!row.document) {
      throw new Error(`Stored image ${row.id} is missing its document`);
    }

    if (!row.metadata) {
      throw new Error(`Stored image ${row.id} is missing its metadata`);
    }

    if (!row.uri) {
      throw new Error(`Stored image ${row.id} is missing its URI`);
    }

    return {
      id: row.id,
      embedding: row.embedding,
      document: row.document,
      metadata: row.metadata,
      uri: row.uri
    };
  });

  return summarizeImageVectorStorage(records);
}

export function formatBinaryBytes(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error("Byte count must be a non-negative safe integer");
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kibibytes = bytes / 1024;

  if (kibibytes < 1024) {
    return `${kibibytes.toFixed(2)} KiB`;
  }

  return `${(kibibytes / 1024).toFixed(2)} MiB`;
}
