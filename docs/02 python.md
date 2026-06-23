# Python 环境与语言基础笔记

## Conda 环境是什么

`conda环境` 是 Conda 创建的一套独立的软件运行环境。

可以把它理解成一个隔离的工具箱：每个环境里可以有自己的 Python 版本、自己的第三方库，以及项目需要的一些依赖。不同项目使用不同环境，就不容易互相影响。

### 和 nvm 类似吗

类似，但 conda 管理的范围更大。

`nvm` 主要用来管理 Node.js 版本：

```bash
nvm install 20
nvm use 20
```

它解决的是“不同项目需要不同 Node.js 版本”的问题。

`conda` 管理的是 Python 版本、Python 包，以及部分非 Python 依赖：

```bash
conda create -n ai python=3.10
conda activate ai
conda install numpy pandas pytorch
```

可以粗略类比为：

```text
conda 环境 ≈ nvm 的 Node 版本管理 + npm/pnpm 的依赖管理 + 一部分系统依赖管理
```

如果用前端开发来理解：

```text
一个 conda 环境 ≈ 一个隔离的 Node 版本 + node_modules 环境
```

只不过它主要服务于 Python、数据分析、机器学习和 AI 项目。

### 为什么需要 conda 环境

不同项目可能依赖不同版本的 Python 或库。例如：

```text
项目 A 需要 Python 3.8 + TensorFlow 2.10
项目 B 需要 Python 3.11 + PyTorch 2.x
```

如果所有依赖都装在同一个全局环境里，很容易出现版本冲突。使用 conda 环境后，每个项目可以有自己的独立运行空间。

### 安装 Conda

Conda 是一个环境管理和包管理工具。平时可以安装完整的 Anaconda，也可以安装更轻量的 Miniconda。

学习和开发时，通常推荐安装 Miniconda，因为它体积更小，之后需要什么包再自己安装。

在 macOS 上，可以先查看电脑芯片架构：

```bash
uname -m
```

如果输出是 `arm64`，一般是 Apple Silicon 芯片，比如 M1、M2、M3、M4：

```bash
curl -L -o ~/Downloads/miniconda.sh https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh
bash ~/Downloads/miniconda.sh
```

如果输出是 `x86_64`，一般是 Intel 芯片：

```bash
curl -L -o ~/Downloads/miniconda.sh https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh
bash ~/Downloads/miniconda.sh
```

安装过程中，如果提示是否初始化 conda，一般选择：

```text
yes
```

安装完成后，关闭当前终端并重新打开，或者手动重新加载 shell 配置：

```bash
source ~/.zshrc
```

然后验证安装是否成功：

```bash
conda --version
```

如果能看到类似下面的输出，就说明安装成功：

```text
conda 25.x.x
```

### 安装后找不到 conda 怎么办

如果安装完成后运行：

```bash
conda --version
```

出现：

```text
zsh: command not found: conda
```

通常不是安装失败，而是当前终端还没有加载新的配置。

安装器里这句话就是这个意思：

```text
For changes to take effect, close and re-open your current shell.
```

可以执行：

```bash
source ~/.zshrc
```

然后再试：

```bash
conda --version
```

如果还是不行，可以手动激活并初始化：

```bash
source ~/miniconda3/bin/activate
conda init zsh
source ~/.zshrc
conda --version
```

注意：`clear` 只是清屏，不会重新加载 shell 配置。

### 常用 conda 命令

查看 conda 版本：

```bash
conda --version
```

查看 conda 信息：

```bash
conda info
```

创建环境：

```bash
conda create -n myenv python=3.10
```

激活环境：

```bash
conda activate myenv
```

退出当前环境：

```bash
conda deactivate
```

查看已有环境：

```bash
conda env list
```

或者：

```bash
conda info --envs
```

查看当前环境中已安装的包：

```bash
conda list
```

安装依赖：

```bash
conda install numpy pandas
```

搜索包：

```bash
conda search numpy
```

更新包：

```bash
conda update numpy
```

卸载包：

```bash
conda remove numpy
```

删除环境：

```bash
conda remove -n myenv --all
```

导出当前环境：

```bash
conda env export > environment.yml
```

根据 `environment.yml` 创建环境：

```bash
conda env create -f environment.yml
```

克隆环境：

```bash
conda create -n newenv --clone oldenv
```

更新 conda 自身：

```bash
conda update conda
```

最常用的一组命令是：

```bash
conda create -n ai python=3.10
conda activate ai
conda install numpy pandas
conda env list
conda deactivate
```

### Conda 一句话总结

`conda环境` 就是为某个 Python 项目单独准备的一套隔离环境，用来管理 Python 版本和项目依赖。它和 `nvm` 的思想相似，都是为了让不同项目可以使用不同版本的运行环境。

## Python 虚拟环境是干嘛的

Python 虚拟环境是用来给项目创建一套独立的 Python 运行环境。

它主要解决的问题是：不同项目的依赖不要互相冲突。

例如有两个项目：

```text
项目 A 需要 Django 3
项目 B 需要 Django 5
```

如果都装到全局 Python 里，升级其中一个依赖时，另一个项目可能就坏了。

使用虚拟环境后，每个项目都有自己的依赖空间：

```text
项目 A：Python + Django 3
项目 B：Python + Django 5
```

这样两个项目就可以互不影响。

### 为什么要用虚拟环境

- 避免不同项目的依赖版本冲突
- 不污染系统自带 Python
- 方便记录项目需要哪些包
- 换电脑或部署时更容易复现环境
- 让项目运行更稳定

### 什么是 venv

`venv` 是 Python 官方内置的虚拟环境工具。

简单说：

```text
venv 用来给每个 Python 项目创建一个独立环境
```

它创建出来的 `.venv` 文件夹里通常包含：

