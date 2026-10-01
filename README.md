# Kore

> 极速 · 本地 · 开源的 Markdown 编辑器。**不做任何云同步**，文件只留在你的电脑上。

Kore 的目标是成为最好用的本地 Markdown 写作工具：启动快、输入零卡顿、界面克制。
技术栈刻意选得「新而稳」——Tauri 2（Rust 内核）+ React 18 + TypeScript + Vite，
Markdown 解析跑在 Web Worker 里，预览永远跟手。

---

## 下载安装包

不想自己编译？直接下载对应平台的开箱即用安装包（由 GitHub Actions 在打 tag 时自动构建）：

👉 **[下载最新版本](https://github.com/renxf0319/kore/releases/latest)**

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| **Windows** | `Kore_*_x64-setup.exe` / `Kore_*_x64_en-US.msi` | `.exe` 双击安装，或 `.msi` 用于企业部署 |
| **macOS** | `Kore_*_aarch64.dmg` | Apple Silicon（M 系列）；打开后拖入「应用程序」 |
| **Linux** | `Kore_*_amd64.AppImage` / `.deb` / `.rpm` | AppImage 免安装直接运行；`.deb`/`.rpm` 供 Debian/RedHat 系包管理 |

> 安装包体积仅 2~3MB（AppImage 因内嵌运行时略大），这正是 Tauri 相对 Electron 的优势所在。
> 首次打开 macOS 版本若提示「未验证开发者」，右键 → 打开，或到「隐私与安全性」允许即可（未做代码签名）。

---

## 特性

- **分屏实时预览**：左边写、右边渲染，拖动中缝自由调节比例，60ms 防抖不闪烁。
- **本地文件树 / 工作区**：打开任意本地文件夹，懒加载目录树，多标签编辑，记住上次目录。
- **双运行模式**：
  - 桌面端（Tauri）：Rust 直接读写磁盘，体积小、启动快、权限安全。
  - 浏览器端：用 File System Access API 直接读写你选的文件夹，无需安装即可体验。
- **主题 / 暗色模式**：一键切换，自动跟随系统偏好，选择被持久化。
- **导出**：一键导出独立 HTML（内嵌样式），或导出 PDF（系统打印「另存为 PDF」）。
- **大纲导航**：右侧自动提取标题，点击平滑跳转。
- **状态栏**：字数 / 字符 / 行数 / 保存状态实时显示。
- **快捷键**：`Ctrl/Cmd + S` 保存，`Ctrl/Cmd + F` 搜索，等等（CodeMirror 全套）。

---

## 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 运行时 | **Tauri 2**（Rust） | 几 MB 安装包、低内存、系统 WebView、本地文件权限模型安全 |
| UI | **React 18 + TypeScript + Vite** | 生态最丰富、类型安全、HMR 极快 |
| 编辑器 | **CodeMirror 6** | 比 Monaco 轻得多，扩展性强，支持搜索 / 多光标 / 缩进 |
| 渲染 | **markdown-it**（Web Worker） | 解析放到 Worker，大文档也不卡主线程 |
| 高亮 | **highlight.js** | 覆盖语言广、速度快 |
| 净化 | **DOMPurify** | 渲染前消毒，杜绝注入 |
| 状态 | **Zustand** | 极简、无样板 |
| 图标 | **lucide-react** | 清爽一致的图标 |

---

## 环境要求

- **Node.js 18+**（推荐 20 / 22 LTS）。Vite 5 从 v5 起就不再支持 Node 16 及更早版本。
  本项目用 [fnm](https://github.com/Schniz/fnm) 固定版本，见 `.node-version`（当前 `22.23.3`）。
  执行 `scripts\dev.cmd` 会自动切到该版本启动，**完全不影响系统里其他项目使用的 Node**。
- 只有需要**桌面端（Tauri）**时才需要 Rust 工具链，见下文。

> ⚠️ 若你在 Node 16 下直接跑 `npm run dev`，会看到
> `TypeError: crypto$2.getRandomValues is not a function` —— 这是 Node 版本太旧，不是代码问题。
> 项目已内置前置检查（`scripts/check-node.mjs`），会直接给出明确提示而不是让人去猜。

---

## 快速开始

### 浏览器模式（无需安装，立即体验）

```cmd
npm install
scripts\dev.cmd        REM 用 .node-version 指定的 Node 跑 Vite（推荐）
REM 或：npm run dev    REM 等价写法，前提是当前 Node ≥ 18
REM 打开 http://localhost:5173 → 点击「打开文件夹」选择任意本地目录
```

> **最省事的两种启动方式**（都不需要先 `cd`）：
> 1. 在资源管理器里**双击仓库根目录的 `dev.cmd`**；
> 2. 或在任意终端里执行完整路径：
>    `E:\WorkBuddy\2026-10-01-13-16-44\kore\dev.cmd`
>
> ⚠️ **cmd.exe 的经典坑**：`cd` 不会自动换盘。项目在 E 盘时，
> `cd E:\...\kore` 不会报错也**不会真的切过去**，后续 `npm run dev` 就会在
> `C:\Users\你\` 下找 `package.json`，报 `ENOENT ... C:\Users\E\package.json`。
> 正确写法是加 `/d`：`cd /d E:\WorkBuddy\2026-10-01-13-16-44\kore`。

> 浏览器模式使用 File System Access API，推荐 Chrome / Edge 等支持的浏览器。
> 选择文件夹后授予读写权限即可像本地应用一样编辑；刷新后通过 IndexedDB 自动恢复。

### 桌面端（Tauri，生产形态）

桌面端需要 Rust 工具链。为了遵守「不写 C 盘」的约定，我们提供了一个**交互式安装脚本**，
让你在安装时自己选择工具链装在哪块盘：

```bash
# 普通用户即可运行；脚本默认推荐一个非 C 盘，也可手动输入任意路径
powershell -ExecutionPolicy Bypass -File scripts/install-rust.ps1
```

脚本的行为：
- 列出本机所有固定磁盘，**默认推荐一个非 C 盘**（如 E:），你也可以输入任意绝对路径；
- 若你输入了 C 盘路径，会**明确警告并二次确认**，确认后才继续；
- 把 `CARGO_HOME` / `RUSTUP_HOME` 指向你选的目录，并写入**用户级环境变量**（一次设置，后续终端自动生效，无需每次 export）；
- 下载并安装 `rustup` + `stable` 工具链，再把 `cargo\bin` 加入 PATH；
- **只要你选了非 C 盘，Rust 工具链、下载的 crate、编译缓存全部留在你选的盘，`C:\Users` 下不会被写入任何工具链数据。**

> 进阶用法：
> - 跳过交互直接指定位置：`powershell -ExecutionPolicy Bypass -File scripts/install-rust.ps1 -InstallDir "D:\myrust"`
> - 安装 GNU 目标（需自行准备 MinGW-w64）：加 `-Gnu`

> Windows 上默认的 MSVC 编译目标需要 **Visual Studio 生成工具（C++ 桌面开发 workload）** 提供链接器 `link.exe`。
> 该工具由微软安装、默认落在 C:，属于外部环境依赖、不在 Kore 控制范围内；本脚本只保证
> **Rust 工具链与 crate 缓存不落 C 盘**。
> 图标已通过 `scripts/gen_icons.py` 生成全套，无需再跑 `tauri icon`。

---

## 本地开发与调试

**日常改代码不需要出安装包。** 安装包只在「发版」时才构建（见下下节，由 CI 自动完成）。
平时用下面三条通道迭代，改完保存即生效：

### 1. 秒级热更（浏览器模式，日常最推荐）

```cmd
dev.cmd                REM 仓库根目录，双击或直接执行（推荐，自动处理 Node 版本）
scripts\dev.cmd        REM 等价写法：读 .node-version 切 Node 后启动 Vite
npm run dev            REM 等价写法（要求当前 Node ≥ 18）
```

> 这三个都会**自动把工作目录切到仓库根**，所以在哪执行都行，不必先 `cd`。

打开 http://localhost:5173 ，点「打开文件夹」选一个本地目录就能写。
**适用**：UI、编辑器、Markdown 渲染、状态管理等绝大多数改动——保存即刷新，无需重启、无需 Rust。

### 2. 桌面端热更（真窗口，验证 Tauri 相关功能）

```cmd
scripts\dev-desktop.cmd      REM 一键：切 Node 版本 + 注入 Rust 工具链环境 + 打开原生窗口
npm run dev:desktop          REM 等价写法（需已装 Rust 且环境变量就绪）
```

启动脚本会自动完成两件事：把 Node 切到 `.node-version` 指定的版本；识别你用
`install-rust.ps1` 选的工具链盘符并注入 `CARGO_HOME` / `RUSTUP_HOME`——即使当前终端
还没读到用户级环境变量也能直接跑。PowerShell 用户可直接：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev-desktop.ps1
```

**适用**：验证 Rust 侧命令（读写磁盘）、原生对话框、窗口行为，以及打包前的真实表现。

### 3. 生产构建自测（提交前 / 上线前）

```bash
npm run typecheck      # TypeScript 类型检查（秒级，不启动服务）
npm run build          # tsc + vite 生产构建
npm run preview        # 本地预览 dist 产物
```

**适用**：提交前自查，或验证「构建产物」是否正常（例如依赖分包、Worker 是否被独立拆出）。

### 调试小抄

- 桌面端窗口内 **右键 → 检查**（或 `F12`）可开 DevTools；`tauri dev` 默认开启调试。
- Vite HMR 对 React 组件、CSS 变量、Markdown 样式都即时生效，改样式几乎零等待。
- 想快速看某个 Markdown 文档的渲染效果：`npm run dev` 后在浏览器里打开它即可。
- 只想确认「类型 / 构建有没有坏」：跑 `npm run typecheck`，不启动任何服务。

### Node 版本管理（fnm）

本机用 **fnm** 管理 Node 版本，与系统里其他项目用的 Node **互不干扰**：

| 项目 | 位置 |
| --- | --- |
| fnm 可执行文件 | `E:\tools\fnm\fnm.exe` |
| Node 版本目录（`FNM_DIR`） | `E:\fnm-data\node-versions\` |
| 已安装版本 | `v22.23.3`（本项目用）、`v16.20.2`（老项目用） |

常用命令：

```cmd
fnm list                 REM 看已安装的版本
fnm use 22.23.3          REM 在当前终端切到 22（只影响这个终端）
fnm install 20.18.0      REM 装一个新版本（走 npmmirror 镜像）
```

> 终端里 `cd` 进本项目时若想**自动**切版本，需在 shell 里做一次初始化
> （`fnm env --use-on-cd`）；本项目提供的 `scripts\dev.cmd` 已经替你做了这件事，
> 所以直接用它即可，无需改任何 shell 配置。

---

## 发布安装包（Releases）

Kore 的安装包由 **GitHub Actions 自动构建**：推送 `v*` 标签（如 `v0.1.0`）即触发
Windows / macOS / Linux 三平台 `tauri build`，产物附到
[Releases](https://github.com/renxf0319/kore/releases)（默认草稿，确认后点 Publish 即公开）。

本地想自己出包（一般不需要，仅调试用）：装好 Rust 工具链后执行 `npm run build:desktop`，
产物在 `src-tauri/target/release/bundle/`。

## 推送到 GitHub

仓库已推送到 `renxf0319/kore`（公开、MIT）。如需在本机重新推送或用其他账号：

```bash
# 在本机（有正常网络的机器）的 kore 目录下执行
powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1
```

脚本会：自动识别本机 `~/.git-credentials` 中的 GitHub 账号 → 设置凭证助手 → 若仓库不存在则建仓（公开 + MIT）→ 推送当前 `master` 分支。
若你的账号不是 `renxf0319`，加参数指定：`...push-to-github.ps1 -Account 你的账号`。

手动方式（等效）：

```bash
git remote set-url origin https://github.com/你的账号/kore.git
gh repo create kore --public   # 或网页建空仓库（不要勾 README/.gitignore）
git push -u origin master
```

---

## 项目结构

```
kore/
├─ src/                  # React 前端
│  ├─ components/        # Toolbar / Sidebar / Tabs / Editor / Preview / Outline / StatusBar ...
│  ├─ lib/               # fs(双模桥) / markdown / outline / export / theme / slug
│  ├─ workers/           # markdown.worker.ts（Worker 中解析 Markdown）
│  ├─ state/             # Zustand store
│  └─ styles/            # tokens.css(主题变量) / global.css
├─ src-tauri/            # Rust 后端（Tauri 2）
│  ├─ src/commands.rs    # read_dir / read_file / write_file
│  ├─ tauri.conf.json
│  └─ capabilities/      # 权限声明
├─ .node-version         # 固定本项目的 Node 版本（fnm / asdf / volta 均识别）
├─ dev.cmd               # 根目录一键启动（双击即可，自动切 Node + 切工作目录）
├─ scripts/dev.cmd       # 一键启动浏览器模式开发（自动切换 Node 版本）
├─ scripts/dev-desktop.cmd   # 一键启动 Tauri 桌面端开发
├─ scripts/dev-desktop.ps1   # 同上（PowerShell 版，注入 Rust 工具链环境变量）
├─ scripts/check-node.mjs    # Node 版本前置检查（版本过低时给出明确提示）
├─ scripts/gen_icons.py  # 生成全套应用图标
├─ scripts/install-rust.ps1  # 交互式选择盘符安装 Rust 工具链（不写 C 盘）
├─ scripts/push-to-github.ps1  # 一键建仓并推送到 GitHub（在本机联网环境运行）
└─ package.json
```

## 路线图

- [ ] 文档大纲悬浮目录 / 折叠
- [ ] 图片粘贴自动保存到本地
- [ ] 多窗口、分屏多文档
- [ ] 自定义 CSS 主题 / 主题市场
- [ ] Vim / Emacs 键位绑定开关
- [ ] 全文搜索（ripgrep 内核）
- [ ] 数学公式（KaTeX）、Mermaid 图表

欢迎提 Issue / PR，一起把它做到业界第一。

## 许可

[MIT](./LICENSE) © Kore Contributors
