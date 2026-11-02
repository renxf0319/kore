/**
 * 代码围栏的纯解析逻辑（不依赖 CodeMirror 运行时）。
 *
 * 单独拆出来有两个原因：
 *  1. 能在 Node 里直接跑用例（和 listNumberingCore 一样）；
 *  2. 「哪些围栏算代码块」这条判据只有一处出处，装饰引擎与输入守卫共用，
 *     避免两边各算一份、悄悄漂移。
 */

/** 只用到文档的这几个成员，按结构类型声明，避免拖入 @codemirror/state */
export interface DocLike {
  readonly lines: number
  line(n: number): LineLike
}

export interface LineLike {
  readonly text: string
}

/** 围栏行解析结果 */
export interface FenceInfo {
  /** 行首缩进宽度（0~3） */
  indent: number
  /** 围栏标记本身（``` 或 ~~~，3 个起） */
  marker: string
  /** 完整 info string（可含空格，如 `js copy`） */
  info: string
  /** 取首个 token 作为语言标识（与 markdown-it 一致） */
  lang: string
}

/**
 * 识别围栏行。
 *
 * ⚠️ info string 必须允许空格：` ```js copy ` / ` ```python title=a.py ` 都是
 * 合法围栏（CommonMark 里 info string 就是「语言 + 可选元信息」）。
 * 老实现对 `(\S*)\s*$` 的限制会让这种行**不被当成围栏**，于是整块代码按普通
 * 段落解析，更糟的是块末尾那个 ` ``` ` 反而被当成**开**围栏 ——
 * 后面的正文全被染成代码样式，且因为开/闭错位，一直到文末都无法恢复。
 *
 * ⚠️ 反引号围栏的 info string 里不能再有反引号：那种行是行内代码
 * （`` ```a``` ``），当成围栏会让整行凭空消失。
 */
export function parseFence(lineText: string): FenceInfo | null {
  const m = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*(.*?)[ \t]*$/.exec(lineText)
  if (!m) return null
  const marker = m[2]
  const info = m[3]
  if (marker[0] === '`' && info.includes('`')) return null
  return { indent: m[1].length, marker, info, lang: info.split(/\s+/)[0] ?? '' }
}

/**
 * 闭围栏判据（CommonMark）：同种标记、不短于开围栏、且**不能带 info string**。
 *
 * 少了后两条时，块里出现一行 ` ```js ` 或 ` ``` ` 就会提前闭合，
 * 剩下的代码被当成正文，而真正的闭围栏又开了一个新块。
 */
export function fenceCloses(openMarker: string, f: FenceInfo): boolean {
  return f.marker[0] === openMarker[0] && f.marker.length >= openMarker.length && f.info === ''
}

/**
 * 找出所有「没有配对闭围栏」的开围栏行号。
 *
 * 为什么需要它：CommonMark 规定未闭合的围栏一直延伸到文末，所以严格按语法
 * 渲染时，用户刚敲下 ``` 就会把后面的正文全染成代码块。编辑过程中这非常吓人
 * （实测用户直接反馈「下方内容格式全被影响」）。
 * 这里只把**配对成功**的围栏当代码块，未配对的按普通行显示，等补上闭围栏
 * 再变成真代码块 —— 文档源码不变，只是编辑态更宽容。
 *
 * 同一时刻最多只有一个未闭合的开围栏（后面的围栏行只会是块内内容）。
 */
export function unclosedFenceLines(doc: DocLike): Set<number> {
  const unclosed = new Set<number>()
  let openLine = -1
  let openMarker = ''
  for (let n = 1; n <= doc.lines; n++) {
    const f = parseFence(doc.line(n).text)
    if (!f) continue
    if (openLine < 0) {
      openLine = n
      openMarker = f.marker
    } else if (fenceCloses(openMarker, f)) {
      openLine = -1
      openMarker = ''
    }
  }
  if (openLine > 0) unclosed.add(openLine)
  return unclosed
}

/** 从 lineNo 之后是否还存在能闭合该开围栏的闭围栏 */
export function fenceClosedAfter(doc: DocLike, lineNo: number, open: FenceInfo): boolean {
  for (let n = lineNo + 1; n <= doc.lines; n++) {
    const f = parseFence(doc.line(n).text)
    if (f && fenceCloses(open.marker, f)) return true
  }
  return false
}

/** lineNo 之前是否已有未闭合的开围栏（即本行处在某个代码块内部） */
export function isInsideFence(doc: DocLike, lineNo: number): boolean {
  let openMarker = ''
  for (let n = 1; n < lineNo; n++) {
    const f = parseFence(doc.line(n).text)
    if (!f) continue
    if (!openMarker) openMarker = f.marker
    else if (fenceCloses(openMarker, f)) openMarker = ''
  }
  return openMarker !== ''
}
