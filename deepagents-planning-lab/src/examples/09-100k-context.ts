type CorpusFile = {
  path: string;
  content: string;
};

type CorpusChunk = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
};

type CoverageItem = {
  chunkId: string;
  path: string;
  startLine: number;
  endLine: number;
  status: "completed";
};

type RiskFinding = {
  riskId: string;
  severity: string;
  owner: string;
  mitigation: string;
  sourcePath: string;
  sourceLine: number;
};

const CHAPTER_COUNT = 10;
const LINES_PER_CHAPTER = 240;
const CHUNK_LINES = 50;
const OVERLAP_LINES = 2;

const PLANTED_RISKS = [
  [1, 37, "RISK-01", "P1", "支付平台", "启用幂等重试"],
  [1, 193, "RISK-02", "P2", "订单平台", "补齐状态机告警"],
  [2, 119, "RISK-03", "P1", "身份平台", "缩短令牌刷新窗口"],
  [3, 48, "RISK-04", "P2", "库存平台", "增加库存对账任务"],
  [4, 207, "RISK-05", "P0", "结算平台", "阻断异常结算批次"],
  [5, 96, "RISK-06", "P2", "通知平台", "切换备用短信通道"],
  [6, 144, "RISK-07", "P1", "网关平台", "限制异常请求速率"],
  [7, 52, "RISK-08", "P2", "搜索平台", "重建商品搜索索引"],
  [8, 222, "RISK-09", "P1", "会员平台", "修复等级回算任务"],
  [9, 76, "RISK-10", "P2", "履约平台", "增加超时补偿扫描"],
  [9, 198, "RISK-11", "P1", "风控平台", "升级规则缓存版本"],
  [10, 131, "RISK-12", "P2", "数据平台", "校验增量同步游标"]
] as const;

function riskLine(chapter: number, line: number): string | undefined {
  const risk = PLANTED_RISKS.find(
    ([riskChapter, riskLineNumber]) =>
      riskChapter === chapter && riskLineNumber === line
  );
  if (!risk) return undefined;

  const [, , riskId, severity, owner, mitigation] = risk;
  return `第${line}条记录：【风险:${riskId}】【等级:${severity}】【负责人:${owner}】【措施:${mitigation}】该风险必须进入发布审查清单并保留来源位置。`;
}

function createCorpus(): CorpusFile[] {
  return Array.from({ length: CHAPTER_COUNT }, (_, chapterIndex) => {
    const chapter = chapterIndex + 1;
    const lines = Array.from({ length: LINES_PER_CHAPTER }, (_, lineIndex) => {
      const line = lineIndex + 1;
      return (
        riskLine(chapter, line) ??
        `第${line}条记录：第${chapter}章系统运行稳定，订单链路、身份验证、库存同步、通知服务和数据管道均已完成例行检查，当前没有需要升级处理的异常。`
      );
    });

    return {
      path: `/corpus/chapter-${chapter.toString().padStart(2, "0")}.md`,
      content: [`# 第${chapter}章运行审查`, "", ...lines].join("\n")
    };
  });
}

function splitCorpus(files: CorpusFile[]): CorpusChunk[] {
  const step = CHUNK_LINES - OVERLAP_LINES;

  return files.flatMap((file) => {
    const lines = file.content.split("\n");
    const chunks: CorpusChunk[] = [];

    for (let start = 0, index = 0; start < lines.length; start += step, index++) {
      const selected = lines.slice(start, start + CHUNK_LINES);
      chunks.push({
        id: `${file.path}#chunk-${index.toString().padStart(2, "0")}`,
        path: file.path,
        startLine: start + 1,
        endLine: start + selected.length,
        content: selected.join("\n")
      });

      if (start + CHUNK_LINES >= lines.length) break;
    }

    return chunks;
  });
}

function mapChunk(chunk: CorpusChunk): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const lines = chunk.content.split("\n");
  const pattern =
    /【风险:(RISK-\d{2})】【等级:([^】]+)】【负责人:([^】]+)】【措施:([^】]+)】/g;

  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(pattern)) {
      const [, riskId, severity, owner, mitigation] = match;
      if (!riskId || !severity || !owner || !mitigation) continue;

      findings.push({
        riskId,
        severity,
        owner,
        mitigation,
        sourcePath: chunk.path,
        sourceLine: chunk.startLine + index
      });
    }
  }

  return findings;
}

