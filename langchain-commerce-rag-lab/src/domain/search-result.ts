export type SearchMetadata = Record<string, string | number | boolean>;

export type SearchHit = {
  id: string;
  content: string;
  distance: number;
  relevanceScore?: number;
  metadata: SearchMetadata;
  uri?: string;
};
