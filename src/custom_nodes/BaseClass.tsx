import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";

type LayerData = Record<string, any>;

// This enforces that the Class of node itself has these functions specified
export interface LayerStatic<D extends LayerData> {
    new (data?: D): BaseLayerNode<D>;
    getInitCode(data: D, name: string): string;
    // getForwardCode(data:D, name: string)
    Node: React.ComponentType<NodeProps<any>>;
    name: string;
}

export abstract class BaseLayerNode<D extends LayerData = LayerData> {
    data: D;

    constructor(data?: D) {
        this.data = data || ({} as D);
    }

    abstract get fields(): string[];
    abstract computeShape(): number | number[];

    update(key: keyof D, value: any) {
        this.data[key] = value;
    }
    renderExtraInputs?(): React.ReactNode;

    static get Node() {
        const ClassDefinition = this as unknown as LayerStatic<any>;
        return ({ id, data, isConnectable }: NodeProps<Node<any>>) => {
            const { setNodes } = useReactFlow();
            const layer = new ClassDefinition(data);
            const onChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
                const value = Number(e.target.value) || e.target.value;
                setNodes(nodes =>
                    nodes.map(node => {
                        if (node.id === id) {
                            return {
                                ...node,
                                data: { ...node.data, [key]: value },
                            };
                        }
                        return node;
                    })
                );
            };
            return (
                <div
                    className="layer-node"
                    style={{ backgroundColor: "#5a8be6", padding: "10px", borderRadius: "5px", color: "white" }}
                >
                    <Handle type="target" position={Position.Left} isConnectable={isConnectable} />

                    <div style={{ fontWeight: "bold", marginBottom: "5px" }}>{ClassDefinition.name}</div>

                    <div>
                        {/* Iterate over the defined FIELDS, not the data keys.
                           This ensures inputs appear even if data is empty.
                        */}
                        {layer.fields.map(key => (
                            <div key={key}>
                                <label style={{ fontSize: "12px" }}>
                                    {key}:
                                    <input
                                        className="nodrag"
                                        type="number"
                                        // Handle undefined data safely by falling back to empty string
                                        value={layer.data[key] ?? ""}
                                        onChange={onChange(key)}
                                        placeholder="0"
                                        style={{ marginLeft: "5px", width: "50px" }}
                                    />
                                </label>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: "5px", fontSize: "10px" }}>
                        Shape: {JSON.stringify(layer.computeShape())}
                    </div>

                    <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
                </div>
            );
        };
    }
}

type LinearData = { inFeatures: number; outFeatures: number };
export class LinearLayerNode extends BaseLayerNode<LinearData> {
    // 1. Define the inputs you want to show
    get fields() {
        return ["inFeatures", "outFeatures"];
    }

    // 2. Logic (Safe even if data is missing)
    computeShape() {
        return [this.data?.outFeatures];
    }
    static getInitCode(data: LinearData, name: string) {
        const i = data.inFeatures || 1;
        const o = data.outFeatures || 1;
        return `self.${name} = nn.Linear(${i}, ${o})`;
    }
}
