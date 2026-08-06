import { readFile } from "node:fs/promises";
import { z } from "zod";

const EvaluationQuerySchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  expectedSkus: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string().min(1))
});

export type EvaluationQuery = z.infer<typeof EvaluationQuerySchema>;

export async function loadEvaluationQueries(
  source = new URL("../../data/evaluation-queries.json", import.meta.url)
): Promise<EvaluationQuery[]> {
  const raw = await readFile(source, "utf8");
  const queries = z.array(EvaluationQuerySchema).min(1).parse(JSON.parse(raw));

  if (new Set(queries.map((query) => query.id)).size !== queries.length) {
    throw new Error("Evaluation query IDs must be unique");
  }

  return queries;
}
