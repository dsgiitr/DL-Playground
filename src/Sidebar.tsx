import { nodeTypes } from './types/nodeTypes'

export default function Sidebar() {
  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside style={{ background: '#484444', padding: '2vw' }}>
      {Object.keys(nodeTypes).map(type => (
        <div
          key={type}
          style={{
            padding: 8,
            border: '1px solid #888',
            borderRadius: 4,
            cursor: 'grab',
            marginBottom: 8
          }}
          draggable
          onDragStart={event => onDragStart(event, type)}
        >
          {type}
        </div>
      ))}
    </aside>
  )
}
