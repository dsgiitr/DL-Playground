import FlowEditor from './FlowEditor.tsx'
// import { ModulePopupListener } from './nodes/ModulePopupListener.tsx'
import { ModulePopupStack } from './nodes/ModulePopupStack.tsx'

function App() {
  return (
    <>
      <FlowEditor />
      <ModulePopupStack />
      {/* <ModulePopupListener /> */}
    </>
  )
}

export default App
