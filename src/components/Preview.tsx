import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { renderMarkdown } from '../lib/markdown'
import DOMPurify from 'dompurify'

export default function Preview() {
  const active = useStore((s) => s.active)
  const tabs = useStore((s) => s.tabs)
  const setPreviewHtml = useStore((s) => s.setPreviewHtml)
  const tab = tabs.find((t) => t.path === active)
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    const src = tab?.content ?? ''
    const t = setTimeout(() => {
      renderMarkdown(src).then((raw) => {
        if (cancelled) return
        const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
        setHtml(clean)
        setPreviewHtml(clean)
      })
    }, 60)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [tab?.content, active, setPreviewHtml])

  return (
    <div className="preview-pane">
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
