import { useEffect } from 'react'
import { useStore } from '../state/store'
import { installHotkeys } from '../lib/commands'
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
 * 「外部改动 → Kore」这条同步方向的轮询间隔。
 *
 * 为什么用轮询而不是原生文件监听器（notify / chokidar）：
 *  - 本机没有 Rust 工具链，监听器要引入新 crate + 线程 + 事件回传，
 *    是一次无法在本地验证的改动；轮询是纯前端逻辑，可验证、无新依赖。
 *  - 只读「已展开的目录」，通常就是几个目录，一次 read_dir 的成本极低；
 *    且列表没变化时**不触发任何渲染**（见 store.refreshDir），不会有抖动。
 * 2 秒是「够快以至于察觉不到」与「足够省」之间的折中。
 *
 * 窗口重新获得焦点时也会立即刷一次 —— 用户在资源管理器里建完文件切回来，
 * 不必干等这 2 秒。
 */
const TREE_SYNC_MS = 2000

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
