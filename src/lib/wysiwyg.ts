import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'

// ---------------------------------------------------------------------------
// Typora 风格「所见即所得」装饰引擎
//
// 思路：不把文档换成富文本 DOM（那是 ProseMirror/TipTap 的路子），而是让 CodeMirror
// 继续编辑**纯 Markdown 源码**，只做两件事：
//   1. 用 Decoration.replace 把「语法标记」藏起来
//   2. 用 Decoration.mark / Decoration.line 把语义样式挂上去
// 于是：
//   - 文档始终是合法 Markdown，导出、复制、另存为零成本
//   - 光标落在哪一行，哪一行就临时显示原始标记（Typora 的行为）
//   - 不需要维护「富文本 ↔ Markdown」双向序列化，规避了一整类数据不一致 bug
//
// 两个必须遵守的实现约束（都是踩过的坑）：
//   A. 装饰必须按 from 升序加入，且同 from 时按 startSide 排序 —— 乱序会直接抛
//      "Ranges must be added sorted"。因此这里统一收集到数组，最后交给
//      Decoration.set(..., true) 排序，而不是手工维护 RangeSetBuilder。
//   B. 行内规则可能互相嵌套命中（如 `**粗**` 里的 `*` 也会命中斜体规则）。
//      所以用 claimed 记录已占用区间，重叠的命中直接跳过。
// ---------------------------------------------------------------------------

/** 一个待添加的装饰 */
interface Pending {
  from: number
  to: number
  deco: Decoration
}

interface Ctx {
  /** 光标所在行：这一行不隐藏任何标记，让用户能看见并编辑原始语法 */
  cursorLine: number
  out: Pending[]
  /** 本行已被占用的区间（左闭右开），用于跳过重叠命中 */
  claimed: [number, number][]
  /** 代码围栏内部：不做内联解析 */
  inFence: boolean
  fenceMarker: string
}

function overlaps(claimed: [number, number][], from: number, to: number): boolean {
  for (const [a, b] of claimed) {
    if (from < b && to > a) return true
  }
  return false
}

function add(ctx: Ctx, from: number, to: number, deco: Decoration): void {
  if (to <= from) return
  ctx.out.push({ from, to, deco })
  ctx.claimed.push([from, to])
}

/** 行级装饰：范围是零宽的，挂在行首 */
function addLine(ctx: Ctx, lineFrom: number, cls: string): void {
  ctx.out.push({ from: lineFrom, to: lineFrom, deco: Decoration.line({ class: cls }) })
}

/** 隐藏一段标记；光标在这一行时不隐藏 */
function hide(ctx: Ctx, lineNo: number, from: number, to: number): void {
  if (to <= from) return
  if (ctx.cursorLine === lineNo) return
  ctx.out.push({ from, to, deco: Decoration.replace({}) })
  ctx.claimed.push([from, to])
}

/**
 * 算出「哪一行应当露出原始标记」，返回 -1 表示整篇都不露。
 *
 * 判定条件（三个都要满足，缺一不可）：
 *   1. 编辑器有焦点 —— 焦点在文件树/菜单时，用户看不到光标，不该给他看语法
 *   2. 光标不在文档开头（head > 0）
 *   3. 选区非空（拖选状态）
 *
 * 条件 2 是修一个具体 bug：打开文档时 `view.focus()` 会把光标放到位置 0，
 * 于是「光标行」= 第 1 行 = 标题行，`#` 就露出来了。用户必须点一下正文才正常。
 * 根因是「刚打开」和「用户把光标放进去」在 position 0 上无法区分，
 * 所以用 head > 0 作为「用户确实动过」的代理信号。
 */
/**
 * 算出「哪一行应当露出原始标记」，返回 -1 表示整篇都不露。
 *
 * 判定条件：
 *  1. 编辑器有焦点 —— 焦点在文件树/菜单时，用户看不到光标，不该给他看语法
 *  2. 选区非空（拖选状态）
 *
 * ⚠️ 这里**不能**用「head === 0 就返回 -1」当「刚打开文档」的代理信号：
 * 那是早期为了修「打开文档时首行标题露出 #」想出来的办法，但代价太大 ——
 * 光标真落在第 1 行时（Ctrl+Home、上方插入内容后回车）会永远不露标记，
 * 而用户此时恰恰在编辑这一行。更致命的是它让 `hasFocus` 之外又多一层
 * 隐式前提：光标在文档开头时，表格也永远不会被判定为「光标在表内」。
 * 现在打开文档不聚焦是 Editor 层的既定行为（见 Editor.tsx），
 * 这里只需 hasFocus 一个条件就够。
 */
