# 案例 04：电商评论情绪识别

本目录是课程“04 案例 1：电商评论情绪识别”的配套实验材料。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `ecommerce-reviews.json` | 导入 Label Studio 的 12 条原始任务 |
| `labeling-config.xml` | 粘贴到 Labeling Interface 的界面配置 |
| `annotation-guidelines.md` | 标注前必须阅读的标签定义和边界规则 |
| `label-map.json` | 中文显示标签、英文编码和数字 ID 的固定映射 |
| `answer-key.json` | 完成独立标注后使用的参考答案 |
| `validate-export.mjs` | 检查 Label Studio 原始 JSON 导出结果 |

## 使用顺序

1. 阅读 `annotation-guidelines.md`，确认四个标签的定义。
2. 在 Label Studio 中创建项目 `ecommerce-sentiment-v1`。
3. 导入 `ecommerce-reviews.json`，确认产生 12 条任务。
4. 将 `labeling-config.xml` 粘贴到标注界面的代码编辑器并保存。
5. 独立完成全部任务，不要提前查看 `answer-key.json`。
6. 从 Label Studio 导出原始 JSON。
7. 使用校验脚本检查导出结果。

假设导出的文件为当前目录中的 `export.json`：

```bash
node validate-export.mjs export.json
```

校验脚本会检查：

- 是否包含预期的 12 个 `review_id`；
- 每条任务是否恰好有一个有效标注；
- 是否只有一个 `sentiment` 选择结果；
- 标签是否属于正向、负向、混合、无法判断；
- 与课程参考答案相比有哪些差异；
- 各标签的样本数量。

先运行脚本自测，可以确认材料之间保持一致：

```bash
node validate-export.mjs --self-test
```

## 预期标签分布

独立标注完成前不建议查看具体答案。只检查总体分布时，预期为：

```text
正向：3
负向：4
混合：3
无法判断：2
```

出现不同结果并不一定意味着操作错误。先根据 `annotation-guidelines.md` 判断是误读文本、遗漏规则，
还是发现了规范未覆盖的新边界，再决定修改标注还是升级规范版本。

## 注意事项

- 只向项目导入 `ecommerce-reviews.json`，不要导入 `answer-key.json` 或 `label-map.json`。
- `Skip` 表示任务未完成，不等于“无法判断”。
- 课程材料使用模拟评论，不包含真实客户信息。
- 导出文件可能包含账号、时间和项目字段；提交到公开仓库前应先检查内容。
