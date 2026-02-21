# DL-Playground: A Visual Deep Learning Prototyping Tool

**DL-Playground is an interactive, web-based visual editor for designing, prototyping, and understanding PyTorch neural network architectures.**

This tool provides an intuitive drag-and-drop interface that empowers developers and learners to build complex deep learning models without writing code from scratch. See your architecture come to life, from individual layers to complete computational graphs, and instantly generate the corresponding Python code.

<!-- Add a screenshot or GIF of the editor in action here! -->
<!-- ![DL-Playground Screenshot](link-to-your-screenshot.png) -->

---

## Key Features

- **Visual Graph Editor**: Built with React Flow, allowing for intuitive drag-and-drop construction of models. Connect, arrange, and configure layers with ease.
- **Extensive Node Library**: A rich collection of PyTorch layers and operations, including:
    - **Core Layers**: Linear, Activations (ReLU, Sigmoid, etc.), Softmax, Flatten, Reshape.
    - **Convolutional/Vision**: Conv2d, MaxPool2d, AvgPool2d, Upsample, Residual Blocks.
    - **Recurrent/Sequence**: LSTM, GRU, RNN, Multi-head Attention, Embeddings.
    - **Losses & Metrics**: MSELoss, CrossEntropyLoss, BCELoss, Accuracy.
- **Real-time Code Generation**: Instantly compiles the visual graph into a clean, readable, and copy-pasteable PyTorch `nn.Module` class, complete with `__init__` and `forward` methods.
- **Modular & Reusable Components**: Encapsulate parts of your graph into custom modules and reuse them throughout your architecture, promoting a clean and organized workflow.
- **Live Shape Inference**: Calculates and displays tensor shapes as you build, helping to debug shape-related errors before they happen.
- **Model Inspection**: Leverage the integrated `torchlens` backend to analyze and visualize model summaries and internal states.
- **Built-in Code Editor**: A Monaco-powered editor to view and refine the generated Python code directly in the application.
- **Export to Image**: Export your final graph visualization as a PNG image for documentation or presentations.

---

## Technology Stack

- **Frontend**:
    - **Framework**: React (with Vite)
    - **Language**: TypeScript
    - **Graph Visualization**: React Flow
    - **Layout Engine**: ELK.js / Dagre
    - **Code Editor**: Monaco Editor
- **Backend**:
    - **Framework**: FastAPI
    - **Language**: Python
    - **Deep Learning**: PyTorch
    - **Model Analysis**: TorchLens
    - **Server**: Uvicorn

---

## Getting Started

To get the application running locally, follow these steps.

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/DL-Playground.git
cd DL-Playground
```

### 2. Set Up the Backend (Python)

The backend powers model analysis features.

```bash
# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install the required Python packages
pip install -r backend/requirements.txt
```

### 3. Set Up the Frontend (Node.js)

The frontend is the main visual editor interface.

```bash
# Install the necessary Node.js packages
npm install
```

### 4. Run the Application

You need to run both the backend and frontend servers in separate terminal windows.

**Terminal 1: Start the Backend Server**

```bash
# This will serve the torchlens API
uvicorn backend.torchlens_server:app --host 0.0.0.0 --port 8000
```

The backend will be available at `http://localhost:8000`.

**Terminal 2: Start the Frontend Development Server**

```bash
# This will start the React application
npm run dev
```

The frontend will be available at `http://localhost:5173` (or another port if 5173 is in use). Open this URL in your browser to start using the playground!

---

## How to Use

1.  **Open the Application**: Navigate to the frontend URL in your browser.
2.  **Add Nodes**: Drag layers and operations from the sidebar onto the canvas.
3.  **Configure Nodes**: Click on a node to adjust parameters like kernel size, output features, etc.
4.  **Connect Nodes**: Drag from the output handle of one node to the input handle of another to create a connection.
5.  **View Generated Code**: As you build the graph, the corresponding PyTorch code will automatically update in the "Code" panel.
6.  **Create Modules**: Select a group of nodes using <kbd>Shift + L-Click</kbd> and save a module to create your own building block.
7.  **Export**: Use the export buttons to save a SVG image of your graph or copy the generated Python code.

---

## Contributing

This project is a combined effort from the DSG Club and SDSLabs at IIT Roorkee.

Contributions are welcome! If you have ideas for new features, bug fixes, or improvements, please feel free to open an issue or submit a pull request. See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.