function reduceFindings(findings: RiskFinding[]): RiskFinding[] {
  const unique = new Map<string, RiskFinding>();

  for (const finding of findings) {
    const existing = unique.get(finding.riskId);
    if (
      existing &&
      (existing.severity !== finding.severity ||
        existing.owner !== finding.owner ||
        existing.mitigation !== finding.mitigation)
    ) {
      throw new Error(`风险 ${finding.riskId} 在重叠块中出现矛盾。`);
    }

    unique.set(finding.riskId, existing ?? finding);
  }

  return [...unique.values()].sort((left, right) =>
    left.riskId.localeCompare(right.riskId)
  );
}

function createEvidenceIndex(findings: RiskFinding[]): string {
  return [
    "# 10 万字语料风险索引",
    "",
    ...findings.map(
      (finding) =>
        `- ${finding.riskId} | ${finding.severity} | ${finding.owner} | ${finding.mitigation} | ${finding.sourcePath}:${finding.sourceLine}`
    )
  ].join("\n");
}

function createCoverageLedger(items: CoverageItem[]): string {
  return JSON.stringify(
    {
      total: items.length,
      completed: items.filter((item) => item.status === "completed").length,
      items
    },
    null,
    2
  );
}

async function main() {
  const files = createCorpus();
  const chunks = splitCorpus(files);
  const coverage: CoverageItem[] = [];
  const mappedFindings: RiskFinding[] = [];

  // 生产环境中，这个 map 步骤可以由模型或多个子 Agent 执行；实验用确定性解析器离线模拟。
  for (const chunk of chunks) {
    mappedFindings.push(...mapChunk(chunk));
    coverage.push({
      chunkId: chunk.id,
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      status: "completed"
    });
  }

  const findings = reduceFindings(mappedFindings);
  const evidenceIndex = createEvidenceIndex(findings);
  const coverageLedger = createCoverageLedger(coverage);
  const corpusCharacters = files.reduce(
    (total, file) => total + file.content.length,
    0
  );
  const maxChunkCharacters = Math.max(
    ...chunks.map((chunk) => chunk.content.length)
  );

  if (corpusCharacters < 100_000) {
    throw new Error(`语料不足 10 万字：${corpusCharacters}`);
  }
  if (coverage.some((item) => item.status !== "completed")) {
    throw new Error("仍有未处理的语料块。即使已经找到风险，也不能提前结束全覆盖任务。");
  }
  if (findings.length !== PLANTED_RISKS.length) {
    throw new Error(
      `风险召回不完整：预期 ${PLANTED_RISKS.length}，实际 ${findings.length}`
    );
  }
  for (const [, , riskId] of PLANTED_RISKS) {
    if (!evidenceIndex.includes(riskId)) {
      throw new Error(`风险索引缺少 ${riskId}`);
    }
  }

  const virtualArtifacts = {
    "/workspace/index/risk-index.md": evidenceIndex,
    "/workspace/index/coverage-ledger.json": coverageLedger
  };

  console.log("09 10 万字上下文处理实验");
  console.log(`语料文件：${files.length} 份`);
  console.log(`语料字符量：${corpusCharacters.toLocaleString()}`);
  console.log(`切分块数：${chunks.length}`);
  console.log(`覆盖进度：${coverage.length}/${chunks.length}`);
  console.log(`最大单块字符量：${maxChunkCharacters.toLocaleString()}`);
  console.log(
    `最大单块 / 全部语料：${((maxChunkCharacters / corpusCharacters) * 100).toFixed(2)}%`
  );
  console.log(`原始命中：${mappedFindings.length}（包含重叠块重复）`);
  console.log(`去重风险：${findings.length}/${PLANTED_RISKS.length}`);
  console.log("模型 API 调用：0（离线架构实验）");
  console.log("\n虚拟产物");
  for (const [path, content] of Object.entries(virtualArtifacts)) {
    console.log(`- ${path}：${content.length.toLocaleString()} 字符`);
  }
  console.log("\n风险索引");
  console.log(evidenceIndex);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
