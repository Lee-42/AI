# 23 项目 3：LlamaFactory + LoRA 模型微调实战

这一章以“电商评论情感分析”为业务案例，使用 LlamaFactory 完成环境搭建、LoRA 微调、训练结果
分析与多轮参数优化。学习重点不是把训练界面点一遍，而是建立一套可复现的实验方法：固定环境、
记录变量、比较结果，再根据证据调整参数。

> 名称说明：项目原名为 **LLaMA-Factory**，从 `v0.9.4` 起官方仓库名改为
> **LlamaFactory**。课程标题保留原名称，正文使用当前官方名称。算法名称统一写作 **LoRA**。

## 学习进度

- [x] 01 环境安装
- [ ] 02 LoRA 环境搭建
- [ ] 03 CUDA 环境问题解决与显卡驱动
- [ ] 04 LoRA 训练结果解析
- [ ] 05 案例 1：电商评论情感分析
- [ ] 06 案例 1：开始训练 Qwen 模型
- [ ] 07 案例 1：真实企业场景对数据量的要求？
- [ ] 08 案例 1：学习率参数应该如何调整？
- [ ] 09 案例 1：训练轮数参数调节
- [ ] 10 案例 1：模型参数的选择
- [ ] 11 案例 1：模型训练完的效果
- [ ] 12 案例 1：模型第二次训练效果
- [ ] 13 案例 1：模型第 3、4 次训练与优化
- [ ] 14 案例 1：Warmup Ratio 参数在哪？

---

## 01 环境安装

> 本节版本基线：`LlamaFactory v0.9.4`、`Python 3.12`、`uv`。
>
> 核对日期：2026-08-08。依赖会持续变化，开始新实验前应再次查看官方发布说明。

### 本节目标

学完这一节，应该能够：

- 说清楚 LlamaFactory、LoRA、模型、数据集和训练产物之间的关系；
- 根据操作系统与加速设备选择正确的学习路线；
- 解释为什么不能直接使用当前机器的系统 Python 3.14；
- 用 `uv` 创建 Python 3.12 隔离环境并安装固定版本的 LlamaFactory；
- 检查 PyTorch 实际识别到的是 CUDA、MPS 还是 CPU；
- 根据验收清单判断环境是否真的安装成功。

### 1. 本章到底要完成什么？

这一章最终要完成的是一条可重复执行的模型微调链路：

```text
业务目标：识别电商评论的情感
          ↓
准备并检查监督微调数据
          ↓
选择基础 Qwen 模型与对话模板
          ↓
使用 LlamaFactory 进行 LoRA 微调
          ↓
保存 LoRA Adapter 与训练日志
          ↓
在固定测试集上比较微调前后结果
          ↓
一次只调整一个关键参数，再次训练和比较
```

本章先建立七个对象的边界：

| 对象 | 在项目中的职责 |
| --- | --- |
| 基础模型 | 提供已经预训练好的通用语言能力，本章后续使用 Qwen 系列模型 |
| 训练数据 | 用“输入—理想输出”样本告诉模型要学习的任务行为 |
| LoRA | 冻结大部分基础模型参数，只训练低秩适配参数的高效微调方法 |
| LlamaFactory | 统一管理数据读取、模型加载、训练参数、日志、推理与 Adapter 合并 |
| 配置文件 | 记录模型、数据、LoRA 和训练超参数，是实验的可复现入口 |
| LoRA Adapter | 微调得到的增量权重，不等于完整基础模型 |
| 评测结果 | 判断训练是否真正改善目标任务，而不是只看训练是否跑完 |

这一节只完成**环境可用性验证**，不下载大模型，也不开始正式训练。LoRA 训练依赖、CUDA 驱动和
显存问题会在第 02、03 节继续展开。

### 2. 为什么选择 LlamaFactory 与 LoRA？

本节先掌握六个结论：

