export const MINIMAL_VECTOR_RECORDS = [
  {
    id: "east",
    document: "正东方向",
    embedding: [1, 0] as const,
    metadata: { direction: "east" }
  },
  {
    id: "northeast",
    document: "东北方向",
    embedding: [1, 1] as const,
    metadata: { direction: "northeast" }
  },
  {
    id: "north",
    document: "正北方向",
    embedding: [0, 1] as const,
    metadata: { direction: "north" }
  }
] as const;

export const MINIMAL_QUERY_VECTOR = [1, 0] as const;
