import { useEffect } from 'react'
import { useStore } from '../state/store'
import { installHotkeys } from '../lib/commands'
import { fsApi } from '../lib/fs'
import MenuBar from './MenuBar'
import Banner from './Banner'
import Sidebar from './Sidebar'
import SidebarResizer from './SidebarResizer'
import DocBar from './DocBar'
import StatusBar from './StatusBar'
import ConfirmSwitch from './ConfirmSwitch'
import Editor from './Editor'
import Welcome from './Welcome'

/**
 * 「外部改动 → Kore」这条同步方向的兜底轮询间隔。
 *
 * 主路径已经换成**内核级文件监听**（见 src-tauri/src/watch.rs）：
 * 桌面端在资源管理器里删一个文件，事件在几十毫秒内就到，文件树随即更新，
 * 与 Typora 的实时感一致。这个定时器只是**保险丝**：
 *  - 监听本身可能失败（网络盘 / 权限受限的目录 / 不支持的 fs），此时它是唯一通路；
 *  - 事件通道理论上也可能漏（跨卷移动、某些虚拟文件系统），周期性对账能自愈；
 *  - 浏览器模式没有监听能力（File System Access API 无变更通知），全靠它。
 *
 * 所以间隔取的是「够快以至于察觉不到」而不是「够省」：
 * 监听正常时它几乎不产生可感知成本（只读几个已展开目录；列表没变就完全不 setState），
 * 而一旦监听失效，它就是用户唯一的同步来源，慢一点都会被立刻发现。
 * 窗口重新获得焦点时也会立即刷一次 —— 用户在资源管理器里建完文件切回来，
 * 不必干等这 1.5 秒。
 */
const TREE_SYNC_MS = 1500

export default function App() {
  const init = useStore((s) => s.init)
  const active = useStore((s) => s.active)
  const ready = useStore((s) => s.ready)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const sidebarW = useStore((s) => s.sidebarW)

  useEffect(() => {
    void init()
  }, [init])

  // 全局快捷键（Ctrl+S / Ctrl+Shift+S / Ctrl+Shift+N 等），只装一次
  useEffect(() => installHotkeys(), [])

  // 文件树 ↔ 磁盘双向同步的「磁盘 → Kore」方向。
  //
  // 反方向（Kore 里新建/删除 → 磁盘）是直接落盘的，并在 store 里主动重读目录，
  // 不需要这里参与。这一侧负责「用户在资源管理器 / 别的编辑器里动了文件」：
  // 新建了一个 .md、删掉了一个文件夹 —— 文件树要跟着变。
  //
  // 两条通路（快 → 慢）：
  //  1. 桌面端：Rust 的 notify 监听器推 `kore://fs-change` → 立即 refreshTree。
  //     这是主路径，延迟在毫秒级。
  //  2. 兜底：定时轮询（见 TREE_SYNC_MS 的注释）+ 窗口重新获得焦点时立即刷。
  const rootPath = useStore((s) => s.rootPath)
  useEffect(() => {
    const refresh = () => void useStore.getState().refreshTree()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    // 窗口重新获得焦点：立刻刷，不用等下一次轮询
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => {
      // 页面不可见时（切走 / 最小化）不做无谓的磁盘读取
      if (document.visibilityState === 'visible') refresh()
    }, TREE_SYNC_MS)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [])

  // 实时监听：工作区变化时由内核事件驱动刷新（仅桌面端，失败自动退回上面的轮询）。
  // 依赖 rootPath —— 换工作区要重新监听新目录，旧监听在取消函数里被卸掉。
  useEffect(() => {
    if (!rootPath) return
    let dispose: (() => void) | null = null
    let cancelled = false
    void fsApi.watchWorkspace(rootPath, () => {
      void useStore.getState().refreshTree()
    }).then((fn) => {
      // 组件已经卸载 / 工作区已经切走：立刻把刚建立的监听撤掉，避免泄漏
      if (cancelled) fn()
      else dispose = fn
    })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [rootPath])

  // 关闭页面前提醒未保存内容
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const dirty = useStore.getState().tabs.some((t) => t.dirty)
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return (
    <div className="app">
      <MenuBar />
      <Banner />
      <div className="body">
        {sidebarOpen && (
          <Sidebar style={{ width: sidebarW }} />
        )}
        {sidebarOpen && <SidebarResizer />}
        <div className="main">
          {ready && active ? <Editor /> : <Welcome />}
        </div>
      </div>
      <DocBar />
      <StatusBar />
      <ConfirmSwitch />
    </div>
  )
}