1. 全参数微调会更新基础模型的大量参数，训练和存储成本都比较高。
2. LoRA 在指定线性层旁加入低秩矩阵，只训练少量新增参数，基础模型主体通常保持冻结。
3. LoRA 降低的是可训练参数量和训练资源门槛，不代表任何电脑都适合训练任意大小的模型。
4. LlamaFactory 把 Transformers、Datasets、PEFT、TRL 等组件组织成统一的 CLI 和 Web UI。
5. LlamaFactory 支持 LoRA、QLoRA、全参数微调等多种方法，本章聚焦 LoRA，不同时展开所有能力。
6. 工具让训练更容易启动，但任务定义、数据质量、实验对照和结果解释仍然由工程师负责。

可以把两者的关系理解为：

```text
LoRA：一种参数高效微调方法
LlamaFactory：执行和管理这种微调方法的工程框架
```

### 3. 先固定版本，不追着 `main` 分支跑

本章使用下面的版本策略：

| 项目 | 本章选择 | 原因 |
| --- | --- | --- |
| LlamaFactory | `v0.9.4` | 固定稳定标签，避免课程中途因 `main` 更新而改变行为 |
| Python | `3.12.x` | 位于官方声明的 3.11–3.13 支持范围内，兼容性比 3.14 更稳妥 |
| 环境工具 | `uv` | 官方发布说明已把推荐工作流从 `pip` 迁移到 `uv` |
| PyTorch | 按平台安装 | CUDA 轮子必须与实际训练机匹配，不能照抄别人的命令 |
| 模型与数据 | 后续固定版本 | 模型 revision、数据版本和随机种子也会影响复现 |

旧视频或文章中的命令不一定错误，但可能对应不同版本。遇到冲突时，判断顺序是：

```text
当前固定版本的 release / pyproject.toml
                  ↓
当前固定版本的仓库 README 与 examples
                  ↓
历史视频、博客或问答
```

特别注意：`v0.9.4` 的发布说明已经宣布 Python 3.9–3.10 弃用；本章不沿用旧 README 表格中
“推荐 Python 3.10”的历史信息。

### 4. 选择本地验证环境与正式训练环境

先根据设备选择路线，不要把“可以安装”误认为“适合训练”。

| 环境 | 本节能做什么 | 后续正式训练建议 |
| --- | --- | --- |
| Apple Silicon Mac | 创建环境、检查 CLI、阅读配置、准备数据，必要时做小规模功能验证 | 不是 CUDA 环境；本章正式实验优先迁移到 Linux + NVIDIA GPU |
| Linux + NVIDIA GPU | 完成本节全部检查，并继续进行 LoRA/QLoRA 训练 | 本章首选路线 |
| Windows + NVIDIA GPU | 可以训练，但驱动、编译依赖和路径问题更常见 | 优先使用 WSL2 或经过验证的 Docker/原生方案 |
| 纯 CPU 主机 | 检查 Python、导入依赖和配置格式 | 不建议承担本章正式训练 |
| 云 GPU | 统一 Linux、驱动和 GPU 规格，适合可复现实验 | 固定镜像、实例规格和持久化目录 |

当前这台开发机的实测信息是：

- 本机：macOS 15.6、Apple M1 Pro、16 GB 内存；
- 系统 `python3`：3.14.3；
- `uv`：已安装；
- NVIDIA CUDA：不存在；
- 结论：本机适合完成环境隔离和 CLI 验证，后续 CUDA 实训需要 Linux + NVIDIA GPU。

> `torch.backends.mps.is_available()` 为 `True` 只说明 PyTorch 看到了 Apple GPU，不等于当前
> LlamaFactory 的全部训练、量化和加速组合都支持 MPS。

### 5. 环境分层：不要把四层软件混在一起

排查环境时，按下面六层从下到上检查：

```text
① 硬件：NVIDIA GPU / Apple GPU / CPU
② 驱动：操作系统能否识别加速设备
③ 运行时：CUDA、ROCm 或 MPS
④ PyTorch：torch 是否编译并安装了对应后端
⑤ LlamaFactory：框架及 Transformers、PEFT 等依赖
⑥ 项目配置：模型、数据集、训练参数与输出目录
```

这套分层能避免常见误判：

