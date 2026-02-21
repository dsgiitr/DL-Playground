## TorchLens Backend (Run inside backend directory)

### Install

```bash

pip install -r requirements.txt
```

### Build Image and start Server 
```bash
docker build -t torchlens-worker:latest .
```

```bash
uvicorn runner:app --host 0.0.0.0 --port 8000
```

### Endpoint

```bash
- `POST /api/torchlens`
- Body: `{"graph": <GraphIR JSON>, "inputShapes": [[1,3,224,224]], "code": "<optional generated pytorch code>"}`
- Returns: `{"entries": [...], "warnings": [...]}` matching `TraceResponse` in the frontend.
```