```text
Python 解释器
pip
site-packages 依赖包目录
激活脚本
```

例如项目 A 和项目 B 需要不同版本的库：

```text
项目 A：requests 2.28
项目 B：requests 2.32
```

如果都装在全局 Python 里，就可能冲突。用 `venv` 后，每个项目都有自己的包空间。

一句话：

```text
venv 是 Python 自带的虚拟环境工具，用来隔离不同项目的依赖。
```

### venv 常用命令

创建虚拟环境：

```bash
python -m venv .venv
```

激活虚拟环境：

```bash
source .venv/bin/activate
```

安装依赖：

```bash
pip install requests
```

退出虚拟环境：

```bash
deactivate
```

## conda 和 venv 的区别

`conda` 和 `venv` 都能创建隔离环境，但它们管理的范围不同。

| 对比 | venv | conda |
| --- | --- | --- |
| 来源 | Python 官方内置 | Anaconda/Miniconda 提供 |
| 主要作用 | 创建 Python 虚拟环境 | 创建更完整的软件环境 |
| Python 版本 | 通常依赖本机已有的 Python | 可以直接指定 Python 版本 |
| 包管理 | 通常使用 `pip` | 使用 `conda install`，也可以用 `pip` |
| 管理范围 | 主要是 Python 包 | Python 包 + 部分非 Python 依赖 |
| 适合场景 | 普通 Python 项目、Web 项目 | 数据分析、AI、机器学习、科学计算 |
| 体积 | 更轻量 | 相对更重 |

简单理解：

```text
venv ≈ 只隔离 Python 项目依赖
conda ≈ 隔离 Python 版本 + Python 包 + 一些底层依赖
```

普通 Python 项目使用 `venv` 通常就够了；如果是 AI、数据科学、机器学习，或者依赖比较复杂的项目，`conda` 往往更省心。

## Python 环境管理与最佳选型

不同 Python 工具适合不同场景。没有一个工具适合所有项目。

可以先这样记：

```text
普通 Python 项目：venv + pip 就够
现代新项目：uv 更推荐
AI / 数据科学 / 机器学习：Miniconda / conda 更省心
多个 Python 版本切换：uv / pyenv / conda
全局命令行工具：pipx / uv tool
```

对 AI 学习和训练来说，`conda` 很常见；对 AI 应用开发来说，`uv` 或 `venv + pip` 通常更轻量。

### 选型表

| 场景 | 推荐 |
| --- | --- |
| 学 Python 基础 | `venv + pip` |
| 普通脚本 / Web 项目 | `venv + pip` 或 `uv` |
| 新的现代 Python 项目 | `uv` |
| AI 应用开发 / RAG / Agent / FastAPI | `uv + .venv` 优先 |
| AI 训练 / 数据科学 / Jupyter | `conda` / `mamba` |
| PyTorch / TensorFlow 本地 GPU | `conda` 或官方推荐安装命令 |
| Docker / CI / 生产部署 | `uv` 或 `pip` 更常见 |
| 安装全局 CLI 工具 | `pipx` 或 `uv tool` |

### 做 AI 应用开发不推荐 Conda 对吗

这句话对一半。

更准确地说：

```text
做 AI 应用开发，不一定推荐首选 Conda；
做 AI 研究、训练、本地 GPU/科学计算，Conda 仍然很有用。
```

AI 应用开发通常指：

```text
LLM 应用
RAG
Agent
FastAPI 服务
聊天机器人
调用 OpenAI / Claude / 本地模型 API
部署到 Docker / 云服务器
```

这种场景更推荐：

```text
uv + .venv
或 venv + pip
再配合 Docker 部署
```

原因是它们更轻量，更贴近 Python 标准项目结构，也更适合 `pyproject.toml`、`requirements.txt`、CI/CD 和 Docker 构建。

但如果是在做深度学习训练、本地 GPU、CUDA、cuDNN、PyTorch、TensorFlow、数据科学实验或 Jupyter Notebook，`conda` 仍然很合理。

一句话：

```text
Conda 不是不好，而是更适合“AI 研究/训练环境”；
AI 应用开发更推荐 uv/venv 这种轻量、标准、易部署的方案。
```

## conda、pip、uv 的包管理方式

可以把三者理解成三种不同层级的管理方式：

```text
conda：环境管理 + 包管理 + Python 版本管理 + 部分非 Python 依赖
pip：Python 包安装器，主要从 PyPI 安装包
uv：现代 Python 项目管理器，整合 venv / pip / lock / run / Python 版本等能力
```

| 对比 | conda | pip | uv |
| --- | --- | --- | --- |
| 定位 | 环境和包管理器 | Python 包安装器 | 现代 Python 项目/包管理器 |
| 包来源 | conda channels，如 `conda-forge` | PyPI | PyPI，兼容 pip 生态 |
| 虚拟环境 | 自己管理 conda env | 需要配合 `venv` | 自动/手动管理 `.venv` |
| Python 版本 | 可直接管理 | 不负责管理 Python 版本 | 可管理 Python 版本 |
| 依赖记录 | `environment.yml` | `requirements.txt` | `pyproject.toml` + `uv.lock` |
| 适合场景 | AI 训练、数据科学、复杂底层依赖 | 简单项目、传统项目 | 新项目、AI 应用开发、服务端项目 |
| 部署友好度 | 偏重 | 简单 | 很好 |

### conda 管理方式

适合 AI 训练、数据科学、本地 GPU、Jupyter 和复杂 C/C++/CUDA 依赖。

```bash
conda create -n ai python=3.10
conda activate ai
conda install numpy pandas
conda install -c conda-forge scikit-learn
```

导出环境：

```bash
conda env export > environment.yml
```

恢复环境：

```bash
conda env create -f environment.yml
```

