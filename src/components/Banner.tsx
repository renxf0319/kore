import { useStore } from '../state/store'
import { AlertTriangle, Info, X } from 'lucide-react'
import { openExternal, RELEASES_PAGE, runInAppUpdate } from '../lib/updater'

// 顶部提示条：把从前被静默吞掉的错误/权限状态显式告诉用户
export default function Banner() {
  const notice = useStore((s) => s.notice)
  const setNotice = useStore((s) => s.setNotice)
  const regrantRoot = useStore((s) => s.regrantRoot)
  const isTauri = useStore((s) => s.mode === 'tauri')

  if (!notice) return null

  /** 退路：跳浏览器下载页（与应用内更新并存，互为兜底） */
  const openDownloadPage = () => {
    void openExternal(RELEASES_PAGE).then((ok) => {
      if (!ok) {
        setNotice({
          kind: 'info',
          text: `无法自动打开浏览器，请手动访问：${RELEASES_PAGE}`,
        })
      }
    })
  }

  return (
    <div className={`banner ${notice.kind} no-print`} role="status">
      {notice.kind === 'error' ? <AlertTriangle size={15} /> : <Info size={15} />}
      <span className="banner-text">{notice.text}</span>
      {notice.action === 'regrant' && (
        <button className="banner-action" onClick={() => void regrantRoot()}>
          重新授权
        </button>
      )}
      {notice.action === 'update' && isTauri && (
        <>
          <button className="banner-action" onClick={() => runInAppUpdate(setNotice)}>
            立即更新
          </button>
          <button className="banner-action subtle" onClick={openDownloadPage}>
            前往下载
          </button>
        </>
      )}
      {/* 浏览器模式没有应用内更新能力，只给下载页 */}
      {(notice.action === 'release' || (notice.action === 'update' && !isTauri)) && (
        <button className="banner-action" onClick={openDownloadPage}>
          前往下载
        </button>
      )}
      <button className="banner-close" onClick={() => setNotice(null)} title="关闭">
        <X size={14} />
      </button>
    </div>
  )
}
