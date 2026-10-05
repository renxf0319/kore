import { useEffect, useRef } from 'react'
import { X, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../state/store'

// 底部标签栏（Typora 的位置）：左右滚动箭头 + 标签 + 新建按钮
export default function Tabs() {
  const tabs = useStore((s) => s.tabs)
  const active = useStore((s) => s.active)
  const setActive = useStore((s) => s.setActive)
  const closeTab = useStore((s) => s.closeTab)
  const newDoc = useStore((s) => s.newDoc)
  const stripRef = useRef<HTMLDivElement>(null)

  const scrollBy = (dx: number) => {
    stripRef.current?.scrollBy({ left: dx, behavior: 'smooth' })
  }

  // 激活标签滚动进可视区
  useEffect(() => {
    const el = stripRef.current?.querySelector('.tab.active')
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [active])

  return (
    <div className="tabbar no-print">
      <button className="tabbar-arrow" onClick={() => scrollBy(-200)} title="向左滚动" aria-label="向左滚动">
        <ChevronLeft size={14} />
      </button>
      <div className="tabbar-strip" ref={stripRef}>
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab${t.id === active ? ' active' : ''}${t.dirty ? ' dirty' : ''}`}
            onClick={() => setActive(t.id)}
            title={t.path ?? '未命名'}
          >
            <span className="tab-name">{t.name}</span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
              aria-label={`关闭 ${t.name}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <button className="tabbar-arrow" onClick={() => scrollBy(200)} title="向右滚动" aria-label="向右滚动">
        <ChevronRight size={14} />
      </button>
      <button className="tabbar-new" onClick={newDoc} title="新建文档" aria-label="新建文档">
        <Plus size={14} />
      </button>
    </div>
  )
}
