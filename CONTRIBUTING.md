# Contributing to DL-Playground

First off, thank you for considering contributing to DL-Playground! We're excited to have you. This project is a community effort, and every contribution, from a small typo fix to a new feature, is highly valued.

This document provides guidelines for contributing to the project and gives an overview of its architecture to help you get started.

## How to Contribute

We welcome contributions in many forms:

- **Reporting Bugs**: If you find a bug, please open an issue in our [GitHub issue tracker](https://github.com/dsgiitr/DL-Playground/issues). Describe the issue in detail, including steps to reproduce it.
- **Suggesting Enhancements**: Have an idea for a new feature or an improvement to an existing one? Open an issue to discuss it.
- **Pull Requests**: If you're ready to contribute code, we'd be happy to review it!
- **Extending Pytorch Support**: You can contribute by adding more Pytorch primitive layers that have not yet been added.

### Submitting a Pull Request (PR)

1.  **Fork the Repository**: Create your own copy of the project to work on.
2.  **Create a Branch**: Make a new branch from `main` for your changes (e.g., `git checkout -b feature/add-awesome-layer`).
3.  **Make Your Changes**: Write your code. Make sure to adhere to the existing code style.
4.  **Commit Your Changes**: Use clear and descriptive commit messages.
5.  **Push and Open a PR**: Push your branch to your fork and open a pull request against the `main` branch of the original repository. Provide a clear description of the changes you've made.
6.  **Request Code Review**: Request code review from one of the maintainers and wait for approval.

---

## Project Architecture

Understanding the project's structure is key to contributing effectively. DL-Playground is split into two main parts: a frontend for the visual interface and a backend for Python-based analysis.

### Frontend (`/src`)

The frontend is a [React](https://react.dev/) application built with [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vitejs.dev/). This is where most of the core logic lives.

- **Main Entry Point**: `src/main.tsx` renders the main `<App />` component.
- **Core Editor UI**: `src/FlowEditor.tsx` is the central component that brings together the different parts of the editor: the sidebar, the canvas, and the code panel.
- **Graph Visualization**: We use [React Flow](https://reactflow.dev/) (`@xyflow/react`) to render and manage the graph of nodes and edges on the canvas.
- **State Management**:
    - React Flow's internal state manages the positions of nodes and the connections between them.
    - Application-level state (e.g., module definitions, graph history for undo/redo) is managed through custom React hooks located in `src/features/editor/hooks/`. Key hooks include:
        - `useGraphState.ts`: Manages the core state of nodes and edges.
        - `useModuleSystem.ts`: Handles logic for creating and managing reusable modules.
        - `useCodeGeneration.ts`: Triggers the code generation process whenever the graph changes.

### Code Generation Workflow

The process of turning a visual graph into Python code happens in the frontend.

- **The Compiler**: The file `src/utils/codeCompile.ts` is the heart of the code generation engine.
- **The Process**:
    1.  When the graph changes, `useCodeGeneration.ts` calls `recursiveCodeGenerator`.
    2.  This function performs a **topological sort** on the nodes to determine the correct execution order in the `forward` method.
    3.  It then iterates through the sorted nodes and calls two static methods on each node's class definition:
        - `getInitCode()`: Generates the Python code for the layer's initialization in the `__init__` method (e.g., `self.conv1 = nn.Conv2d(...)`).
        - `getForwardCode()`: Generates the code for the layer's execution in the `forward` method (e.g., `x = self.conv1(x)`).
        - For container layers (such as `ModuleRefNode`, the responsibility of computing the internal graph is delegated to their own nodes.)
    4.  The generated snippets are assembled into a complete, valid `nn.Module` class string.

---

## How to Add a New Layer

Adding a new neural network layer is a great way to start contributing. Here’s a step-by-step guide.

### Step 1: Create the Node Component

Create a new file for your layer based on its domain (pytorch-core, tensor operation, vision, sequence etc), for example: `src/nodes/vision/MyAwesomeLayer.tsx`.

Your component will define the layer's parameters, its default values, and the UI for editing them. The best way to start is by copying an existing simple layer (like `src/nodes/dense/LinearLayer.tsx`) and modifying it. Follow the interface specified in `src/node_gen/BaseClass.tsx` to create required class methods.

The component is created using the `CreateNodeComponent` helper, which handles a lot of the boilerplate. You will need to provide:

1.  **`paramSchema`**: An object defining the parameters for your layer (e.g., `in_features`, `out_features`).
2.  **`getInitCode`**: A function that returns the Python string for the `__init__` method.
3.  **`getForwardCode`**: A function that returns the Python string for the `forward` method.
4.  **`Component`**: A React component that renders the node itself in the canvas.
5.  optional `estimateCost` functionality if mathematical formula is available.

```tsx
// src/nodes/my_layers/MyAwesomeLayer.tsx (Example)
import { CreateNodeComponent } from "../../node_gen/CreateNodeComponent";
import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
// 1. Define the Data format for the internal state of the node
type MyLayerData = {
    param1: number;
    param2: string;
    optparam3?: boolean;
};

// 2. Create the node component using the helper
export class MyAwesomeLayerNode {
    // displayed on the node's heading
    static label = "Awesome Layer";
    // structure of parameters (refer to Conv2d implementation for extensive example)
    static paramSchema: Record<string, FieldSpec> = {
        param1: {
            required: true,
            type: "number",
            label: "First Parameter",
            defaultValue: 1,
            step: 1,
        },
        param2: {
            required: true,
            type: "text",
            label: "Text Parameter",
            defaultValue: "",
        },
        param3: {
            required: false,
            type: "boolean",
            label: "Optional Parameter",
            defaultValue: true,
        },
    };
    // Validation of incoming shapes to look for mismatches
    static shapeVerifier(data: MyLayerData, inputShapes: number[][]) {
        ...
    }
    // Computing next step shape if input shapes have been validated
    static shapeCompute(data: MyLayerData, inputShapes: number[][]){
        ...
    }
    // For estimating FLOPs and learnable params used.
    static estimateCost(data: MyLayerData, inputShapes: number[][]){
        ...
    }
    // For displaying "__init__" code in code panel
    static getInitCode(data: MyLayerData, name: string) {
        const param1 = getParamValue(this.paramSchema, data, "param1");
        const param2 = getParamValue(this.paramSchema, data, "param2");
        const optparam3 = getParamValue(this.paramSchema, data, "param3");
        // notice how boolean, numbers and text is formated differently
        return `self.${name} = nn.MyAwesomeLayer(param1=${param1}, param2="${param2}", opt_param=${optparam3 ? "True" : "False"})`;
    }
    // Standard forward code implementation. refer to torch operation node implementations for non-standard getforwardcode.
    static getForwardCode(_data: MyLayerData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar}, _ = self.${name}(${inputVar})`;
    }
    // BoilerPlate component. refer to ModuleListNode and ModuleRefNode for ways to create your own components
    static Component = createLayerComponent<MyLayerData>(MyAwesomeLayer.label, MyAwesomeLayer.paramSchema);
}
```

### Step 2: Register the New Node

To make your new layer appear in the editor's sidebar, you need to register it.

Open `src/nodes/registry.ts` and import your new node component. Then, add it to one of the existing `NODE_GROUPS` or create a new one.

```ts
// src/nodes/registry.ts

// ... other imports
import { MyAwesomeLayerNode } from "./my_layers/MyAwesomeLayer"; // 1. Import your node

// ...

export const NODE_GROUPS: Record<string, NodeGroup> = {
    // ... other groups
    my_layers: {
        // 2. Add to a new or existing group
        label: "My Awesome Layers",
        nodes: {
            my_awesome_layer: MyAwesomeLayerNode,
        },
    },
    // ...
};

// ... the rest of the file handles registration automatically
```

### Step 3: Test It!

Run the application (`npm run dev`) and you should see your new layer in the sidebar. Drag it onto the canvas, connect it, and watch it appear in the generated code!

---

## Beyond Adding Layers

While adding PyTorch primitives is highly valuable, DL-Playground is a complex application with plenty of other areas that need love. If you are interested in core application development, here are some great ways to contribute:

- **Performance & Graph Optimization**: As architectures grow larger, managing the React Flow canvas state and re-rendering can get expensive. Contributions that optimize graph traversal, improve the algorithmic efficiency of the topological sort in recursiveCodeGenerator, or reduce latency in frontend shape computation are always welcome.

- **Backend Development (WIP)**: Help improve the Go API and MongoDB database integration. This includes optimizing how user sessions are managed, how large graph architectures are serialized and saved, or building out features for users to share templates.

- **UI/UX Enhancements**: Improving the developer experience within the editor. This could involve adding keyboard shortcuts, improving the minimap, creating better visual feedback for shape mismatch errors, or enhancing the syntax highlighting in the code panel.

- **Testing & Reliability**: Machine learning tools require high precision. Writing unit tests for the shapeCompute methods, ensuring the recursiveCodeGenerator handles edge cases (like complex skip connections), and adding frontend component tests make the project more robust.

- **Documentation & Examples**: Building out a library of pre-configured architectures (like a standard ResNet block or a basic Transformer encoder) that users can load instantly.
