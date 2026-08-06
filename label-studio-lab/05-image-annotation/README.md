# 案例 05：图片目标检测标注

本目录是课程“05 案例 2：图片标注案例”的配套材料。实验目标是在 3 张合成电商场景图中使用
矩形框标注“纸箱、瓶子、杯子”三类物体。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `assets/*.svg` | 3 张 640×400 的离线教学图片 |
| `serve-assets.mjs` | 带 CORS 响应头的本地静态资源服务器 |
| `image-tasks.json` | 导入 Label Studio 的 3 条图片任务 |
| `labeling-config.xml` | `Image + RectangleLabels` 标注配置 |
| `annotation-guidelines.md` | 矩形框、遮挡和贴边目标的标注规范 |
| `label-map.json` | 标签名称、英文编码和显示颜色 |
| `answer-key.json` | 7 个参考目标及其像素、百分比坐标 |
| `validate-export.mjs` | 检查原始 JSON 导出的标签、框数和坐标 |

## 快速开始

在本目录启动资源服务器：

```bash
node serve-assets.mjs
```

保持该终端运行，并在浏览器确认下面三个地址都能显示图片：

```text
http://127.0.0.1:8001/scene-001.svg
http://127.0.0.1:8001/scene-002.svg
http://127.0.0.1:8001/scene-003.svg
```

然后执行：

1. 在 Label Studio 创建项目 `ecommerce-object-detection-v1`；
2. 导入 `image-tasks.json`，确认生成 3 条任务；
3. 将 `labeling-config.xml` 粘贴到 Labeling Interface；
4. 阅读 `annotation-guidelines.md`；
5. 独立完成 7 个目标的框选；
6. 导出原始 JSON，例如保存为 `export.json`；
7. 运行 `node validate-export.mjs export.json`。

先运行材料自测：

```bash
node validate-export.mjs --self-test
```

## 预期目标分布

```text
图片：3 张
矩形框：7 个
纸箱：3 个
瓶子：2 个
杯子：2 个
```

校验脚本允许人工框与参考框在每个百分比坐标上存在最多 5 个百分点的偏差。超过容差时，应检查
是否漏框、框入过多背景、遗漏杯子把手，或者对贴边目标推测了图片外不可见部分。

## 运行方式说明

任务数据使用 `http://127.0.0.1:8001` 图片地址，适用于本地 Label Studio。图片由浏览器加载，
因此即使 Label Studio 运行在 Docker 中，也不需要把资源目录挂载进容器。

如果使用 HTTPS 的云端 SaaS，浏览器可能阻止加载本地 HTTP 资源。此时应把 `assets` 中的图片上传
到可访问的 HTTPS 对象存储或静态站点，并修改 `image-tasks.json` 中的 URL。不要把真实敏感图片
上传到未经过组织批准的云服务。