- `nvidia-smi` 正常，只能证明 NVIDIA 驱动基本正常，不能证明 PyTorch CUDA 可用；
- 机器安装了 CUDA Toolkit，不代表虚拟环境里的 PyTorch 是 CUDA 版本；
- `torch.cuda.is_available()` 为 `True`，也不代表显存足够训练目标模型；
- Web UI 能打开或某次训练能运行，不代表模型配置正确，也不代表升级依赖或更换机器后仍可复现。

### 6. 路线 A：在当前 M1 Mac 创建课程环境

当前机器已经有 `uv`，不需要重复安装。先确认版本：

```bash
uv --version
```

然后在准备存放 LlamaFactory 源码的目录执行：

```bash
git clone --branch v0.9.4 --depth 1 \
  https://github.com/hiyouga/LlamaFactory.git
cd LlamaFactory

uv python install 3.12
uv venv --python 3.12 .venv
source .venv/bin/activate

python --version
uv pip install -e ".[metrics]"
```

这段操作包含七个关键点：

1. `--branch v0.9.4` 固定课程版本，不直接跟随 `main`。
2. `--depth 1` 只获取该标签所需的浅历史，减少下载量。
3. `uv python install 3.12` 安装独立的 Python 3.12，不改写系统 Python。
4. `.venv` 把本章依赖限制在项目目录内。
5. `source .venv/bin/activate` 只对当前终端会话生效。
6. `uv pip install -e` 以可编辑方式安装源码，后续可以直接使用仓库中的示例配置。
7. `[metrics]` 安装评测所需的可选依赖；本节暂不安装 DeepSpeed、FlashAttention 等重型组件。

如果机器尚未安装 `uv`，macOS/Linux 可以先查阅安装脚本，再按官方方式安装：

```bash
curl -LsSf https://astral.sh/uv/install.sh | less
curl -LsSf https://astral.sh/uv/install.sh | sh
```

不要在未激活 `.venv` 时使用系统 `pip` 安装课程依赖。也不要为了“版本统一”卸载 macOS 自带的
Python；正确做法是让项目环境自行选择 Python 3.12。

### 7. 路线 B：在 Linux + NVIDIA 训练机创建环境

先检查操作系统能否看到 GPU：

```bash
nvidia-smi
```

再建立与本地一致的源码和 Python 环境：

```bash
git clone --branch v0.9.4 --depth 1 \
  https://github.com/hiyouga/LlamaFactory.git
cd LlamaFactory

uv python install 3.12
uv venv --python 3.12 .venv
source .venv/bin/activate
```

接下来完成六步：

1. 打开 PyTorch 官方安装选择器。
2. 选择 Linux、Pip、Python，以及训练机适用的 CUDA 计算平台。
3. 把官方生成的 `pip install` 改成等价的 `uv pip install` 后执行。
4. 先验证 `torch.cuda.is_available()`，再安装 LlamaFactory。
5. 执行 `uv pip install -e ".[metrics]"`。
6. 保存驱动、PyTorch、CUDA 与 LlamaFactory 的版本快照。

示意命令如下，其中 `<官方选择器生成的参数>` 必须替换，不能原样执行：

```bash
uv pip install torch torchvision torchaudio <官方选择器生成的参数>

python -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"

uv pip install -e ".[metrics]"
```

不要仅根据本机安装的 CUDA Toolkit 版本复制 PyTorch 命令。PyTorch 官方选择器给出的预编译轮子
和 NVIDIA 驱动兼容性才是当前步骤的重点。驱动问题会在第 03 节专门处理。

### 8. 三层验证：命令存在、依赖可导入、设备可识别

第一层验证 CLI 与版本：

```bash
which python
python --version
llamafactory-cli version
llamafactory-cli help
```

预期看到的关键结果：

- `which python` 指向当前项目的 `.venv`；
- Python 显示 `3.12.x`；
- LlamaFactory 显示 `0.9.4`；
- 帮助信息包含 `train`、`chat`、`export`、`webui`、`env` 等子命令。

第二层验证核心依赖能否导入：

