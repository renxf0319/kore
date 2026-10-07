/**
 * 受支持的文档类型白名单（全应用唯一来源）。
 *
 * 为什么要白名单，而不是「按 MIME / 二进制探测」放开一切：
 *  1. **可预期**。用户在文件树里看到的每一项，点开就能编辑，不用来试。
 *  2. **不产生乱码**。这个编辑器的默认是 Markdown「所见即所得」——
 *     装饰引擎会按 Markdown 语法隐藏标记（`#`、`**`、`-`）。
 *     把一个 .sql / .conf 丢进去，`# 注释` 会整行消失、`*` 会被当强调标记吃掉，
 *     用户看到的就是「乱码」，而不是原文。
 *  3. **实现成本可控**。只要白名单能一一映射到一种编辑模式，就不需要为
 *     每种格式接解析器 / 高亮器。
 *
 * 因此这里的每一条都必须与 `Editor.tsx` 里的编辑模式分支保持一致：
 * 加一个扩展名 = 声明「它能打开」+ 声明「它以什么模式打开」。
 */

/** 扩展名 → 中文展示名。用于「不支持的类型」提示与状态栏。 */
const LABELS: Record<string, string> = {
  md: 'Markdown',
  markdown: 'Markdown',
  mdown: 'Markdown',
  txt: '纯文本',
  text: '纯文本',
  log: '日志',
  sql: 'SQL',
  conf: '配置',
  cfg: '配置',
  ini: '配置',
  properties: 'Properties',
  yaml: 'YAML',
  yml: 'YAML',
  json: 'JSON',
  toml: 'TOML',
  xml: 'XML',
}

/**
 * 受支持的扩展名集合（小写，不含点）。
 * Markdown 系（md/markdown/mdown）走所见即所得，其余按纯文本处理。
 */
const SUPPORTED = new Set(Object.keys(LABELS))

/** 走 WYSIWYG（Markdown 装饰 + 大纲 + 导出）的扩展名 */
const MARKDOWN = new Set(['md', 'markdown', 'mdown'])

/** 供对话框 / 提示文案使用的可读清单 */
export const SUPPORTED_EXT_LIST = [...SUPPORTED]
  .map((e) => `.${e}`)
  .join(' / ')

/** 提示里只列用户真的会用的类型，避免一行太长 */
const SHORT_LIST = '.md / .markdown / .txt / .sql / .conf / .properties / .yaml'

/** 取小写扩展名；无扩展名返回空串。`a.MD` 与 `a.md` 等价。 */
export function extOf(nameOrPath: string): string {
  const base = nameOrPath.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  // dot <= 0：没有点，或点在下标 0（`.gitignore` 这类隐藏文件不算扩展名）
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** 是否是受支持的纯文本文档类型 */
export function isSupportedFile(nameOrPath: string): boolean {
  return SUPPORTED.has(extOf(nameOrPath))
}

/** 是否按 Markdown 处理（决定用 WYSIWYG 还是纯文本） */
export function isMarkdownFile(nameOrPath: string | null): boolean {
  // null = 未命名新文档，按 Markdown 起步（Kore 的主战场）
  if (!nameOrPath) return true
  return MARKDOWN.has(extOf(nameOrPath))
}

/** 类型的展示名；不支持时返回 `null` */
export function kindLabel(nameOrPath: string): string | null {
  return LABELS[extOf(nameOrPath)] ?? null
}

/** 文件树里排序用的分组序号：目录 < Markdown < 其它文本。数字越小越靠前。 */
export function rankOf(nameOrPath: string): number {
  const ext = extOf(nameOrPath)
  if (MARKDOWN.has(ext)) return 1
  if (SUPPORTED.has(ext)) return 2
  return 3
}

/**
 * 「不支持的类型」提示文案。
 * 明确说出**是什么类型**、**支持什么**，而不是抛一个 500 或显示乱码。
 */
export function unsupportedMessage(nameOrPath: string): string {
  const base = nameOrPath.split(/[\\/]/).pop() ?? nameOrPath
  const ext = extOf(base)
  const shown = ext ? `.${ext}` : '无扩展名'
  return `暂不支持打开「${base}」（${shown}）。仅支持纯文本类型：${SHORT_LIST}`
}

/** Rust 侧同款白名单，改动时必须两边同步（见 src-tauri/src/commands.rs） */
export const SUPPORTED_EXTS: string[] = [...SUPPORTED]
