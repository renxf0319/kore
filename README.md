# Inkwell

> 极速 · 本地 · 开源的 Markdown 编辑器。**不做任何云同步**，文件只留在你的电脑上。

Inkwell 的目标是成为最好用的本地 Markdown 写作工具：启动快、输入零卡顿、界面克制。
技术栈刻意选得「新而稳」——Tauri 2（Rust 内核）+ React 18 + TypeScript + Vite，
Markdown 解析跑在 Web Worker 里，预览永远跟手。

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

## 快速开始

### 浏览器模式（无需安装，立即体验）

```bash
npm install
npm run dev
# 打开 http://localhost:5173 → 点击「打开文件夹」选择任意本地目录
```

> 浏览器模式使用 File System Access API，推荐 Chrome / Edge 等支持的浏览器。
> 选择文件夹后授予读写权限即可像本地应用一样编辑；刷新后通过 IndexedDB 自动恢复。

### 桌面端（Tauri，生产形态）

桌面端需要 Rust 工具链。**注意**：默认 `rustup` 会把工具链装到 `C:\Users\你的用户名`，
与「不写 C 盘」的约定冲突。请改用以下方式把工具链装到非系统盘（例如 E 盘）：

```bash
# 1) 安装 Rust 工具链，但把 CARGO_HOME / RUSTUP_HOME 指到 E 盘
set CARGO_HOME=E:\rust\cargo
set RUSTUP_HOME=E:\rust\rustup
# Linux/macOS 用 export 形式
winget install Rustlang.Rustup   # 或按官方脚本安装后执行下面两步
rustup toolchain install stable
rustup default stable

# 2) 安装 Tauri CLI（已作为 devDependency，无需全局）
npm install

# 3) 开发预览
npm run tauri dev

# 4) 打包发布（生成体积仅几 MB 的安装包）
npm run tauri build
```

> Windows 需先安装 [WebView2 Runtime](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/)
> （Win11 一般已自带）与 Visual Studio 生成工具（C++ 桌面开发 workload）。
> 图标已通过 `scripts/gen_icons.py` 生成全套，无需再跑 `tauri icon`。

---

## 项目结构

```
inkwell/
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
├─ scripts/gen_icons.py  # 生成全套应用图标
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

[MIT](./LICENSE) © Inkwell Contributors
