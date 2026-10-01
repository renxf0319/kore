import { useStore } from '../state/store'
import { AlertTriangle, Info, X } from 'lucide-react'

// 顶部提示条：把从前被静默吞掉的错误/权限状态显式告诉用户
export default function Banner() {
  const notice = useStore((s) => s.notice)
  const setNotice = useStore((s) => s.setNotice)
  const regrantRoot = useStore((s) => s.regrantRoot)

  if (!notice) return null

  return (
    <div className={`banner ${notice.kind} no-print`} role="status">
      {notice.kind === 'error' ? <AlertTriangle size={15} /> : <Info size={15} />}
      <span className="banner-text">{notice.text}</span>
      {notice.action === 'regrant' && (
        <button className="banner-action" onClick={() => void regrantRoot()}>
          重新授权
        </button>
      )}
      <button className="banner-close" onClick={() => setNotice(null)} title="关闭">
        <X size={14} />
      </button>
    </div>
  )
}
