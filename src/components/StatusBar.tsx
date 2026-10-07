import { useStore } from '../state/store'
import { kindLabel } from '../lib/filetype'

export default function StatusBar() {
  const active = useStore((s) => s.active)
  const tabs = useStore((s) => s.tabs)
  const theme = useStore((s) => s.theme)
  const mode = useStore((s) => s.mode)
  const tab = tabs.find((t) => t.id === active)
  const text = tab?.content ?? ''
  const words = (text.match(/[A-Za-z0-9_一-鿿]+/g) || []).length
  const chars = text.length
  const lines = text ? text.split('\n').length : 0
  // 未命名文档没有扩展名，不显示类型标签（默认就是 Markdown）
  const kind = tab?.path ? kindLabel(tab.path) : null

  return (
    <footer className="statusbar no-print">
      <span className="sb-file">{tab?.name ?? '无文档'}</span>
      {kind && (
        <>
          <span className="dot" />
          <span className="sb-kind">{kind}</span>
        </>
      )}
      <span className="dot" />
      <span>{words} 词</span>
      <span>{chars} 字</span>
      <span>{lines} 行</span>
      <span className="spacer" />
      <span>{tab ? (tab.dirty ? '未保存' : '已保存') : ''}</span>
      <span>{mode === 'tauri' ? '桌面端' : '浏览器端'}</span>
      <span>{theme === 'dark' ? '黑色' : '白色'}</span>
    </footer>
  )
}