function activeLine(view: EditorView): number {
  if (!view.hasFocus) return -1
  return view.state.doc.lineAt(view.state.selection.main.head).number
}

// --- 块级语法 -----------------------------------------------------------
const HEADING_RE = /^(#{1,6})(\s+|$)(.*)$/
const UL_RE = /^(\s*)([-*+])(\s+)(.*)$/
const OL_RE = /^(\s*)(\d{1,9})([.)])(\s+)(.*)$/
const QUOTE_RE = /^(\s*(?:>\s?)+)(.*)$/
const HR_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*(\S*)\s*$/
const TASK_RE = /^(\s*)([-*+])(\s+)(\[[ xX]\])(\s*)(.*)$/

/**
 * 行内规则。
 * head/tail = 成对标记的首尾字符数，0 表示该侧不隐藏（链接只藏头尾的方括号/URL）。
 * 优先级即数组顺序：先命中的规则占用区间，后面的规则不能再吃到同一段文本。
 *
 * dom 是**同一批规则的第二个消费者**：表格单元格要生成真实 DOM 节点（<code>/<a>），
 * 而装饰引擎只需要 class。两边共用一份正则与优先级，避免两套规则各自漂移。
 */
interface InlineRule {
  re: RegExp
  cls: string
  head: number
  tail: number
  image?: boolean
  dom?: (m: RegExpExecArray) => Node
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

const INLINE_RULES: InlineRule[] = [
  // 行内代码最先：避免 `**x**` 里的星号被当成强调
  { re: /`([^`\n]+)`/g, cls: 'cm-md-code', head: 1, tail: 1,
    dom: (m) => { const c = el('code', 'cm-md-code'); c.textContent = m[1]; return c } },
  { re: /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, cls: '', head: 0, tail: 0, image: true,
    dom: (m) => { const i = el('img', 'cm-md-img'); i.src = m[2]; i.alt = m[1] ?? ''; return i } },
  { re: /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, cls: 'cm-md-link', head: 1, tail: 0,
    dom: (m) => { const a = el('a', 'cm-md-link'); a.href = m[2]; a.textContent = m[1]; return a } },
  { re: /\*\*\*([^*]+)\*\*\*/g, cls: 'cm-md-strong cm-md-em', head: 3, tail: 3,
    dom: (m) => { const s = el('strong', 'cm-md-strong'); const e2 = el('em'); e2.textContent = m[1]; s.appendChild(e2); return s } },
  { re: /\*\*([^*]+)\*\*/g, cls: 'cm-md-strong', head: 2, tail: 2,
    dom: (m) => { const s = el('strong', 'cm-md-strong'); s.textContent = m[1]; return s } },
  { re: /__([^_]+)__/g, cls: 'cm-md-strong', head: 2, tail: 2,
    dom: (m) => { const s = el('strong', 'cm-md-strong'); s.textContent = m[1]; return s } },
  { re: /~~([^~]+)~~/g, cls: 'cm-md-del', head: 2, tail: 2,
    dom: (m) => { const s = el('del', 'cm-md-del'); s.textContent = m[1]; return s } },
  { re: /==([^=]+)==/g, cls: 'cm-md-mark', head: 2, tail: 2,
    dom: (m) => { const s = el('mark', 'cm-md-mark'); s.textContent = m[1]; return s } },
  { re: /(?<![*\w])\*([^*\n]+)\*(?!\*)/g, cls: 'cm-md-em', head: 1, tail: 1,
    dom: (m) => { const s = el('em', 'cm-md-em'); s.textContent = m[1]; return s } },
  { re: /(?<![_\w])_([^_\n]+)_(?![_\w])/g, cls: 'cm-md-em', head: 1, tail: 1,
    dom: (m) => { const s = el('em', 'cm-md-em'); s.textContent = m[1]; return s } },
]

/**
 * 解析一行。
 * ctx.inFence / ctx.fenceMarker 表示**进入这一行之前**的围栏状态；
 * 围栏的开/关状态转移只在本函数内发生，调用方不需要再同步一遍。
 */
function processLine(
  state: EditorState,
  ctx: Ctx,
  lineNo: number,
  lineText: string,
  lineFrom: number
): void {
  // --- 代码围栏：整块不做内联解析 ---
  const fence = FENCE_RE.exec(lineText)
  if (fence) {
    const marker = fence[1]
    const lang = fence[2] || ''
    if (ctx.inFence && marker[0] === ctx.fenceMarker[0]) {
      ctx.inFence = false
      ctx.fenceMarker = ''
    } else {
      ctx.inFence = true
      ctx.fenceMarker = marker
      if (lang) {
        // 围栏行右端挂语言标签
        ctx.out.push({
          from: lineFrom + lineText.length,
          to: lineFrom + lineText.length,
          deco: Decoration.widget({ widget: new FenceLabel(lang), side: 1 }),
        })
      }
    }
    addLine(ctx, lineFrom, 'cm-md-fence')
    hide(ctx, lineNo, lineFrom, lineFrom + lineText.length)
    return
  }

  if (ctx.inFence) {
    addLine(ctx, lineFrom, 'cm-md-codeblock')
    return
  }

  // --- 分割线 ---
  if (HR_RE.test(lineText)) {
    addLine(ctx, lineFrom, 'cm-md-hr')
    hide(ctx, lineNo, lineFrom, lineFrom + lineText.length)
    return
  }

  // --- 标题 ---
  const h = HEADING_RE.exec(lineText)
  if (h) {
    addLine(ctx, lineFrom, `cm-md-h${h[1].length}`)
    const markEnd = lineFrom + h[1].length + h[2].length
    hide(ctx, lineNo, lineFrom, markEnd)
    processInline(ctx, markEnd, h[3], lineNo)
    return
  }

  // --- 引用 ---
  const q = QUOTE_RE.exec(lineText)
  if (q) {
    addLine(ctx, lineFrom, 'cm-md-quote')
    const bodyFrom = lineFrom + q[1].length
    hide(ctx, lineNo, lineFrom, bodyFrom)
    processInline(ctx, bodyFrom, q[2], lineNo)
    return
  }

  // --- 任务列表（必须早于无序列表判断）---
  const task = TASK_RE.exec(lineText)
  if (task) {
    addLine(ctx, lineFrom, 'cm-md-li cm-md-task')
    const boxFrom = lineFrom + task[1].length + task[2].length + task[3].length
    const boxTo = boxFrom + task[4].length
    hide(ctx, lineNo, lineFrom, boxFrom)
    // 复选框：点击直接改文档里的 [ ] / [x]，长度相同所以光标不会跳
    const checked = task[4][1] === 'x' || task[4][1] === 'X'
    add(ctx, boxFrom, boxTo, Decoration.replace({ widget: new CheckboxWidget(checked, boxFrom, boxTo) }))
    const bodyFrom = boxTo + task[5].length
    processInline(ctx, bodyFrom, task[6], lineNo)
    return
  }

  // --- 无序列表：圆点用 CSS ::before 画，只隐藏 -/*/+ 本身 ---
  const ul = UL_RE.exec(lineText)
  if (ul) {
    addLine(ctx, lineFrom, 'cm-md-li')
    const bodyFrom = lineFrom + ul[1].length + ul[2].length + ul[3].length
    hide(ctx, lineNo, lineFrom, bodyFrom)
    processInline(ctx, bodyFrom, ul[4], lineNo)
    return
  }

  // --- 有序列表：数字和「.」都保留（Typora 就是显示 "1. xxx"）---
  const ol = OL_RE.exec(lineText)
  if (ol) {
    addLine(ctx, lineFrom, 'cm-md-li cm-md-ol')
    const numFrom = lineFrom + ol[1].length
    const bodyFrom = numFrom + ol[2].length + ol[3].length + ol[4].length
    // 只隐藏数字前的缩进，序号本身留着，用户能直接确认是第几项
    hide(ctx, lineNo, lineFrom, numFrom)
    processInline(ctx, bodyFrom, ol[5], lineNo)
    return
  }

  // --- 普通段落 ---
  addLine(ctx, lineFrom, 'cm-md-p')
  processInline(ctx, lineFrom, lineText, lineNo)
  void state
}

/** 解析行内标记 */
function processInline(ctx: Ctx, offset: number, text: string, lineNo: number): void {
  if (!text) return
  for (const rule of INLINE_RULES) {
    rule.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.re.exec(text)) !== null) {
      if (m[0].length === 0) {
        rule.re.lastIndex++
        continue
      }
      const from = offset + m.index
      const to = from + m[0].length

      // 已被前面的规则占用（嵌套命中）就跳过，避免装饰区间重叠
      if (overlaps(ctx.claimed, from, to)) continue

      if (rule.image) {
        const src = m[2]
        if (!src) continue
        // 光标在这一行时露出原始语法，方便改链接
        if (ctx.cursorLine !== lineNo) {
          add(ctx, from, to, Decoration.replace({ widget: new ImageWidget(src, m[1] ?? '') }))
        } else {
          add(ctx, from, to, Decoration.mark({ class: 'cm-md-link' }))
        }
        continue
      }

      if (rule.cls) {
        ctx.out.push({ from, to, deco: Decoration.mark({ class: rule.cls }) })
        ctx.claimed.push([from, to])
      }
      if (ctx.cursorLine === lineNo) continue
      // 藏首尾标记，保留可见内容
      if (rule.head > 0) {
        ctx.out.push({ from, to: from + rule.head, deco: Decoration.replace({}) })
      }
      if (rule.tail > 0) {
        ctx.out.push({ from: to - rule.tail, to, deco: Decoration.replace({}) })
      }
    }
  }
}

// --- 表格 ----------------------------------------------------------------
//
// 表格是唯一必须**跨行**处理的块级语法：表头行 + 分隔行（`|---|---|`）+ 若干数据行。
// 单行装饰画不出表格，所以整块用 Decoration.replace({block:true}) 换成一个真 <table>。
//
// 光标进入表格时**整块回落成源码**（和光标行的处理逻辑一致）：
// Widget 里的内容不可编辑，要改字必须回到源码。这个取舍是刻意的 —— 换来的是
// 「文档永远只是纯 Markdown」，不需要维护富文本 ↔ 源码的双向序列化。

type Align = 'left' | 'center' | 'right'

interface TableCell {
  text: string
  /** 单元格文本在文档中的绝对位置，点击表格时把光标送到这里 */
  from: number
  to: number
}

interface TableRow {
  cells: TableCell[]
}

interface TableBlock {
  startLine: number
  delimLine: number
  endLine: number
  header: TableRow
  rows: TableRow[]
  aligns: (Align | null)[]
  /** Widget.eq 用：内容变化才重建 DOM */
  sig: string
}

/**
 * 拆一行成单元格。
 *
 * 两个容易踩的坑：
 *  1. `\|` 是转义竖线，不能当分隔符（GFM 允许单元格文本里出现裸竖线）
 *  2. 行首/行尾竖线会产生一个空片段，那是「外框」不是单元格，必须丢掉；
 *     但 `| a |  |` 中间那个空单元格要保留（它是真的第二列）
 */
function parseTableRow(text: string, lineFrom: number): TableRow {
  const cells: TableCell[] = []
  const n = text.length
  let i = 0
  // GFM 允许最多 3 个前导空格（再多就是代码块了）
  while (i < n && (text[i] === ' ' || text[i] === '\t')) i++
  if (text[i] === '|') i++ // 吃掉行首竖线

  let buf = ''
  let bufStart = i
  // 把当前缓冲区落成一个单元格。from 指向去掉左侧空白后的第一个字符，
  // 这样点击定位时光标落在内容上而不是空白处。
  const flush = (): void => {
    const trimmed = buf.trim()
    const lead = buf.length - buf.trimStart().length
    const from = lineFrom + bufStart + lead
    cells.push({ text: trimmed, from, to: from + trimmed.length })
    buf = ''
  }

  for (; i < n; i++) {
    const ch = text[i]
    if (ch === '\\' && text[i + 1] === '|') {
      buf += '|'
      i++
      continue
    }
    if (ch === '|') {
      flush()
      bufStart = i + 1
      continue
    }
    buf += ch
  }
  flush()

  // 行尾竖线产生的空片段
  if (cells.length > 1 && cells[cells.length - 1].text === '' && text[n - 1] === '|') {
    cells.pop()
  }
  return { cells }
}

const DELIM_CELL_RE = /^:?-{1,}:?$/

/** 分隔行：每个单元格都形如 `---` / `:--` / `--:` / `:-:`，且必须含竖线 */
function parseDelimRow(row: TableRow): (Align | null)[] | null {
  if (row.cells.length === 0) return null
  const aligns: (Align | null)[] = []
  for (const c of row.cells) {
    const t = c.text.trim()
    if (!DELIM_CELL_RE.test(t)) return null
    const left = t.startsWith(':')
    const right = t.endsWith(':')
    aligns.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null)
  }
  return aligns
}

/**
 * 找出一个表格块；不是表格返回 null。
 * startLine 传 1 起的行号，lineAt 传该行的 from。
 */
function parseTableBlock(
  doc: EditorState['doc'],
  startLine: number,
  endLine: number,
  lineFrom: number
): TableBlock | null {
  const headerText = doc.line(startLine).text
  if (!headerText.includes('|')) return null
  if (startLine + 1 > endLine) return null
  const delimText = doc.line(startLine + 1).text
  // 必须含竖线：`foo` + `---` 在 CommonMark 里是 setext 二级标题，不是表格
  if (!delimText.includes('|')) return null

  const header = parseTableRow(headerText, lineFrom)
  const delimLine = startLine + 1
  const delim = parseDelimRow(parseTableRow(delimText, doc.line(delimLine).from))
  if (!delim) return null
  // GFM：表头与分隔行的列数必须相等
  if (delim.length !== header.cells.length) return null

  // 向下收集数据行：空行或不含竖线的行即表格结束
  const rows: TableRow[] = []
  let last = delimLine
  for (let n = delimLine + 1; n <= endLine; n++) {
    const t = doc.line(n).text
    if (!t.trim() || !t.includes('|')) break
    rows.push(parseTableRow(t, doc.line(n).from))
    last = n
  }

  return {
    startLine,
    delimLine,
    endLine: last,
    header,
    rows,
    aligns: delim,
    // sig 只用于 Widget.eq（判断要不要重建 DOM）。用 JSON.stringify 天然带分隔符，
    // 不必自己挑一个「保证不出现在正文里」的分隔字符（踩过 NUL 字节把源码变成二进制的坑）
    sig: JSON.stringify([headerText, delimText, rows.map((r) => r.cells.map((c) => c.text))]),
  }
}

/**
 * 把一段 Markdown 行内文本渲染成 DOM 片段，复用装饰引擎同一批规则与优先级。
 *
 * ⚠️ 嵌套处理：`claimed` 去重是为了防止两条规则吃到同一段文本，但直接用它
 * 会让**外层规则失效**。典型例子（用户报告里真实出现过）：
 *
 *     **无 `${}`**
 *
 * 行内代码规则先跑，吃掉了 `` `${}` `` 这段区间；随后粗体规则匹配到的区间
 * 与它重叠 → 被跳过 → 星号原样显示出来。
 *
 * 正确做法是「命中内层规则后，把它的内容递归渲染成子节点，再交给外层规则包起来」，
 * 于是 `**` 仍能被粗体规则识别，而其中的 `${}` 依旧是 <code>。
 * claimed 只用于「同级不重复命中」，不再阻止父子嵌套。
 */
function renderInlineDOM(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  // 只放「同一层」的命中区间：防止两条同级规则重复吃同一段
  const claimed: [number, number][] = []
  const pieces: { from: number; to: number; node: Node }[] = []

  for (const rule of INLINE_RULES) {
    if (!rule.dom) continue
    rule.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.re.exec(text)) !== null) {
      if (m[0].length === 0) {
        rule.re.lastIndex++
        continue
      }
      const from = m.index
      const to = from + m[0].length
      // 只拦「完全覆盖」的同级重复；部分重叠（嵌套）放行给递归处理
      const covered = claimed.some(([a, b]) => from >= a && to <= b)
      if (covered) continue
      claimed.push([from, to])

      const node = rule.dom(m)
      // 行内代码 / 图片这类「叶子」内容原样放进 textContent；
      // 其余规则（粗体/斜体/链接等）的 group(1) 是真正要递归的子内容
      const innerIdx = rule.cls === 'cm-md-code' || rule.image ? -1 : 1
      if (innerIdx > 0 && m[innerIdx] !== undefined && rule.cls !== 'cm-md-link') {
        const inner = renderInlineDOM(m[innerIdx])
        node.textContent = ''
        node.appendChild(inner)
      }
      pieces.push({ from, to, node })
    }
  }

  // ⚠️ 输出顺序必须是「**外层优先**」，不是单纯按 from 排序。
  // 排序后逐段输出时，`**无 `${}`**` 里的 `**`（from 小）会先输出，
  // 接着行内代码片段因 `p.from < pos` 被整段丢掉 —— 粗体里的代码就没了。
  // 正确做法：含嵌套的外层片段自带完整子树（含内层），
  // 因此输出时跳过「被已输出区间完全覆盖」的片段即可。
  pieces.sort((a, b) => a.from - b.from || b.to - a.to)
  let pos = 0
  for (const p of pieces) {
    // 被前面输出的区间完全覆盖 → 内容已在其子树里，跳过
    if (p.from < pos) continue
    frag.appendChild(document.createTextNode(text.slice(pos, p.from)))
    frag.appendChild(p.node)
    pos = p.to
  }
  frag.appendChild(document.createTextNode(text.slice(pos)))
  return frag
}

// --- Widgets -------------------------------------------------------------

class FenceLabel extends WidgetType {
  constructor(readonly lang: string) {
    super()
  }
  eq(other: FenceLabel): boolean {
    return other.lang === this.lang
  }
  toDOM(): HTMLElement {
    const s = document.createElement('span')
    s.className = 'cm-md-fence-label'
    s.textContent = this.lang
    return s
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }
  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-md-checkbox'
    box.checked = this.checked
    box.contentEditable = 'false'
    box.setAttribute('aria-label', '任务完成状态')
    // mousedown preventDefault：避免编辑器抢走焦点，否则光标会跳到行首
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', () => {
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' },
        // scrollIntoView 不加：只改 3 个字符，视图不该跳
        userEvent: 'input.complete'
      })
    })
    return box
  }
  // 返回 false：让 click 事件能到达 input 自身
  ignoreEvent(): boolean {
    return false
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string
  ) {
    super()
  }
  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM(): HTMLElement {
    const img = document.createElement('img')
    img.className = 'cm-md-img'
    img.src = this.src
    img.alt = this.alt
    img.draggable = false
    return img
  }
  ignoreEvent(): boolean {
    return true
  }
}

/**
 * 整块表格 Widget。
 *
 * 交互：点击任意单元格 → 把光标 dispatch 到该单元格文本的源码位置，
 * 表格随即回落成源码行（因为 cursorLine 落进块内）→ 用户可以正常改字。
 * 光标离开表格后自动渲染回 <table>。
 * 这是「所见即所得」与「可编辑」之间唯一自洽的衔接方式。
 */
class TableWidget extends WidgetType {
  constructor(readonly block: TableBlock) {
    super()
  }
  eq(other: TableWidget): boolean {
    return other.block.sig === this.block.sig
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-md-table-wrap'

    const table = document.createElement('table')
    table.className = 'cm-md-table'

    const thead = document.createElement('thead')
    const htr = document.createElement('tr')
    this.block.header.cells.forEach((c, i) => htr.appendChild(this.cell('th', c, i)))
    thead.appendChild(htr)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    for (const row of this.block.rows) {
      const tr = document.createElement('tr')
      row.cells.forEach((c, i) => tr.appendChild(this.cell('td', c, i)))
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    wrap.appendChild(table)

    // 点哪格就把光标送到那格的源码位置。
    // 两条约束，顺序也不能错：
    //  1. 必须 preventDefault：否则 CodeMirror 会先处理这次点击，把光标放到
    //     widget 覆盖区间的边界（表格第一行行首），而不是我们想去的单元格。
    //  2. **必须先 focus 再 dispatch**：activeLine() 靠 view.hasFocus 判断
    //     「光标行」，先 dispatch 的话编辑器还没聚焦 → cursorLine = -1
    //     → 表格立刻又渲染回 <table>，看起来像点击没生效。
    wrap.addEventListener('mousedown', (e) => {
      const td = (e.target as HTMLElement | null)?.closest?.('[data-pos]') as HTMLElement | null
      if (!td) return
      const pos = Number(td.dataset.pos)
      if (!Number.isFinite(pos)) return
      e.preventDefault()
      view.focus()
      view.dispatch({ selection: { anchor: pos }, userEvent: 'select.pointer' })
    })
    return wrap
  }
  private cell(tag: 'th' | 'td', c: TableCell, col: number): HTMLElement {
    const td = document.createElement(tag)
    const align = this.block.aligns[col]
    if (align) td.style.textAlign = align
    // 点击定位到单元格文本末尾：光标在行尾时用户接着就能输入，
    // 停在行首则要先按 End 键，不符合直觉
    td.dataset.pos = String(Math.max(c.from, c.to > c.from ? c.to - 1 : c.to))
    // 列数不足时补空格，避免 <td> 空着看起来像漏了内容
    td.appendChild(renderInlineDOM(c.text || ' '))
    return td
  }
  ignoreEvent(): boolean {
    // 交给我们自己的 mousedown 处理（把光标送进源码），不走编辑器默认行为
    return true
  }
}

// --- 插件 ----------------------------------------------------------------

/**
 * 装饰集合用 **StateField** 而不是 ViewPlugin 提供。
 *
 * 原因：表格是整块替换（`block: true`），而 CodeMirror 明确禁止 ViewPlugin
 * 产生块级装饰 —— 会在布局阶段抛
 * `RangeError: Block decorations may not be specified via plugins`，
 * 顺带把整个 DocView 打崩（后续报 measureVisibleLineHeights undefined）。
 * 这个限制只在真正渲染时才暴露，`tsc` 和 `vite build` 都发现不了。
 *
 * StateField + EditorView.decorations 是官方唯一允许块级装饰的入口。
 */

/** 光标所在行（1 起），-1 表示整篇都不露标记。由 cursorSync 经 effect 写入 */
let cursorLineProxy = -1

function buildFrom(state: EditorState): DecorationSet {
  const out: Pending[] = []
  const ctx: Ctx = {
    cursorLine: cursorLineProxy,
    out,
    claimed: [],
    inFence: false,
    fenceMarker: '',
  }

  // 扫描范围是**整篇文档**，不用 visibleRanges。
  //
  // 为什么不能用 visibleRanges：一旦某块被 block 替换，CodeMirror 会把这段
  // 从 visibleRanges 里「挖掉」（实测渲染过表格后 visibleRanges 变成
  // [[0,564],[1408,2739]] 这种两段不连续区间，表格所在区间正好不在里面）。
  // 拿它当扫描依据 → 表格被自己的渲染结果挤出扫描范围 → 永远算不出源码态，
  // 表现为「光标明明进了表格，表格还是 <table>」。
  //
  // 整篇扫描对大文档是否有性能问题：装饰重建只发生在 docChanged /
  // selectionSet / viewportChanged / focusChanged，其中真正逐键输入的只有
  // docChanged 与 selectionSet，而它们本来就要求全文重算（原实现也是线性扫到
  // 可见区末尾）。这份报告 158 行、实测无卡顿；真要优化，正确方向是给
  // TableBlock 加「文档版本号」做增量缓存，而不是缩小扫描范围。
  const endLine = state.doc.lines

  // 表格块缓存：同一行可能被多次询问，避免重复解析
  const tableCache = new Map<number, TableBlock | null>()

  for (let n = 1; n <= endLine; n++) {
    const line = state.doc.line(n)
    ctx.claimed = []

    // --- 表格：整块识别，整块跳过 ---
    if (!ctx.inFence) {
      const cached = tableCache.get(n)
      const block =
        cached !== undefined ? cached : parseTableBlock(state.doc, n, endLine, line.from)
      tableCache.set(n, block)

      if (block) {
        const cursorIn = ctx.cursorLine >= block.startLine && ctx.cursorLine <= block.endLine

        if (cursorIn) {
          // 光标在表内：整块回落源码，逐行只做行内解析，用户可正常改字
          for (let k = block.startLine; k <= block.endLine; k++) {
            const tl = state.doc.line(k)
            ctx.claimed = []
            if (k === block.delimLine) {
              // 分隔行是纯语法，光标不在这一行时整行藏掉
              addLine(ctx, tl.from, 'cm-md-tr-delim')
              hide(ctx, k, tl.from, tl.to)
            } else {
              addLine(ctx, tl.from, k === block.startLine ? 'cm-md-tr cm-md-tr-head' : 'cm-md-tr')
              processInline(ctx, tl.from, tl.text, k)
            }
          }
        } else {
          // 光标不在表内：整块换成 <table>
          out.push({
            from: state.doc.line(block.startLine).from,
            to: state.doc.line(block.endLine).to,
            deco: Decoration.replace({
              widget: new TableWidget(block),
              block: true,
            }),
          })
        }
        n = block.endLine
        continue
      }
    }

    processLine(state, ctx, n, line.text, line.from)
  }

  return Decoration.set(
    out.map((p) => p.deco.range(p.from, p.to)),
    true
  )
}

/**
 * 携带「光标行」的空文档 transaction。
 *
 * 为什么必须用 effect 显式传，而不是模块级变量：
 * StateField 的 `create` 在插件构造之前就跑，此时 ViewPlugin 还没赋值，
 * 模块级变量会是初始值 —— 装饰算两遍（第二遍才对）或者干脆算错。
 * 走 transaction 则保证「算装饰时用的光标行」与「触发重算的光标行」同源。
 */
const setCursorLine = StateEffect.define<number>()

const decoField = StateField.define<DecorationSet>({
  create: (state) => buildFrom(state),
  update(decos, tr) {
    // 文档变了最重要：先按新文档重扫全文（光标行由 ViewPlugin 另行同步）
    if (tr.docChanged) return buildFrom(tr.state)

    let line = cursorLineProxy
    let hasEffect = false
    for (const e of tr.effects) {
      if (e.is(setCursorLine)) {
        line = e.value
        hasEffect = true
      }
    }
    // 没有任何需要重算的理由 → 复用旧装饰
    // 注意：Transaction 上是 `selection`，ViewUpdate 上才是 `selectionSet`
    if (!hasEffect && !tr.selection) return decos
    cursorLineProxy = line
    return buildFrom(tr.state)
  },
  provide: (f) => EditorView.decorations.from(f),
})

/**
 * 光标行同步：只有 view 才知道 hasFocus，所以光标行由它算出后经 effect 传给 StateField。
 *
 * ⚠️ 这里用 **EditorView.updateListener** 而不是 ViewPlugin.fromClass(...).update，
 * 是踩过坑才换的：ViewPlugin 的 update 只在「视图需要重绘」时触发，
 * 而 `view.dispatch({ selection })` 这类纯选区变化不一定会走到它 ——
 * 实测把光标在表格内外来回移动，ViewPlugin.update 的调用计数死死不动，
 * 导致 cursorLineProxy 永远停在旧值，表现为「光标进了表格，表格死活不回落源码」，
 * 且**没有任何报错**。updateListener 对每个 transaction 都会触发，是这里唯一可靠的钩子。
 *
 * 防循环只需一条铁律：**只在行号真的变化时才 dispatch**。
 * 行号比较是纯函数判断，不依赖任何跨调用状态，最不容易出错。
 * 代价是同一行内移动光标会多扫一遍全文，对本项目可接受。
 */
const cursorSync = EditorView.updateListener.of((u) => {
  const line = activeLine(u.view)

  // 文档变化由 decoField 自己处理；这里只同步光标行，
  // 否则一次按键会触发两遍全文扫描
  if (u.docChanged) {
    cursorLineProxy = line
    return
  }
  if (line === cursorLineProxy) return
  cursorLineProxy = line
  u.view.dispatch({ effects: setCursorLine.of(line) })
})

export function livePreview(): Extension {
  return [decoField, cursorSync]
}

// --- 供大纲跳转使用 ------------------------------------------------------

/** 行号（1 起）→ 文档绝对位置 */
export function lineToPos(state: EditorState, line: number): number {
  const n = Math.min(Math.max(1, line), state.doc.lines)
  return state.doc.line(n).from
}
