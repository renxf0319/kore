import { useEffect, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { useStore } from '../state/store'
import { livePreview, lineToPos } from '../lib/wysiwyg'
import { fenceLangCompletion } from '../lib/fenceLang'

/**
 * 覆盖 defaultHighlightStyle 里「标题带下划线」的规则。
 *
 * 根因：@codemirror/language 的 defaultHighlightStyle 给 tags.heading 设了
 * `textDecoration: "underline"`（源码 index.js 里明写着），而 Markdown 解析器
 * 会给标题打上 tags.heading —— 于是每个标题文字下方都有一条下划线。
 * 它不是我们 CSS 写的，所以改 global.css 没用，必须在 highlight 层覆盖。
 *
 * ⚠️ 顺序很关键：HighlightStyle.define 里**后写的规则覆盖先写的**，
 * 所以覆盖项必须放在 defaultHighlightStyle.specs **之后**，
 * 放前面会被后面的默认 heading 规则压回去（下划线又回来）。
 */
const koreHighlightStyle = HighlightStyle.define([
  ...defaultHighlightStyle.specs,
  { tag: tags.heading, textDecoration: "none", fontWeight: "bold" },
])

const themeCompartment = new Compartment()

export default function Editor() {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const active = useStore((s) => s.active)
  const theme = useStore((s) => s.theme)
  const updateContent = useStore((s) => s.updateContent)
  const save = useStore((s) => s.save)
  const saveAs = useStore((s) => s.saveAs)
  const newDoc = useStore((s) => s.newDoc)
  const jumpLine = useStore((s) => s.jumpLine)
  const setJumpLine = useStore((s) => s.setJumpLine)

  useEffect(() => {
    if (!host.current) return
    const tab = useStore.getState().tabs.find((t) => t.id === active)
    const doc = tab?.content ?? ''
    const id = active

    const state = EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        drawSelection(),
        history(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        markdown(),
        syntaxHighlighting(koreHighlightStyle, { fallback: true }),
        // 输入 ``` 后提示语言标识符（认不全也能选）
        closeBrackets(),
        autocompletion({
          override: [fenceLangCompletion],
          activateOnTyping: true,
          // 行内已经有完整单词（如写了 `java` 之外的正文）时不打扰
          defaultKeymap: true,
        }),
        // 语法标记由装饰引擎隐藏，编辑器本体保持纯 Markdown
        livePreview(),
        themeCompartment.of(theme === 'dark' ? oneDark : []),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...completionKeymap,
          indentWithTab,
          { key: 'Mod-s', preventDefault: true, run: () => (void save(), true) },
          { key: 'Mod-shift-s', preventDefault: true, run: () => (void saveAs(), true) },
          { key: 'Mod-n', preventDefault: true, run: () => (newDoc(), true) },
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && id) updateContent(id, u.state.doc.toString())
        }),
        EditorView.lineWrapping,
        // 编辑区在 Typora 里是居中的窄栏，两侧留白
        EditorView.contentAttributes.of({ class: 'cm-typora-content' }),
      ],
    })

    const view = new EditorView({ state, parent: host.current })
    viewRef.current = view
    // 只在「空文档」时自动聚焦；打开已有文件不聚焦。
    // - 打开已有 md：用户要求编辑区**不显示光标**（原来 focus() 让光标停在
    //   第一个字符并闪烁）。不聚焦 → CodeMirror 未激活，selection 不渲染。
    //   用户点击编辑区后自动聚焦并显示光标，与 Typora 一致。
    // - 空文档（启动时的未命名页）：Typora 是直接可输入的，所以要聚焦。
    if (!doc) setTimeout(() => view.focus(), 0)
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 仅依赖 active / theme：切换文档或主题时重建视图。
    // updateContent 会改变 tabs，但绝不能进依赖数组，否则每次按键都重建视图（光标跳动）。
  }, [active, theme])

  // 大纲跳转：按行号定位光标并滚动到该行
  useEffect(() => {
    if (jumpLine == null) return
    const view = viewRef.current
    if (!view) return
    const pos = lineToPos(view.state, jumpLine)
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 24 }),
    })
    view.focus()
    setJumpLine(null)
  }, [jumpLine, setJumpLine])

  return <div className="editor-host" ref={host} />
}
