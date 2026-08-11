import { useStore } from './store'
import { EmptyState } from './components/EmptyState'
import { TopBar } from './components/TopBar'
import { ChatPanel } from './components/ChatPanel'
import { CanvasView } from './components/CanvasView'
import { LayerPanel } from './components/LayerPanel'
import { VersionTimeline } from './components/VersionTimeline'
import { CompareView } from './components/CompareView'
import { ExportDialog } from './components/ExportDialog'
import { AgentActivity } from './components/AgentActivity'

export default function App() {
  const { state } = useStore()

  if (!state.project) {
    return <EmptyState />
  }

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <ChatPanel />
        <CanvasView />
        <LayerPanel />
      </div>
      <VersionTimeline />
      {state.compare.open && <CompareView />}
      {state.exportOpen && <ExportDialog />}
      {state.activityOpen && <AgentActivity />}
    </div>
  )
}
