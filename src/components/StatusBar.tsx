import { useStore } from '../state/store'

export default function StatusBar() {
  const active = useStore((s) => s.active)
  const tabs = useStore((s) => s.tabs)
  const theme = useStore((s) => s.theme)
  const mode = useStore((s) => s.mode)
  const tab = tabs.find((t) => t.path === active)
  const text = tab?.content ?? ''
  const words = (text.match(/[A-Za-z0-9_一-鿿]+/g) || []).length
  const chars = text.length
  const lines = text ? text.split('\n').length : 0

  return (
    <footer className="statusbar no-print">
      <span className="sb-file">{tab?.name ?? '无文件'}</span>
      <span className="dot" />
      <span>{words} 词</span>
      <span>{chars} 字</span>
      <span>{lines} 行</span>
      <span className="spacer" />
      <span>{tab?.dirty ? '未保存' : '已保存'}</span>
      <span>{mode === 'tauri' ? '桌面端' : '浏览器端'}</span>
      <span>{theme === 'dark' ? '暗色' : '亮色'}</span>
    </footer>
  )
}