### pip 管理方式

`pip` 只负责安装 Python 包，通常要配合 `venv`：

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install fastapi openai
```

记录依赖：

```bash
python -m pip freeze > requirements.txt
```

恢复依赖：

```bash
python -m pip install -r requirements.txt
```

### uv 管理方式

`uv` 更像现代版一体化工具。

新项目：

```bash
uv init
uv add fastapi openai
uv run python main.py
```

它会维护：

```text
pyproject.toml
uv.lock
.venv
```

同步依赖：

```bash
uv sync
```

运行命令：

```bash
uv run python main.py
```

安装开发依赖：

```bash
uv add --dev pytest ruff
```

我的建议：

```text
AI 应用开发：优先 uv
AI 训练实验：优先 conda
入门学习：venv + pip 或 conda 都可以
```

## 在编辑器中切换 uv 环境

`uv` 的环境本质上通常就是项目根目录下的 `.venv`。

所以在编辑器里切换 uv 环境，其实就是：

```text
把 Python 解释器切换到当前项目的 .venv/bin/python
```

先在项目根目录创建或同步 uv 环境：

```bash
uv sync
```

或新项目：

```bash
uv init
uv add requests
```

### VS Code

在 VS Code 中选择解释器：

```text
Cmd + Shift + P
→ Python: Select Interpreter
→ 选择当前项目的 .venv/bin/python
```

macOS / Linux 路径一般是：

```text
项目目录/.venv/bin/python
```

Windows 一般是：

```text
项目目录\.venv\Scripts\python.exe
```

也可以写到 `.vscode/settings.json`：

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python",
  "python.terminal.activateEnvironment": true
}
```

### PyCharm

在 PyCharm 中：

```text
Settings / Preferences
→ Project
→ Python Interpreter
→ Add Interpreter
→ Existing
→ 选择 .venv/bin/python
```

### uv run 不一定需要手动激活

用 `uv run` 时，不一定需要手动激活环境：

```bash
uv run python main.py
```

它会自动使用当前项目的 uv 环境。

如果想像普通 venv 一样激活：

```bash
source .venv/bin/activate
python main.py
```

### Jupyter Notebook

如果要在 Notebook 里使用 uv 环境：

```bash
uv add --dev ipykernel
```

然后在编辑器的 Kernel 选择里，选当前项目的 `.venv`。

检查是否选对：

```bash
uv run python -c "import sys; print(sys.executable)"
```

应该看到类似：

```text
/你的项目/.venv/bin/python
```

一句话：

```text
uv 环境 = 项目里的 .venv；编辑器切换解释器时选 .venv/bin/python 就行。
```

## 其他语言是怎么做的

不同语言都有自己的依赖隔离和版本管理方式，但不一定都叫“虚拟环境”。

| 语言 | 常见方式 | 是否需要激活环境 |
| --- | --- | --- |
| Python | `venv` / `conda` | 通常需要 |
| Go | `go.mod` / `go.sum` | 通常不需要 |
| Node.js | `package.json` + `node_modules`，Node 版本可用 `nvm` | 一般不需要 |
| Rust | `Cargo.toml` / `Cargo.lock` | 不需要 |
| Java | Maven / Gradle，JDK 版本另管 | 不需要 |
| Ruby | Bundler + rbenv/rvm | 有点类似 Python |

### Go 的做法

Go 一般不使用 Python 这种“激活虚拟环境”的方式，而是使用 Go Modules。

Go 项目的依赖写在：

```text
go.mod
go.sum
```

例如：

```go
module myapp

go 1.22

require github.com/gin-gonic/gin v1.10.0
```

不同 Go 项目各自有自己的 `go.mod` 文件。`go` 命令会根据当前项目的 `go.mod` 下载和选择对应版本的依赖。

Go 的依赖通常下载到统一缓存里，但每个项目编译时会按照自己的 `go.mod` 选择版本，所以一般不需要像 Python 一样先 `activate` 一个环境。

可以这样理解：

```text
Python：先进入某个环境，再运行项目
Go：项目文件自己声明依赖，go 命令按声明构建
```

### Python 算比较特别吗

Python 不是唯一需要环境管理的语言，但它确实是比较依赖虚拟环境的语言之一。

原因是 Python 的第三方包通常安装到某个 Python 解释器对应的 `site-packages` 目录里：

```text
某个 Python 解释器
  └── site-packages
        ├── requests
        ├── numpy
        └── django
```

如果很多项目共用同一个 Python 环境，就很容易出现依赖冲突。

所以在 Python 开发里，尤其是数据分析、AI、机器学习项目中，使用 `venv` 或 `conda` 是非常常见的做法。

## 环境管理总结

Python 虚拟环境的核心作用是隔离项目依赖。

`venv` 更轻量，适合普通 Python 项目；`conda` 管理范围更大，适合依赖复杂的数据科学和 AI 训练项目；`uv` 更适合现代 Python 项目和 AI 应用开发。

Go、Rust、Java 等语言更多依赖项目配置文件来声明依赖，而 Python 更常见的工作方式是先进入一个独立环境，再安装和运行项目。

## Python 和 JavaScript 有什么本质区别

Python 和 JavaScript 都是高级动态语言，但它们的出身和核心使用场景不同。

可以先这样理解：

```text
JavaScript：最初是为浏览器网页交互设计的语言
Python：最初是为通用编程、脚本和易读性设计的语言
```

### 使用场景不同

JavaScript 最核心的地盘是浏览器，天然适合做网页交互、前端开发。后来有了 Node.js，JavaScript 也可以写后端。

例如浏览器中的 JavaScript：

```js
document.querySelector("button").addEventListener("click", () => {
  console.log("点击了按钮");
});
```

