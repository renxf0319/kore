import { useStore } from '../state/store'
import { X } from 'lucide-react'

export default function Tabs() {
  const tabs = useStore((s) => s.tabs)
  const active = useStore((s) => s.active)
  const setActive = useStore((s) => s.setActive)
  const closeTab = useStore((s) => s.closeTab)

  if (tabs.length === 0) return null

  return (
    <div className="tabs no-print">
      {tabs.map((t) => (
        <div
          key={t.path}
          className={`tab ${t.path === active ? 'active' : ''} ${t.dirty ? 'dirty' : ''}`}
          onClick={() => setActive(t.path)}
          title={t.path}
        >
          <span className="tab-name">{t.name}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(t.path)
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
