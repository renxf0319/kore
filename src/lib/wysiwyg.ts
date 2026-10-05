import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import type { EditorState, Extension } from '@codemirror/state'

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
 */
const INLINE_RULES: { re: RegExp; cls: string; head: number; tail: number; image?: boolean }[] =
  [
    // 行内代码最先：避免 `**x**` 里的星号被当成强调
    { re: /`([^`\n]+)`/g, cls: 'cm-md-code', head: 1, tail: 1 },
    { re: /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, cls: '', head: 0, tail: 0, image: true },
    { re: /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, cls: 'cm-md-link', head: 1, tail: 0 },
    { re: /\*\*\*([^*]+)\*\*\*/g, cls: 'cm-md-strong cm-md-em', head: 3, tail: 3 },
    { re: /\*\*([^*]+)\*\*/g, cls: 'cm-md-strong', head: 2, tail: 2 },
    { re: /__([^_]+)__/g, cls: 'cm-md-strong', head: 2, tail: 2 },
    { re: /~~([^~]+)~~/g, cls: 'cm-md-del', head: 2, tail: 2 },
    { re: /==([^=]+)==/g, cls: 'cm-md-mark', head: 2, tail: 2 },
    { re: /(?<![*\w])\*([^*\n]+)\*(?!\*)/g, cls: 'cm-md-em', head: 1, tail: 1 },
    { re: /(?<![_\w])_([^_\n]+)_(?![_\w])/g, cls: 'cm-md-em', head: 1, tail: 1 },
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

// --- 插件 ----------------------------------------------------------------

function build(view: EditorView): DecorationSet {
  const state = view.state
  const out: Pending[] = []
  const head = state.selection.main.head
  const ctx: Ctx = {
    cursorLine: state.doc.lineAt(head).number,
    out,
    claimed: [],
    inFence: false,
    fenceMarker: '',
  }

  // 从第 1 行线性扫到需要处理的最后一行。
  // 为什么不只扫 visibleRanges：代码围栏是跨行状态，只看可见段的话，
  // 当围栏开头在视口上方时会把代码块内容当成普通段落解析（高亮与转义全乱）。
  //
  // 注意：ViewPlugin 构造阶段编辑器还没测量，visibleRanges 可能是空数组，
  // 直接取 [length-1] 会抛 "Cannot read properties of undefined (reading 'to')"
  // 并让整个插件崩掉（CodeMirror 只会打印一行 "plugin crashed"，极难定位）。
  // 所以这里必须兜底成整篇文档。
  const vr = view.visibleRanges
  const endLine =
    vr.length > 0
      ? state.doc.lineAt(vr[vr.length - 1].to).number
      : state.doc.lines
  for (let n = 1; n <= endLine; n++) {
    const line = state.doc.line(n)
    // 每行重置占用表：跨行的区间（围栏标签）不参与行内去重
    ctx.claimed = []
    processLine(state, ctx, n, line.text, line.from)
  }

  // 交给 Decoration.set 排序，规避 RangeSetBuilder 的顺序断言
  return Decoration.set(
    out.map((p) => p.deco.range(p.from, p.to)),
    true
  )
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = build(view)
    }

    update(u: ViewUpdate): void {
      // 光标移动也要重算：哪一行「亮出原始标记」是跟着光标走的
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = build(u.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)

export function livePreview(): Extension {
  return livePreviewPlugin
}

// --- 供大纲跳转使用 ------------------------------------------------------

/** 行号（1 起）→ 文档绝对位置 */
export function lineToPos(state: EditorState, line: number): number {
  const n = Math.min(Math.max(1, line), state.doc.lines)
  return state.doc.line(n).from
}
