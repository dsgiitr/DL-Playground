FROM pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime

RUN apt-get update && apt-get install -y graphviz && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir torchlens pydantic graphviz

WORKDIR /app
COPY worker.py /app/worker.py

ENTRYPOINT ["python"]