Python 更偏通用编程，常用于自动化脚本、数据分析、AI、机器学习、后端开发、科学计算、爬虫和教学入门。

例如 Python：

```python
print("hello")
```

### 运行环境不同

JavaScript 最常见的运行环境是：

```text
浏览器 / Node.js
```

Python 最常见的运行环境是：

```text
Python 解释器
```

所以：

```text
浏览器里天然能跑 JavaScript
浏览器里不能直接跑普通 Python
```

### 语言风格不同

Python 强调代码可读性，语法更接近英文，用缩进表示代码块：

```python
if age >= 18:
    print("成年人")
```

JavaScript 更接近 C 系语言风格，用 `{}` 表示代码块：

```js
if (age >= 18) {
  console.log("成年人");
}
```

### 异步模型不同

JavaScript 很强调异步和事件驱动，因为网页里经常要处理点击、请求、定时器等操作：

```js
const data = await fetch("/api/data");
```

Python 默认更偏同步写法，虽然它也支持异步：

```python
import requests

data = requests.get("https://example.com")
```

简单理解：

```text
JS：天生适合事件驱动、异步交互
Python：天生适合清晰直接地表达逻辑
```

### 生态不同

JavaScript 生态主要集中在：

```text
前端、网页、Node.js、React、Vue、Next.js
```

Python 生态主要集中在：

```text
数据分析、AI、自动化、后端、科学计算
```

例如 AI 和数据分析领域常见：

```text
numpy
pandas
pytorch
tensorflow
```

前端和 Node.js 领域常见：

```text
react
vue
vite
next
express
```

### Python 和 JavaScript 一句话总结

```text
JavaScript 是网页和交互的核心语言；
Python 是通用编程、数据分析和 AI 领域非常常用的语言。
```

如果用前端开发来类比：

```text
JS 更像“浏览器原生语言”
Python 更像“通用工具语言”
```

## Python 解释器是什么

Python 解释器就是负责执行 Python 代码的程序。

你写的代码：

```python
print("hello")
```

电脑本身并不直接认识这段 Python。它需要一个程序来读取、理解、执行它，这个程序就是 Python 解释器。

常见运行方式：

```bash
python main.py
```

这里的 `python` 本质上就是在启动 Python 解释器，让它去执行 `main.py`。

可以理解成：

```text
你写的 .py 文件
        ↓
Python 解释器
        ↓
电脑执行
```

最常见的 Python 解释器叫 CPython。平时从 Python 官网、Homebrew、Miniconda 安装的 Python，大多数情况下都是 CPython。

## Python 文件开头常见的两行代码

有些 Python 文件开头会看到这两行：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
```

第一行叫 shebang：

```python
#!/usr/bin/env python3
```

它的作用是告诉 macOS / Linux：

```text
这个文件要用 python3 来运行
```

有了这一行之后，可以给脚本加执行权限，然后直接运行：

```bash
chmod +x app.py
./app.py
```

如果平时都是这样运行：

```bash
python app.py
```

那第一行不是必须的，因为命令里已经明确指定了用 `python` 来运行这个文件。

第二行是文件编码声明：

```python
# -*- coding: utf-8 -*-
```

它的作用是告诉 Python：

```text
这个源码文件使用 UTF-8 编码
```

这样文件里有中文注释、中文字符串时，解释器能正确识别。

不过在 Python 3 里，源码文件默认就是 UTF-8，所以这行大多数时候也不是必须的。它更多是 Python 2 时代留下来的历史习惯。

简单总结：

```text
#!/usr/bin/env python3     指定用哪个 Python 解释器运行
# -*- coding: utf-8 -*-    指定源码文件编码
```

现在写普通 Python 文件，通常可以不写这两行；写命令行脚本时，第一行还有用。

## 和其他语言类比

不同语言运行代码的方式不完全一样。

| 语言 | 执行方式 | 常见命令 |
| --- | --- | --- |
| Python | 解释器执行 `.py` 文件 | `python main.py` |
| JavaScript | 浏览器或 Node.js 执行 | `node app.js` |
| PHP | PHP 解释器执行 | `php index.php` |
| Ruby | Ruby 解释器执行 | `ruby app.rb` |
| Go | 先编译成可执行文件 | `go build` 后运行 |
| Rust | 先编译成可执行文件 | `cargo build` 后运行 |
| C/C++ | 先编译成机器码 | `gcc` / `clang` |
| Java | 编译成字节码，再由 JVM 执行 | `javac` + `java` |

### 和 JavaScript 类比

Python 的解释器类似于 Node.js。

Python：

```bash
python app.py
```

JavaScript：

```bash
node app.js
```

可以这样理解：

```text
python 是 Python 代码的运行器
node 是 JavaScript 代码的运行器
```

浏览器里也内置了 JavaScript 引擎，比如 Chrome 的 V8，所以网页里的 JavaScript 可以直接运行。

### 和 Go 类比

Go 一般不是靠解释器直接运行源码，而是先编译：

```bash
go build main.go
```

得到一个可执行文件后再运行：

```bash
./main
```

所以可以理解为：

```text
Python：运行时需要 Python 解释器
Go：编译后可以直接运行可执行文件
```

### Python、PHP、Ruby 的相似点

Python、PHP、Ruby 在这一点上比较类似，都属于常见的解释型或脚本语言风格。

它们都可以这样理解：

```text
源码文件
  ↓
对应语言的解释器
  ↓