```bash
python -c "import torch, transformers, datasets, peft; print('imports: ok')"
```

第三层验证设备后端：

```bash
python - <<'PY'
import platform
import sys
import torch

mps = getattr(torch.backends, "mps", None)

print("platform       =", platform.platform())
print("python         =", sys.version.split()[0])
print("torch          =", torch.__version__)
print("cuda_available =", torch.cuda.is_available())
print("torch_cuda     =", torch.version.cuda)
print("mps_available  =", bool(mps and mps.is_available()))
print("device_count   =", torch.cuda.device_count())
PY
```

最后让 LlamaFactory 输出自己的环境视图：

```bash
llamafactory-cli env
```

### 9. 如何读懂设备检查结果？

常见结果只有下面四类：

| 结果 | 含义 | 下一步 |
| --- | --- | --- |
| Mac 上 `mps=True`、`cuda=False` | PyTorch 识别到 Apple GPU；本机不是 CUDA 环境 | 完成 CLI 验证，正式课程训练使用 NVIDIA 主机 |
| Linux 上 `cuda=True` 且设备数大于 0 | PyTorch 已识别 NVIDIA GPU | 记录 GPU 名称和显存，再进入第 02 节 |
| `nvidia-smi` 正常但 `cuda=False` | 驱动能看到 GPU，但当前 PyTorch 很可能不是匹配的 CUDA 构建 | 回到 PyTorch 官方选择器重新安装 |
| 无 GPU 且全部为 `False` | 当前环境只能使用 CPU | 只做安装和配置检查，不进行正式训练 |

Linux 训练机可进一步记录 GPU 信息：

```bash
python - <<'PY'
import torch

for index in range(torch.cuda.device_count()):
    props = torch.cuda.get_device_properties(index)
    print(index, props.name, f"{props.total_memory / 1024**3:.1f} GiB")
PY
```

这里检查的是“设备是否可访问”，还没有判断某个模型是否能放入显存。模型大小、训练精度、
序列长度、批大小和梯度累积都会影响显存占用，后续章节再逐项分析。

### 10. Web UI 只做启动检查

LlamaFactory 提供 LlamaBoard，可以使用下面的命令启动：

```bash
llamafactory-cli webui
```

本节只检查五件事：

1. 终端没有立即出现 Python 导入错误。
2. 日志显示本地监听地址和端口。
3. 浏览器可以打开页面。
4. 页面能展示语言、模型、训练方法等基础选项。
5. 使用 `Ctrl+C` 正常停止服务。

此时不要选择大模型并开始下载，也不要凭 Web UI 能打开就认定 CUDA 环境正确。模型缓存、训练
配置和输出目录会在后续小节统一规划。

### 11. 保存一份可复现的环境快照

在环境安装成功后执行：

```bash
mkdir -p environment

python --version > environment/python-version.txt
uv pip freeze > environment/python-packages.txt
llamafactory-cli env > environment/llamafactory-env.txt
git rev-parse HEAD > environment/llamafactory-commit.txt
```

Linux + NVIDIA 环境再补充：

```bash
nvidia-smi > environment/nvidia-smi.txt
```

环境快照至少要回答六个问题：

- 用的是哪个 LlamaFactory commit 或 tag？
- Python 是什么版本？
- PyTorch 与 Transformers 是什么版本？
- PyTorch 识别到哪个计算后端？
- GPU、驱动和显存是什么情况？
- 问题发生前是否升级过任何依赖？

> `pip freeze`/`uv pip freeze` 只记录软件包版本，不记录操作系统、驱动和 GPU，所以不能替代完整
> 环境快照。

### 12. 常见失败与排查顺序

