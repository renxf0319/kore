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
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { useStore } from '../state/store'
import { livePreview, lineToPos } from '../lib/wysiwyg'

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
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        // Typora 风格：语法标记由装饰引擎隐藏，编辑器本体保持纯 Markdown
        livePreview(),
        themeCompartment.of(theme === 'dark' ? oneDark : []),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
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
    if (id) setTimeout(() => view.focus(), 0)
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