执行代码
```

对应命令如下：

```bash
python app.py
php index.php
ruby app.rb
```

这里的：

```text
python 是 Python 解释器
php 是 PHP 解释器
ruby 是 Ruby 解释器
```

它们的共同点：

- 都可以直接运行源码文件
- 通常不需要像 Go、Rust、C 那样先手动编译成可执行文件
- 很适合写脚本、Web 后端、自动化任务
- 开发反馈比较快，改完代码就能跑

但它们的主要方向不同：

```text
Python：通用编程、自动化、数据分析、AI 很强
PHP：传统 Web 后端很强，尤其是 WordPress、Laravel 生态
Ruby：Web 后端和开发体验很有特色，典型代表是 Rails
```

可以这样记：

```text
Python / PHP / Ruby：更像“解释器直接跑源码”
Go / Rust / C：更像“先编译，再运行”
Java：介于中间，先编译成字节码，再交给 JVM 运行
JavaScript：浏览器或 Node.js 负责运行
```

## `__init__.py` 的作用

`__init__.py` 是 Python 包目录里的一个特殊文件。

简单说：

```text
__init__.py 用来告诉 Python：这个文件夹可以当成一个包来导入
```

例如目录：

```text
my_project/
  utils/
    __init__.py
    math_tools.py
```

有了 `__init__.py` 后，就可以这样导入：

```python
from utils import math_tools
```

或者：

```python
from utils.math_tools import add
```

### 标记这是一个 Python 包

老版本 Python 里，目录必须有 `__init__.py`，才会被认为是包。

Python 3.3 以后支持“命名空间包”，有些情况下没有 `__init__.py` 也能导入。但实际项目里很多时候还是会保留它，因为结构更明确，兼容性更好。

### 写包初始化代码

当导入这个包时，`__init__.py` 里面的代码会先执行。

例如：

```text
utils/
  __init__.py
  math_tools.py
```

`__init__.py`：

```python
print("utils 包被导入了")
```

运行：

```python
import utils
```

会输出：

```text
utils 包被导入了
```

### 控制包暴露的接口

可以在 `__init__.py` 里把常用内容导出来。

`math_tools.py`：

```python
def add(a, b):
    return a + b
```

`__init__.py`：

```python
from .math_tools import add
```

这样外部就可以直接写：

```python
from utils import add
```

不用写：

```python
from utils.math_tools import add
```

很多时候 `__init__.py` 可以是空文件。空文件也有意义，表示这个目录是一个 Python 包。

一句话总结：

```text
__init__.py 用来标记包、初始化包，以及控制包对外暴露哪些内容。
```

## `__all__` 的作用

`__all__` 用来控制：

```python
from 模块 import *
```

这种写法时，到底会导入哪些名字。

例如 `utils.py`：

```python
def public_func():
    pass

def internal_func():
    pass

__all__ = ["public_func"]
```

当别人写：

```python
from utils import *
```

只会导入：

```text
public_func
```

不会导入：

```text
internal_func
```

### 没有 `__all__` 时

如果模块里没有定义 `__all__`，那么：

```python
from utils import *
```

默认会导入所有不以下划线开头的名字。

例如：

```python
name = "tom"
_age = 18

def hello():
    pass

def _helper():
    pass
```

没有 `__all__` 时，会导入：

```text
name
hello
```

不会导入：

```text
_age
_helper
```

### 有 `__all__` 时

如果定义了：

```python
__all__ = ["hello", "_helper"]
```

那么：

```python
from utils import *
```

就只会导入 `__all__` 里列出的名字。

即使 `_helper` 是下划线开头，只要写在 `__all__` 里，也会被导入。

### 在 `__init__.py` 里使用

包结构：

```text
utils/
  __init__.py
  math_tools.py
```

`math_tools.py`：

```python
def add(a, b):
    return a + b

def sub(a, b):
    return a - b
```

`__init__.py`：

```python
from .math_tools import add, sub

__all__ = ["add", "sub"]
```

这样别人写：

```python
from utils import *
```

就只会导入：

```text
add
sub
```

一句话总结：

```text
__all__ 是模块或包的“公开名单”，主要控制 from xxx import * 能导入哪些名字。
```

实际开发里不太推荐大量使用 `from xxx import *`，但 `__all__` 仍然有用，因为它可以表达这个模块希望对外公开哪些接口。

## 什么是 CPython

CPython 是 Python 语言最主流、最官方的实现。

这里要区分两个概念：

```text
Python：一门语言规范
CPython：运行这门语言的一种具体程序
```

就像：

```text
JavaScript：一门语言
V8：Chrome / Node.js 使用的 JavaScript 引擎
```

类似地：

```text
Python：一门语言
CPython：最常用的 Python 解释器
```

平时在终端运行：

```bash
python main.py
```

这里启动的 `python`，大多数情况下就是 CPython。

它叫 CPython，是因为它主要用 C 语言实现。

CPython 执行 Python 代码的大致流程是：

```text
.py 源码
  ↓
编译成 Python 字节码 bytecode
  ↓
CPython 虚拟机解释执行字节码
```

除了 CPython，还有其他 Python 实现：

| 实现 | 特点 |
| --- | --- |
| CPython | 官方默认实现，最常用，兼容性最好 |
| PyPy | 带 JIT，某些纯 Python 代码可能更快 |
| Jython | 运行在 JVM 上，可以和 Java 生态结合 |
| IronPython | 运行在 .NET 上 |
| MicroPython | 面向单片机、嵌入式设备 |

一句话总结：

```text
CPython 就是用 C 写的官方 Python 解释器，也是平时最常用的 Python。
```

## JIT 是什么

JIT 是 Just-In-Time Compilation，中文常叫“即时编译”。

普通 CPython 大致是：

```text
Python 源码
  ↓
字节码 bytecode
  ↓
Python 解释器一条条执行
```

JIT 的思路是：

```text
先解释执行
  ↓
发现某段代码经常运行
  ↓
把这段热点代码临时编译成机器码
  ↓
