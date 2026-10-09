import { useStore } from '../state/store'
import { AlertTriangle, Info, X } from 'lucide-react'
import { openExternal, RELEASES_PAGE } from '../lib/updater'

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
      {notice.action === 'release' && (
        <button
          className="banner-action"
          onClick={() => {
            // 打不开就把链接明文贴出来，让用户能手动复制 ——
            // 「点了没反应且不告诉你链接在哪」是最糟的失败方式。
            // 这里刻意去掉 action：提示条变成一条纯信息（带可复制的地址），
            // 而不是继续挂着一个点了还是没反应的按钮。
            void openExternal(RELEASES_PAGE).then((ok) => {
              if (!ok) {
                setNotice({
                  kind: 'info',
                  text: `无法自动打开浏览器，请手动访问：${RELEASES_PAGE}`,
                })
              }
            })
          }}
        >
          前往下载
        </button>
      )}
      <button className="banner-close" onClick={() => setNotice(null)} title="关闭">
        <X size={14} />
      </button>
    </div>
  )
}