| 现象 | 常见原因 | 优先处理 |
| --- | --- | --- |
| 安装时提示 Python 版本不兼容 | 使用了系统 Python 3.14 或旧版 3.10 | 删除错误的项目虚拟环境后，用 `uv venv --python 3.12` 重建 |
| `llamafactory-cli: command not found` | 虚拟环境未激活，或安装没有完成 | 检查 `which python`，重新激活 `.venv` |
| `ModuleNotFoundError` | 安装中断，或命令进入了另一个 Python 环境 | 对比 `which python` 与 `uv pip list` |
| `nvidia-smi` 不存在或报错 | 驱动未安装、容器未透传 GPU 或机器没有 NVIDIA GPU | 先修复硬件/驱动层，不要反复重装 Python 包 |
| `nvidia-smi` 正常但 CUDA 为 `False` | 安装了 CPU 版或不匹配的 PyTorch | 按 PyTorch 官方选择器重装对应构建 |
| Web UI 能开但训练报显存不足 | UI 启动不需要装入目标模型 | 减小模型/序列/批量，或使用合适的 LoRA/QLoRA 方案 |
| Mac 上找不到 CUDA | Apple GPU 不提供 NVIDIA CUDA | 检查 MPS；正式课程训练迁移到 NVIDIA 环境 |
| 升级后示例参数失效 | 框架和示例版本不一致 | 回到 `v0.9.4`，不要混用 `main` 分支示例 |

统一按这个顺序排查：

```text
硬件 → 驱动 → PyTorch 后端 → Python 环境 → LlamaFactory → 训练配置
```

### 13. 本节验收任务

#### 任务 1：完成环境身份证

把以下结果保存下来：

- 操作系统与 CPU 架构；
- Python 版本与解释器路径；
- LlamaFactory 版本与 commit；
- PyTorch 版本；
- CUDA/MPS 可用状态；
- GPU 型号与显存，没有 GPU 时明确写“CPU-only”。

#### 任务 2：解释三个判断题

1. `nvidia-smi` 正常，所以 LlamaFactory 一定可以用 CUDA 训练。——错误。
2. Web UI 可以打开，所以模型一定能够放进显存。——错误。
3. 固定 LlamaFactory 版本后，仍然需要记录 Python、PyTorch、驱动和 GPU。——正确。

#### 任务 3：达到最小验收标准

- [ ] `which python` 指向项目 `.venv`；
- [ ] `python --version` 为 3.12.x；
- [ ] `llamafactory-cli version` 为 0.9.4；
- [ ] `torch`、`transformers`、`datasets`、`peft` 均可导入；
- [ ] 能解释 CUDA、MPS、CPU 检查结果；
- [ ] 已生成环境快照；
- [ ] Web UI 能启动并正常停止；
- [ ] 没有在本节下载大模型或启动正式训练。

### 14. 本节小结

- LlamaFactory 是微调工程框架，LoRA 是参数高效微调方法，两者不是同一个概念。
- 本章把 `v0.9.4 + Python 3.12 + uv` 作为可复现基线。
- 当前 M1 Mac 没有 CUDA，适合完成本地环境与 CLI 验证，正式训练使用 Linux + NVIDIA GPU。
- 环境成功要同时验证解释器、依赖导入、LlamaFactory CLI 和 PyTorch 设备后端。
- `nvidia-smi`、`torch.cuda.is_available()` 和显存是否足够是三个不同的问题。
- 环境快照是后续比较训练结果和定位故障的前提。

### 官方参考资料

本节只采用项目与底层工具的官方资料作为版本依据：

- [LlamaFactory 官方仓库](https://github.com/hiyouga/LlamaFactory)
- [LlamaFactory v0.9.4 发布说明](https://github.com/hiyouga/LlamaFactory/releases/tag/v0.9.4)
- [LlamaFactory v0.9.4 `pyproject.toml`](https://github.com/hiyouga/LlamaFactory/blob/v0.9.4/pyproject.toml)
- [LlamaFactory v0.9.4 中文 README](https://github.com/hiyouga/LlamaFactory/blob/v0.9.4/README_zh.md)
- [PyTorch 官方安装选择器](https://pytorch.org/get-started/locally/)
- [uv 官方安装文档](https://docs.astral.sh/uv/getting-started/installation/)
- [LoRA 原始论文](https://arxiv.org/abs/2106.09685)
- [LlamaFactory 论文](https://arxiv.org/abs/2403.13372)