下次直接运行更快的机器码
```

所以 JIT 不是一开始就把整个程序编译好，而是在程序运行时观察哪里经常执行，然后重点优化这些“热点代码”。

常见带 JIT 思路的运行环境包括：

```text
JavaScript 的 V8
Java 的 JVM
Python 的 PyPy
部分版本中的实验性 CPython JIT
```

### Python 为什么不直接默认做 JIT 优化

更准确地说，Python 不是完全不做 JIT，而是主流 CPython 长期没有默认启用成熟 JIT。

Python 生态里一直有 JIT 或编译优化方案：

| 工具 | 说明 |
| --- | --- |
| PyPy | 带 JIT 的 Python 实现，某些纯 Python 代码可能更快 |
| Numba | 常用于给数值计算函数做 JIT |
| JAX | 可以把部分数值计算编译优化 |
| PyTorch | 可以对部分模型或计算图做编译优化 |
| CPython 实验性 JIT | 新版本 CPython 中正在探索的 JIT 方向 |

CPython 没有长期默认启用成熟 JIT，主要有几个原因。

### Python 太动态

Python 运行时可以修改对象、类、函数和模块：

```python
obj.name = "Tom"
SomeClass.method = new_method
eval("x + 1")
```

这些动态能力让 JIT 很难大胆优化。刚刚优化完，程序可能又在运行时把规则改了。

### 兼容 C 扩展很重要

Python 生态大量依赖 C/C++ 扩展，例如：

```text
numpy
pandas
pytorch
tensorflow
opencv
```

很多性能热点其实已经在 C、C++、CUDA 或其他底层高性能库里运行了。Python 层更多是在做调度和组织。

CPython 必须非常重视现有 C API 和第三方库兼容。如果 JIT 破坏兼容性，代价会很大。

### 很多程序瓶颈不在 Python 执行速度

很多 Python 程序慢在：

```text
网络请求
数据库查询
文件 IO
第三方服务
```

这类场景即使 JIT 优化了 Python 代码，也不一定明显变快。

### JIT 自己也有成本

JIT 需要做这些事情：

```text
分析代码
编译代码
占用更多内存
处理调试和性能分析
处理优化失败后的回退
```

对于小脚本来说，程序可能还没来得及从 JIT 中受益，就已经运行结束了。

### JIT 一句话总结

```text
JIT 是运行时把热点代码编译成机器码的优化技术。
CPython 不是不能 JIT，而是要兼顾动态特性、C 扩展兼容、调试体验和生态稳定，所以长期没有默认启用成熟 JIT。
```

更实用地记：

```text
JavaScript：浏览器性能压力巨大，所以 V8 JIT 很强
Java：JVM 长期围绕 JIT 优化
Python：更重视易用性和生态兼容，性能热点常交给 C/C++、CUDA 或专门工具
```

## Python 和 JavaScript JIT 运行机制的区别

可以先这样记：

```text
JavaScript 的 JIT：主流运行机制的一部分，默认、成熟、深度优化
Python 的 JIT：不是主流 CPython 的核心默认模式，更多是实验性或特定实现/工具
```

### JavaScript JIT 怎么运行

以 Chrome 和 Node.js 使用的 V8 为例，大致流程是：

```text
JavaScript 源码
  ↓
解析成字节码
  ↓
解释器先执行
  ↓
收集类型和运行信息
  ↓
热点代码进入 JIT 编译器
  ↓
生成机器码
  ↓
如果优化假设失效，就退回更通用的执行方式
```

例如：

```js
function add(a, b) {
  return a + b;
}

for (let i = 0; i < 100000; i++) {
  add(1, 2);
}
```

JavaScript 引擎发现 `add` 经常处理数字，就可能把它优化成更快的数字加法机器码。

但如果后面出现：

```js
add("hello", "world");
```

之前“这里都是数字”的假设就失效了，引擎可能触发 deoptimization，也就是撤销优化，退回更通用的执行方式。

### Python 通常怎么运行

以主流 CPython 为例：

```text
Python 源码
  ↓
编译成 Python 字节码
  ↓
CPython 虚拟机解释执行字节码
```

例如：

```python
def add(a, b):
    return a + b

for i in range(100000):
    add(1, 2)
