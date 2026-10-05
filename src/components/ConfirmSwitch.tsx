import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'

// 未保存拦截对话框：切换文档前出现，提供「保存 / 放弃 / 取消」。
// 「保存」= 先存盘再执行原动作；存盘失败（用户取消另存为）则**中止**切换，
// 否则用户点了保存却在没存成的情况下丢了内容。
export default function ConfirmSwitch() {
  const pending = useStore((s) => s.pendingSwitch)
  const resolveDiscard = useStore((s) => s.resolveDiscard)
  const cancelSwitch = useStore((s) => s.cancelSwitch)
  const save = useStore((s) => s.save)
  const tab = useStore((s) => (s.active ? (s.tabs.find((t) => t.id === s.active) ?? null) : null))
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelSwitch()
      // Enter = 保存（最常用），等价于点「保存」
      if (e.key === 'Enter') void onSave()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!pending || !tab) return null

  const onSave = async () => {
    const action = useStore.getState().pendingSwitch
    await saveRef.current()
    // 保存后仍脏 = 落盘失败（比如用户在另存为里点了取消）→ 放弃切换
    if (useStore.getState().activeTab()?.dirty) return
    useStore.setState({ pendingSwitch: null })
    action?.()
  }

  return (
    <div className="modal-mask no-print" role="dialog" aria-modal="true" aria-labelledby="cs-title">
      <div className="modal">
        <div className="modal-title" id="cs-title">
          当前文档尚未保存
        </div>
        <div className="modal-body">
          「{tab.name}」有未保存的修改。要保存它再切换吗？
        </div>
        <div className="modal-actions">
          <button className="modal-btn" onClick={() => void onSave()}>
            保存
          </button>
          <button className="modal-btn" onClick={resolveDiscard}>
            放弃
          </button>
          <button className="modal-btn ghost" onClick={cancelSwitch}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
