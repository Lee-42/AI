# 案例 06：用选择题训练模型

本目录是课程“06 案例 3：用选择题训练模型”的配套材料。实验目标是使用 Label Studio 为 12 道
单项选择题选择标准答案，再把原始 JSON 导出转换成可供监督微调（SFT）使用的 JSONL。

> 这 12 道题只用于走通数据流程，数量远不足以训练出有用的通用模型。Label Studio 负责组织和
> 标注数据，真正更新模型参数仍需交给训练框架或模型平台。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `multiple-choice-tasks.json` | 导入 Label Studio 的 12 道选择题，不包含标准答案 |
| `labeling-config.xml` | 使用动态选项的单选标注界面 |
| `annotation-guidelines.md` | 单项选择题的判定、退回和质检规范 |
| `label-map.json` | A、B、C、D 四个答案编码 |
| `answer-key.json` | 参考答案、数据集切分和判定理由，不要导入项目 |
| `validate-export.mjs` | 检查导出结构、答案和选项位置分布 |
| `convert-export-to-sft.mjs` | 按切分转换为聊天格式 SFT JSONL |

## 快速开始

1. 在 Label Studio 创建项目 `course-mcq-sft-v1`；
2. 导入 `multiple-choice-tasks.json`，确认生成 12 条任务；
3. 将 `labeling-config.xml` 粘贴到 Labeling Interface；
4. 阅读 `annotation-guidelines.md`，独立完成每道题；
5. 导出原始 JSON，例如保存为 `export.json`；
6. 运行 `node validate-export.mjs export.json`；
7. 分别转换训练集、验证集和测试集。

材料自测命令：

```bash
node validate-export.mjs --self-test
node convert-export-to-sft.mjs --self-test train
```

转换真实导出的数据：

```bash
node convert-export-to-sft.mjs export.json train > train.sft.jsonl
node convert-export-to-sft.mjs export.json validation > validation.sft.jsonl
node convert-export-to-sft.mjs export.json test > test.sft.jsonl
```

脚本将 JSONL 写入标准输出，把统计信息写入标准错误，因此可以安全地使用 `>` 保存结果。

## 预期分布

```text
总题数：12
训练集：8
验证集：2
测试集：2
正确答案位置：A/B/C/D 各 3 次
训练集答案位置：A/B/C/D 各 2 次
```

`answer-key.json` 只用于课后校验。正式标注时不要让标注者看到答案，也不要把答案字段混入模型
输入，否则会造成答案泄漏。