```

传统 CPython 不会像 V8 那样默认把热点函数编译成高质量机器码。

CPython 新版本在探索实验性 JIT，但它还不是像 V8 那样成熟、默认、核心的性能支柱。

### 核心区别

| 对比 | JavaScript JIT | Python / CPython JIT |
| --- | --- | --- |
| 默认情况 | 主流 JS 引擎默认使用 JIT | CPython 长期默认不依赖成熟 JIT |
| 成熟度 | 很成熟 | CPython JIT 仍偏实验性 |
| 代表实现 | V8、JavaScriptCore、SpiderMonkey | PyPy、Numba、CPython 实验性 JIT |
| 优化目标 | 浏览器和 Node.js 中大量 JS 代码 | Python 热点代码，但受生态和动态特性限制 |
| 回退机制 | 类型假设失败就 deopt | PyPy/实验性 JIT 也会有回退，但 CPython 主流不以此为核心 |
| 生态压力 | 浏览器必须高速执行 JS | Python 很多重计算交给 C/C++/CUDA 库 |

为什么 JavaScript 的 JIT 更强？

因为浏览器里天然运行 JavaScript，网页、前端框架、动画、交互和 Node.js 服务端都要求 JavaScript 自己跑得很快。

```text
JS 性能 = JS 引擎性能
```

但 Python 在 AI、数据分析中经常是这样：

```text
Python 负责写逻辑
NumPy / PyTorch / TensorFlow 底层负责计算
C++ / CUDA / GPU 真正干重活
```

所以很多时候：

```text
Python 性能瓶颈不在 Python 解释器本身
```

最简单的记法：

```text
JS：JIT 是主力发动机
Python：解释器是主线，JIT 是增强路线之一
```

更准确一点：

```text
JS 引擎靠 JIT 把动态语言跑快；
Python 生态靠解释器 + C/C++ 扩展 + CUDA/GPU + 特定 JIT 工具来提速。
```

## 其他语言也使用 JIT 吗

很多语言或运行时都使用 JIT。严格说，JIT 通常属于运行时或虚拟机，不一定属于语言本身。

| 语言/平台　　　　　　 | JIT/运行时　　　　　　　　　　　　 | 特点　　　　　　　　　　　　　　　　　 |
| -----------------------| ------------------------------------| ----------------------------------------|
| Java / Kotlin / Scala | JVM HotSpot / GraalVM　　　　　　　| 非常成熟，长期服务端性能强　　　　　　 |
| JavaScript　　　　　　| V8 / JavaScriptCore / SpiderMonkey | 浏览器和 Node.js 的核心性能来源　　　　|
| C# / F#　　　　　　　 | .NET RyuJIT　　　　　　　　　　　　| .NET 默认 JIT，服务端和桌面都很强　　　|
| Lua　　　　　　　　　 | LuaJIT　　　　　　　　　　　　　　 | 轻量脚本语言里非常有名，速度很强　　　 |
| Python　　　　　　　　| PyPy / Numba / CPython 实验性 JIT　| 有 JIT，但 CPython 默认还不是靠 JIT　　|
| Ruby　　　　　　　　　| YJIT　　　　　　　　　　　　　　　 | Ruby 近年重点优化方向，Rails 场景常见　|
| Julia　　　　　　　　 | LLVM JIT　　　　　　　　　　　　　 | 面向科学计算，运行时编译成机器码　　　 |
| Erlang / Elixir　　　 | BEAM JIT　　　　　　　　　　　　　 | 用于 Erlang VM，提高 BEAM 指令执行效率 |

### 最好的 JIT 是哪个语言

没有唯一答案，要看场景。

如果按成熟度和长期服务端性能：

```text
Java / JVM 的 HotSpot JIT 是最强候选之一
```

JVM 的 JIT 发展了很多年，有解释执行、热点检测、分层编译、逃逸分析、内联优化等，适合长时间运行的服务端程序。

如果按动态语言 JIT 优化能力：

```text
JavaScript 的 V8 非常强
```

V8 支撑 Chrome 和 Node.js，性能压力很大，所以 JIT 优化投入很深。现代 V8 有多层执行和编译机制。

如果按小型脚本语言性能：

```text
LuaJIT 很有代表性
```

LuaJIT 在脚本语言里非常快，尤其适合一些嵌入式、高性能脚本场景。

如果按 AI 或科学计算风格：

```text
Julia 的 LLVM JIT 很强
```

Julia 更像是“写起来像动态语言，但运行时尽量编译成高性能机器码”。

可以这样记：

```text
服务端长期运行：JVM / .NET 很强
浏览器和 Node.js：V8 很强
轻量脚本：LuaJIT 很强
科学计算：Julia JIT 很强
Python：更多依赖 C/C++/CUDA 库和专门 JIT 工具
```

一句话总结：

```text
JIT 最成熟的代表通常是 JVM 和 V8；
但“最佳 JIT”不是某个语言固定第一，而是看运行场景。
```

## Go 为什么一般不用 JIT

Go 一般不靠 JIT。

Go 的主流运行方式是 AOT 编译，也就是 Ahead-Of-Time，提前编译。

流程大概是：

```text
Go 源码
  ↓
go build
  ↓
编译成机器码可执行文件
  ↓
直接运行
```

例如：

```bash
go build main.go
./main
```

这和 Java、JavaScript、Python 不太一样：

| 语言 | 常见运行方式 |
| --- | --- |
| Go | 提前编译成可执行文件 |
| Java | 编译成字节码，再由 JVM 运行，JVM 会 JIT |
| JavaScript | 引擎解释 + JIT |
| Python / CPython | 编译成字节码，再解释执行 |
| C / C++ / Rust | 提前编译成可执行文件 |

Go 不太需要 JIT，因为它在运行前已经编译成了机器码。

Go 的设计目标是：

```text
编译快
部署简单
运行性能稳定
单个二进制文件方便分发
```

比如写一个 Go 服务，通常可以编译出一个独立可执行文件，拷到服务器上就能跑，不需要 JVM、Node.js 或 Python 解释器。

可以这样对比：

```text
Go：提前编译，启动快，性能稳定
Java：JVM + JIT，运行越久可能越快
JavaScript：运行时 JIT，动态优化
Python：解释器为主，重计算交给底层库
```

一句话：

```text
Go 不走 JIT 主路线，它更像 C/Rust，提前编译成机器码再运行。
```

## PyTorch、TensorFlow 是 C++ 吗

PyTorch、TensorFlow 的底层核心大量是 C++、CUDA 等高性能代码写的，但它们给 Python 提供了很好用的接口。

可以这样理解：

```text
你写的是 Python
真正大量计算发生在 C++ / CUDA / GPU 内核里
```

例如 PyTorch：

```python
import torch

x = torch.tensor([1, 2, 3])
y = x * 2
```

你看到的是 Python 代码，但 `x * 2` 这种张量计算，底层会调用 PyTorch 的 C++ 后端；如果张量在 GPU 上，还会调用 CUDA 内核。

PyTorch 大致结构：

```text
Python API
  ↓
C++ 核心
  ↓
CPU / GPU / CUDA / cuDNN / BLAS
```

TensorFlow 也类似：

```text
Python API
  ↓
C++ Runtime / Graph Engine
  ↓
