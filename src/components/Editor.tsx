import { useEffect, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  indentOnInput,
  bracketMatching,
} from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { useStore } from '../state/store'

const themeCompartment = new Compartment()

export default function Editor() {
  const host = useRef<HTMLDivElement>(null)
  const active = useStore((s) => s.active)
  const theme = useStore((s) => s.theme)
  const tabs = useStore((s) => s.tabs)
  const updateContent = useStore((s) => s.updateContent)
  const saveActive = useStore((s) => s.saveActive)

  useEffect(() => {
    if (!host.current) return
    const tab = tabs.find((t) => t.path === active)
    const doc = tab?.content ?? ''

    const onDocChange = (content: string) => {
      if (active) updateContent(active, content)
    }
    const onSave = () => {
      void saveActive()
    }

    const state = EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        themeCompartment.of(theme === 'dark' ? oneDark : []),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              onSave()
              return true
            },
          },
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onDocChange(u.state.doc.toString())
        }),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: host.current })
    return () => view.destroy()
  }, [active, theme, tabs, updateContent, saveActive])

  return <div className="editor-pane no-print" ref={host} />
}
