from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import docker
import tempfile
import json
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    client = docker.from_env()
except docker.errors.DockerException as e:
    raise RuntimeError(f"Could not connect to Docker daemon. Is Docker running? {e}")

class TraceRequest(BaseModel):
    graph: dict
    inputShapes: List[List[int]]
    code: Optional[str] = None

@app.post("/api/torchlens")
def handle_trace(req: TraceRequest):
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, "input.json")
        output_path = os.path.join(tmpdir, "output.json")
        
        with open(input_path, "w") as f:
            f.write(req.model_dump_json())
        
        try:
              client.containers.run(
                image="torchlens-worker:latest",
                command=["/app/worker.py", "/data/input.json", "/data/output.json"],
                volumes={tmpdir: {'bind': '/data', 'mode': 'rw'}},
                remove=True,
                network_disabled=True, 
                mem_limit="2g" 
            )
        except docker.errors.ContainerError as e:
            pass 
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to execute trace container: {str(e)}")

        if not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="Worker container failed to produce an output file.")

        with open(output_path, "r") as f:
            try:
                result = json.load(f)
            except json.JSONDecodeError:
                raise HTTPException(status_code=500, detail="Worker output was corrupted.")

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result