CPU / GPU / TPU 后端
```

为什么要这样做？

因为 Python 写起来方便，但不适合亲自执行海量数值计算。C++、CUDA 更适合做矩阵乘法、卷积、梯度计算这些重活。

所以 AI 领域常见模式是：

```text
Python 负责表达模型和调度
C++ / CUDA 负责真正的高性能计算
```

这也是 Python 在 AI 领域流行的重要原因：它不是靠 Python 自己跑得最快，而是靠 Python 做好用的上层语言，底层交给高性能库。

## CUDA 是什么

CUDA 是 NVIDIA 推出的 GPU 并行计算平台和编程工具。

简单说：

```text
CUDA 让程序可以使用 NVIDIA 显卡来做大量计算
```

原本 GPU 主要负责图形渲染，比如游戏画面。后来大家发现 GPU 很适合做大量重复的数学计算，例如：

```text
矩阵乘法
向量计算
图像处理
深度学习训练
大模型推理
```

这些正好是 AI 里最常见的计算。

可以这样理解：

```text
CPU：少量核心，每个核心很强，适合复杂逻辑
GPU：大量核心，单个核心没那么强，但适合同时做海量简单计算
CUDA：让程序能调用 NVIDIA GPU 来计算的技术
```

在 PyTorch 里经常会看到：

```python
import torch

x = torch.tensor([1, 2, 3])
x = x.cuda()
```

这里的 `.cuda()` 意思是：把数据放到 NVIDIA GPU 上，让 GPU 来计算。

更常见、更通用的写法是：

```python
device = "cuda" if torch.cuda.is_available() else "cpu"
x = x.to(device)
```

AI 计算链路大概是：

```text
Python 代码
  ↓
PyTorch / TensorFlow
  ↓
C++ 后端
  ↓
CUDA
  ↓
NVIDIA GPU
```

一句话总结：

```text
CUDA 是 NVIDIA 显卡的高性能计算接口，AI 框架通过 CUDA 把大量数学计算交给 GPU 来加速。
```

注意：CUDA 主要对应 NVIDIA 显卡。如果是 AMD GPU，常见的是 ROCm；如果是 Apple 芯片，常见的是 Metal / MPS。

## Python 推导式

Python 的推导式是一种用简短语法生成列表、字典、集合或生成器的写法。

它常用来完成：

```text
遍历数据
处理每一项
可选过滤数据
生成新的数据结构
```

### 列表推导式

普通写法：

```python
nums = [1, 2, 3, 4]

result = []
for n in nums:
    result.append(n * 2)

print(result)
```

推导式写法：

```python
nums = [1, 2, 3, 4]

result = [n * 2 for n in nums]

print(result)
```

结果：

```text
[2, 4, 6, 8]
```

基本格式：

```python
[表达式 for 变量 in 可迭代对象]
```

例如：

```python
squares = [x * x for x in range(5)]
print(squares)
```

结果：

```text
[0, 1, 4, 9, 16]
```

### 带 if 条件的列表推导式

只保留偶数：

```python
nums = [1, 2, 3, 4, 5, 6]

evens = [n for n in nums if n % 2 == 0]

print(evens)
```

结果：

```text
[2, 4, 6]
```

格式：

```python
[表达式 for 变量 in 可迭代对象 if 条件]
```

### 带 if else 的列表推导式

把偶数标记为 `"even"`，奇数标记为 `"odd"`：

```python
nums = [1, 2, 3, 4]

labels = ["even" if n % 2 == 0 else "odd" for n in nums]

print(labels)
```

结果：

```text
['odd', 'even', 'odd', 'even']
```

注意这个格式和单纯过滤不一样：

```python
[if结果 if 条件 else else结果 for 变量 in 可迭代对象]
```

### 字典推导式

字典推导式用来生成字典。

```python
names = ["tom", "jerry", "lucy"]

name_lengths = {name: len(name) for name in names}

print(name_lengths)
```

结果：

```text
{'tom': 3, 'jerry': 5, 'lucy': 4}
```

格式：

```python
{key: value for 变量 in 可迭代对象}
```

### 集合推导式

集合推导式用来生成集合，集合会自动去重。

```python
nums = [1, 2, 2, 3, 3, 4]

unique_squares = {n * n for n in nums}

print(unique_squares)
```

结果可能是：

```text
{16, 1, 4, 9}
```

集合本身没有固定顺序，所以打印出来的顺序不一定一样。

### 生成器表达式

生成器表达式使用小括号。

它不会一次性生成所有数据，而是需要一个取一个，更省内存：

```python
nums = (n * n for n in range(1000000))
```

可以用 `for` 循环一个个取值：

```python
for n in nums:
    print(n)
```

### 推导式总结

推导式就是用一行代码完成“遍历 + 处理 + 可选过滤”。

常见类型：

```text
列表推导式：[x for x in data]
字典推导式：{k: v for x in data}
集合推导式：{x for x in data}
生成器表达式：(x for x in data)
```

建议：简单逻辑适合用推导式；如果逻辑太复杂，普通 `for` 循环更清楚。

## 语言基础总结

Python 的运行依赖 Python 解释器，这一点和 PHP、Ruby 很类似。

JavaScript 的运行依赖浏览器或 Node.js。浏览器天然支持 JavaScript，所以 JavaScript 是前端网页交互的核心语言。

Go、Rust、C 这类语言通常先编译成可执行文件再运行。Java 则先编译成字节码，再交给 JVM 执行。

CPython 是最常用的 Python 解释器。Python 在性能上并不是完全不优化，而是常常把重计算交给 C/C++、CUDA、GPU 或专门的编译优化工具。

JavaScript 的 JIT 是主流运行机制的一部分，V8 等引擎会根据运行时类型信息不断优化和回退。Go 则通常不走 JIT 路线，而是提前编译成机器码，换来部署简单和稳定的运行性能。
