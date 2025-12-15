## TorchLens Backend (CPU-friendly)

This repo is frontend-only. To serve real TorchLens traces for the Trace view, add a small Python backend.

### Install (CPU is fine)
```
pip install torch torchlens torchvision fastapi uvicorn pydantic graphviz
```

### Run
```
uvicorn backend.torchlens_server:app --host 0.0.0.0 --port 8000
```

### Endpoint
- `POST /api/torchlens`
- Body: `{"graph": <GraphIR JSON>, "inputShapes": [[1,3,224,224]], "code": "<optional generated pytorch code>"}`
- Returns: `{"entries": [...], "warnings": [...]}` matching `TraceResponse` in the frontend.

### Implement GraphIR → nn.Module
In `backend/torchlens_server.py`, implement `build_model_from_graph(graph_ir: dict, code: str | None) -> nn.Module`.
Use deterministic submodule names (e.g., `node_<graphId>`) so TorchLens scopes map back to GraphIR node IDs.
Currently the placeholder builds Identity layers per node to preserve scopes; replace with your codegen when ready.

### Device
- CPU works (default).
- To use GPU: move model and dummy inputs to CUDA before calling `tl.log_forward_pass`.

### Scope → nodeId mapping
Populate `TraceEntry.nodeIds` by mapping TorchLens `scope` to your GraphIR node IDs during codegen.
