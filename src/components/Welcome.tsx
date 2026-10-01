import { useStore } from '../state/store'
import { wordmarkSrc } from '../lib/logo'

export default function Welcome() {
  const theme = useStore((s) => s.theme)

  return (
    <div className="welcome">
      <div className="welcome-card">
        <img className="welcome-wordmark" src={wordmarkSrc(theme)} alt="Kore" />
        <p className="subtitle">极速 · 本地 · 开源的 Markdown 编辑器</p>
        <p className="hint">
          点击右上角「打开文件夹」选择本地目录开始
        </p>
      </div>
    </div>
  )
}
