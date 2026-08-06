export interface KnowledgeQueryPlan {
  readonly normalizedQuery: string;
  readonly semanticQuery: string;
  readonly lexicalTerms: readonly string[];
  readonly signals: readonly string[];
}

interface DomainExpansion {
  readonly signal: string;
  readonly pattern: RegExp;
  readonly terms: readonly string[];
}

const domainExpansions: readonly DomainExpansion[] = [
  {
    signal: "returns",
    pattern: /退货|换货|退换|七天|无理由|能退/u,
    terms: ["退货", "签收", "自然日"],
  },
  { signal: "quality", pattern: /质量|坏了|故障|不能用|售后/u, terms: ["质量", "故障", "售后"] },
  {
    signal: "shipping",
    pattern: /配送|快递|物流|发货|出库|送达/u,
    terms: ["配送", "出库", "送达"],
  },
  { signal: "invoice", pattern: /发票|开票/u, terms: ["发票", "订单详情"] },
  { signal: "pickup", pattern: /上门|取件|取货/u, terms: ["上门取件", "取件费"] },
  { signal: "packaging", pattern: /环保|包装|填充物/u, terms: ["环保", "填充物"] },
  { signal: "night_delivery", pattern: /夜间|定时配送/u, terms: ["夜间", "定时配送"] },
];

const stopWords = new Set(["什么", "怎么", "如何", "是否", "可以", "能够", "一下", "商品"]);

/** Deterministic query understanding: normalize, detect domain signals and expand terms. */
export class KnowledgeQueryPlanner {
  plan(input: string): KnowledgeQueryPlan {
    const normalizedQuery = normalizeQuery(input);
    const terms = segmentedTerms(normalizedQuery);
    const signals: string[] = [];
    const expansionTerms: string[] = [];
    for (const expansion of domainExpansions) {
      if (expansion.pattern.test(normalizedQuery)) {
        signals.push(expansion.signal);
        expansionTerms.push(...expansion.terms);
      }
    }
    const lexicalTerms = unique([...expansionTerms, ...terms]).slice(0, 12);
    const semanticExpansion = expansionTerms.filter((term) => !normalizedQuery.includes(term));
    return {
      normalizedQuery,
      semanticQuery: unique([normalizedQuery, ...semanticExpansion]).join(" "),
      lexicalTerms,
      signals,
    };
  }
}

function normalizeQuery(input: string): string {
  const normalized = [...input.normalize("NFKC")]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? " " : character;
    })
    .join("")
    .replace(/[，。！？、；：,.!?;:()（）[\]{}<>《》“”'"`~]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (normalized.length === 0 || [...normalized].length > 500) {
    throw new Error("Knowledge query must contain 1 to 500 characters.");
  }
  return normalized;
}

function segmentedTerms(input: string): string[] {
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
  const terms: string[] = [];
  for (const segment of segmenter.segment(input)) {
    const value = segment.segment.trim().toLocaleLowerCase("zh-CN");
    if (
      segment.isWordLike &&
      !stopWords.has(value) &&
      ([...value].length >= 2 || /^[A-Za-z0-9][A-Za-z0-9._-]+$/u.test(value))
    ) {
      terms.push(value);
    }
  }
  return terms;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
