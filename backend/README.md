## TorchLens Backend (CPU)

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