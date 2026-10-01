import { useMemo } from 'react'
import { useStore } from '../state/store'
import { extractOutline } from '../lib/outline'

export default function Outline() {
  const active = useStore((s) => s.active)
  const tabs = useStore((s) => s.tabs)
  const tab = tabs.find((t) => t.path === active)
  const items = useMemo(() => extractOutline(tab?.content ?? ''), [tab?.content])

  if (!active) {
    return (
      <aside className="outline no-print">
        <div className="outline-title">大纲</div>
        <div className="outline-empty">打开文件后显示大纲</div>
      </aside>
    )
  }

  const onClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="outline no-print">
      <div className="outline-title">大纲</div>
      <ul>
        {items.map((it, i) => (
          <li key={i} className={`lv-${it.level}`} onClick={() => onClick(it.id)}>
            {it.text}
          </li>
        ))}
      </ul>
    </aside>
  )
}
