import { useEffect } from 'react'
import { useStore } from '../state/store'
import Toolbar from './Toolbar'
import Sidebar from './Sidebar'
import Tabs from './Tabs'
import Editor from './Editor'
import Preview from './Preview'
import Outline from './Outline'
import StatusBar from './StatusBar'
import SplitPane from './SplitPane'
import Welcome from './Welcome'

export default function App() {
  const init = useStore((s) => s.init)
  const active = useStore((s) => s.active)
  const ready = useStore((s) => s.ready)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="app">
      <Toolbar />
      <div className="body">
        <Sidebar />
        <div className="main">
          <Tabs />
          {ready && active ? (
            <SplitPane left={<Editor />} right={<Preview />} />
          ) : (
            <Welcome />
          )}
        </div>
        <Outline />
      </div>
      <StatusBar />
    </div>
  )
}
