import { Position, Handle, type Node, type NodeProps, useReactFlow } from '@xyflow/react'

type NeuronData = {
  inFeatures: number
  outFeatures: number
}

export type Neuron = Node<NeuronData,'neuron'>

export default function LinearNode({ id, data }: NodeProps<Neuron>) {
  const { setNodes } = useReactFlow()

  const onInFeaturesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value) || 0

    setNodes(nodes =>
      nodes.map(node =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                inFeatures: value,
              },
            }
          : node
      )
    )
  }

  const onOutFeaturesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value) || 0
    setNodes(nodes =>
      nodes.map(node =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                outFeatures: value,
              },
            }
          : node
      )
    )
  }

  return (
    <div className="perceptron-node" style={{backgroundColor: '#5a8be6'}}>
      <Handle type="target" position={Position.Left} id="in-1" />

      <div>
        <div>LinearLayer</div>

        <label>
          in_features:
          <input
            type="number"
            value={data.inFeatures}
            onChange={onInFeaturesChange}
          />
        </label>
    <br></br>
        <label>
          out_features:
          <input
            type="number"
            value={data.outFeatures}
            onChange={onOutFeaturesChange}
          />
        </label>
      </div>

      <Handle type="source" position={Position.Right} id="out" />
    </div>
  )
}
