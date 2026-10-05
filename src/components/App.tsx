import { useEffect } from 'react'
import { useStore } from '../state/store'
import MenuBar from './MenuBar'
import Banner from './Banner'
import Sidebar from './Sidebar'
import DocBar from './DocBar'
import StatusBar from './StatusBar'
import ConfirmSwitch from './ConfirmSwitch'
import Editor from './Editor'
import Welcome from './Welcome'

export default function App() {
  const init = useStore((s) => s.init)
  const active = useStore((s) => s.active)
  const ready = useStore((s) => s.ready)
  const sidebarOpen = useStore((s) => s.sidebarOpen)

  useEffect(() => {
    void init()
  }, [init])

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
        {sidebarOpen && <Sidebar />}
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
