import { ReactFlow, ReactFlowProvider, Background, useReactFlow } from '@xyflow/react'
import Sidebar from './Sidebar.tsx'
import '@xyflow/react/dist/style.css'
import { useState, useCallback } from 'react';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type FitViewOptions,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type OnNodeDrag,
  type DefaultEdgeOptions,
} from '@xyflow/react';
import { nodeTypes } from './types/nodeTypes'
import {edgeTypes} from './types/edgeTypes'
import {useEffect} from 'react'

let id = 0
const getId = () => `node-${id++}`

const initialNodes: Node[] = [
  { id: '1', data: { label: 'Node 1' }, position: { x: 5, y: 5 } },
  { id: '2', data: { label: 'Node 2' }, position: { x: 5, y: 100 } },
];
 
const initialEdges: Edge[] = [{ id: 'e1-2', source: '1', target: '2', type:'custom' }];


const fitViewOptions: FitViewOptions = {
  padding: 0.2,
};
 
const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
};
 
const onNodeDrag: OnNodeDrag = (_, node) => {
  console.log('drag event', node.data);
};

function FlowContent() {
    const savedNodes = JSON.parse(localStorage.getItem("nodes")||"")
    const savedEdges = JSON.parse(localStorage.getItem("edges")||"")
    const [nodes, setNodes] = useState<Node[]>(savedNodes);
    const [edges, setEdges] = useState<Edge[]>(savedEdges);

    const { screenToFlowPosition } = useReactFlow()
    
    const onNodesChange: OnNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        [setNodes],
    );
    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        [setEdges],
    );
    const onConnect: OnConnect = useCallback(
        (connection) => setEdges((eds) => addEdge(connection, eds)),
        [setEdges],
    );
    const onDragOver = (event: React.DragEvent) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
    }

    useEffect(() => {
        const savedNodes = localStorage.getItem("nodes")
        const savedEdges = localStorage.getItem("edges")

        if (savedNodes) setNodes(JSON.parse(savedNodes))
        if (savedEdges) setEdges(JSON.parse(savedEdges))
    }, [])

    useEffect(() => {
        localStorage.setItem("nodes", JSON.stringify(nodes))
        localStorage.setItem("edges", JSON.stringify(edges))
  }, [nodes, edges])

    const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow')
      if (!type) return

        const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        })

        const newNode: Node = {
            id: getId(),
            type: type,
            position,
            data: {},
        }

        setNodes(nds => nds.concat(newNode))
        },
        [screenToFlowPosition, setNodes]
    )

  return (
    <div style={{display: 'flex', height:'100vh'}}>
      <Sidebar/>
      <div style={{width:'80vw'}}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        onDrop={onDrop}
        onDragOver={onDragOver}
        defaultEdgeOptions={defaultEdgeOptions}>
        <Background/>
        </ReactFlow>
      </div>
    </div>
  )
}

export default function Flow() {
  return (
    <ReactFlowProvider>
      <FlowContent />
    </ReactFlowProvider>
  );
}