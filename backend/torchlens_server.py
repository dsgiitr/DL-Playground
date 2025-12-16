"""
TorchLens backend to serve forward traces for the frontend TraceView.

Endpoint:
    POST /api/torchlens
    Body: {"graph": <GraphIR dict>, "inputShapes": [[1,3,224,224]], "code": "<optional generated code>"}
    Returns: {"entries": [...], "warnings": [...], "summary":str}
"""
import logging
from typing import Any, Dict, List, Optional, Set

import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torchlens as tl
from graphviz import Source
import base64
import tempfile
import os
from pathlib import Path


class MultiInputIdentity(torch.nn.Module):
    """Pass inputs through unchanged while allowing 1+ args (helps multi-input edges)."""

    def forward(self, *inputs: Any) -> Any: 
        if len(inputs) == 1:
            return inputs[0]
        return inputs


class GraphModel(torch.nn.Module):
    """
    GraphIR -> torch.nn.Module that preserves node scopes for TorchLens.

    For now, each node becomes an Identity to guarantee shape compatibility.
    This yields stable, traceable scopes without needing full codegen.
    """

    def __init__(self, nodes: List[dict], edges: List[dict]):
        super().__init__()
        self.nodes = nodes
        self.edges = edges
        self.layers = torch.nn.ModuleDict()
        for node in nodes:
            node_id = node["id"]
            #handles multi inputs
            self.layers[node_id] = MultiInputIdentity()

        self.topo = self._topological_order(nodes, edges)
        self.incoming: Dict[str, List[str]] = {}
        for e in edges:
            self.incoming.setdefault(e["target"], []).append(e["source"])

    def _topological_order(self, nodes: List[dict], edges: List[dict]) -> List[str]:
        order: List[str] = []
        indegree: Dict[str, int] = {n["id"]: 0 for n in nodes}
        outgoing: Dict[str, Set[str]] = {n["id"]: set() for n in nodes}
        for e in edges:
            if e["target"] in indegree and e["source"] in indegree:
                indegree[e["target"]] += 1
                outgoing[e["source"]].add(e["target"])
        queue: List[str] = [nid for nid, deg in indegree.items() if deg == 0]
        while queue:
            nid = queue.pop(0)
            order.append(nid)
            for nxt in outgoing[nid]:
                indegree[nxt] -= 1
                if indegree[nxt] == 0:
                    queue.append(nxt)
        if len(order) < len(nodes):
            # cycle or missing edges; fall back to declared order
            order = [n["id"] for n in nodes]
        return order

    def forward(self, *inputs: Any) -> Any:
        if not inputs:
            raise ValueError("GraphModel.forward requires at least one input tensor")

        outputs: Dict[str, Any] = {}
        remaining_inputs: List[Any] = list(inputs)
        fallback_input = inputs[0]

        for node_id in self.topo:
            incoming_sources = self.incoming.get(node_id, [])
            if not incoming_sources:
                node_input = remaining_inputs.pop(0) if remaining_inputs else fallback_input
            else:
                tensors = [outputs[src] for src in incoming_sources if src in outputs]
                if not tensors:
                    node_input = fallback_input
                elif len(tensors) == 1:
                    node_input = tensors[0]
                else:
                    node_input = tuple(tensors)

            layer = self.layers[node_id]
            if isinstance(node_input, (list, tuple)):
                outputs[node_id] = layer(*node_input)
            else:
                outputs[node_id] = layer(node_input)
        last_node = self.topo[-1] if self.topo else None
        return outputs.get(last_node, fallback_input)


def compile_model_from_code(code: str) -> nn.Module:
    """
    Executes the generated PyTorch code and return an instance of the first nn.Module subclass.
    Raises a ValueError with a short snippet on failure to help debug malformed codegen.
    Guards added to check the code 
    1. empty code 
    2. if there are multiple nn module subclass 
    """
    if not code or not code.strip():
        raise ValueError("No code provided to compile.")
    scope: Dict[str, object] = {"torch": torch, "nn": nn}
    try:
        exec(code, scope)  
    except Exception as exc: 
        snippet = "\n".join(code.splitlines()[:20])
        raise ValueError(f"Code compilation failed: {exc}. Snippet:\n{snippet}") from exc
    # Prefer a class named GeneratedModel; otherwise require exactly one nn.Module subclass to avoid ambiguity.
    def is_model_class(val: object) -> bool:
        return isinstance(val, type) and issubclass(val, nn.Module) and val not in {nn.Module, torch.nn.Module}

    candidates = [(name, val) for name, val in scope.items() if is_model_class(val)]
    model_class = scope.get("GeneratedModel")
    if not is_model_class(model_class):
        if len(candidates) == 1:
            model_class = candidates[0][1]
        elif len(candidates) > 1:
            names = ", ".join(name for name, _ in candidates)
            raise ValueError(f"Multiple nn.Module classes found ({names}); expose one as GeneratedModel.")
        else:
            raise ValueError("No nn.Module class found in generated code")

    try:
        return model_class()
    except TypeError as exc:
        raise ValueError(f"Failed to instantiate model '{model_class.__name__}': {exc}") from exc


def build_model_from_graph(graph_ir: dict, code: Optional[str] = None) -> torch.nn.Module:
    """
    Turn GraphIR (frontend JSON) into a torch.nn.Module.

    Priority:
    1) If `code` is provided (frontend codegen), compile and return it.
    2) Otherwise, build Identity layers per node to preserve scopes for TorchLens.
    3) If the graph is empty, fall back to AlexNet so users see real trace output.
    """
    if code:
        try:
            return compile_model_from_code(code)
        except Exception as exc:  # noqa: BLE001
            # Fallback to graph-based stub so user still sees a trace
            logging.exception("Code compilation failed; falling back to GraphModel stub")
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    nodes = graph_ir.get("nodes", [])
    edges = graph_ir.get("edges", [])
    if not nodes:
        try:
            import torchvision

            return torchvision.models.alexnet()
        except Exception:  # noqa: BLE001
            pass
    return GraphModel(nodes, edges)


class TraceRequest(BaseModel):
    graph: dict
    inputShapes: List[List[int]]
    code: Optional[str] = None


class TraceEntry(BaseModel):
    id: str
    scope: str
    op: str
    inputShape: Optional[str] = None
    outputShape: Optional[str] = None
    dtype: Optional[str] = None
    nodeIds: Optional[List[str]] = None


class TraceResponse(BaseModel):
    entries: List[TraceEntry]
    warnings: Optional[List[str]] = None
    svgBase64: Optional[str] = None
    summaryText: Optional[str] = None


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("torchlens_server")
logging.basicConfig(level=logging.INFO)


@app.post("/api/torchlens", response_model=TraceResponse)
def run_trace(req: TraceRequest):
    if not req.inputShapes or not isinstance(req.inputShapes, list):
        raise HTTPException(status_code=400, detail="inputShapes is required")
    logger.info("Tracing graph with %d nodes, %d edges", len(req.graph.get("nodes", [])), len(req.graph.get("edges", [])))
    try:
        model = build_model_from_graph(req.graph, req.code)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to build model")
        raise HTTPException(status_code=400, detail=f"Failed to build model: {exc}") from exc

    model.eval()
    # Build dummy inputs on CPU; switch to CUDA if desired by moving model/inputs to 'cuda'
    inputs = [torch.randn(*shape) for shape in req.inputShapes]
    x = inputs[0] if len(inputs) == 1 else inputs

    svg_b64: Optional[str] = None
    prev_cwd = os.getcwd()
    tmpdir = tempfile.mkdtemp()
    try:
        os.chdir(tmpdir)
        with torch.no_grad():
            # Save all layers; request unrolled graph.
            # link to the function https://github.com/johnmarktaylor91/torchlens/blob/main/torchlens/user_funcs.py#L100
            history = tl.log_forward_pass(
                model,
                x,
                vis_opt="unrolled",
                layers_to_save="all",
                vis_save_only=True,
                vis_fileformat="svg",
                vis_outpath=str(Path(tmpdir) / "torchlens_graph"),
            )
        # Prefer in-memory rendering from DOT.
        dot_graph = getattr(history, "dot_graph", None) or getattr(getattr(history, "graph", None), "dot_graph", None)
        if dot_graph:
            svg_bytes = Source(dot_graph).pipe(format="svg")
            svg_b64 = base64.b64encode(svg_bytes).decode("utf-8")
        # Fallback: if no DOT attached, read a generated SVG if present.
        if not svg_b64:
            svg_path = next(iter(Path(tmpdir).glob("*.svg")), None)
            if svg_path and svg_path.exists():
                svg_b64 = base64.b64encode(svg_path.read_bytes()).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Trace failed")
        raise HTTPException(status_code=500, detail=f"Trace failed: {exc}") from exc
    finally:
        os.chdir(prev_cwd)

    entries: List[TraceEntry] = []
    # TorchLens ModelHistory exposes layer_labels and indexing by label; fall back to layers dict.
    labels = getattr(history, "layer_labels", None)
    def tensor_shape_to_str(val: object) -> Optional[str]:
        """Normalize various TorchLens shape fields or tensors to a readable string."""
        if val is None:
            return None
        try:
            import torch
            if isinstance(val, torch.Tensor):
                return str(tuple(val.shape))
        except Exception:
            pass
        if isinstance(val, (list, tuple)):
            # If this is a list/tuple of tensors or shapes, return a list of shapes; otherwise string-coerce.
            shapes: List[str] = []
            for item in val:
                try:
                    import torch  # type: ignore
                    if isinstance(item, torch.Tensor):
                        shapes.append(str(tuple(item.shape)))
                        continue
                except Exception:
                    pass
                if hasattr(item, "shape"):
                    try:
                        shapes.append(str(tuple(item.shape)))  # type: ignore[arg-type]
                        continue
                    except Exception:
                        shapes.append(str(item))
                        continue
                shapes.append(str(item))
            if shapes:
                return shapes[0] if len(shapes) == 1 else "[" + ", ".join(shapes) + "]"
            return None
        try:
            return str(val)
        except Exception:
            return None

    def tensor_dtype_to_str(val: object) -> Optional[str]:
        try:
            import torch
            if isinstance(val, torch.Tensor):
                return str(val.dtype)
        except Exception:
            pass
        if isinstance(val, (list, tuple)) and val:
            for item in val:
                dt = tensor_dtype_to_str(item)
                if dt:
                    return dt
        return None

    if labels:
        for lbl in labels:
            layer = history[lbl]
            scope = getattr(layer, "layer_label", getattr(layer, "layer_name", lbl))
            op = getattr(layer, "layer_type", getattr(layer, "layer_hooked_type", ""))
            tensor_contents = getattr(layer, "tensor_contents", None)
            input_tensors = getattr(layer, "input_tensors", None)
            input_dims = getattr(layer, "input_dims", None) or getattr(layer, "input_shapes", None) or getattr(layer, "input_shape", None)
            output_dims = getattr(layer, "output_dims", None) or getattr(layer, "output_shapes", None) or getattr(layer, "output_shape", None)

            # Prefer actual tensors for shapes; fall back to dimension metadata (avoid tensor truthiness)
            preferred_input = input_tensors if input_tensors is not None else input_dims
            preferred_output = tensor_contents if tensor_contents is not None else output_dims

            dtype_val = (
                getattr(layer, "input_dtype", None)
                or getattr(layer, "dtype", None)
                or tensor_dtype_to_str(tensor_contents)
                or tensor_dtype_to_str(input_tensors)
            )
            entries.append(
                TraceEntry(
                    id=str(scope),
                    scope=str(scope),
                    op=str(op),
                    inputShape=tensor_shape_to_str(preferred_input),
                    outputShape=tensor_shape_to_str(preferred_output),
                    dtype=str(dtype_val) if dtype_val is not None else None,
                    nodeIds=[],  # populate with your GraphIR node ids by mapping scope→nodeId
                )
            )
    else:
        layer_dict = getattr(history, "layers", None)
        if layer_dict:
            for layer in layer_dict.values():
                scope = getattr(layer, "layer_label", getattr(layer, "layer_name", ""))
                op = getattr(layer, "layer_type", getattr(layer, "layer_hooked_type", ""))
                tensor_contents = getattr(layer, "tensor_contents", None)
                input_tensors = getattr(layer, "input_tensors", None)
                input_dims = getattr(layer, "input_dims", None) or getattr(layer, "input_shapes", None) or getattr(layer, "input_shape", None)
                output_dims = getattr(layer, "output_dims", None) or getattr(layer, "output_shapes", None) or getattr(layer, "output_shape", None)

                preferred_input = input_tensors if input_tensors is not None else input_dims
                preferred_output = tensor_contents if tensor_contents is not None else output_dims

                dtype_val = (
                    getattr(layer, "input_dtype", None)
                    or getattr(layer, "dtype", None)
                    or tensor_dtype_to_str(tensor_contents)
                    or tensor_dtype_to_str(input_tensors)
                )
                entries.append(
                    TraceEntry(
                        id=str(scope),
                        scope=str(scope),
                        op=str(op),
                        inputShape=tensor_shape_to_str(preferred_input),
                        outputShape=tensor_shape_to_str(preferred_output),
                        dtype=str(dtype_val) if dtype_val is not None else None,
                        nodeIds=[],  # populate with your GraphIR node ids by mapping scope→nodeId
                    )
                )

    warnings = list(getattr(history, "warnings", []))
    if not svg_b64:
        warnings.append("TorchLens did not return a graph SVG; check DOT generation or vis options.")
    summary_text = None
    try:
        summary_text = str(history)
    except Exception:
        summary_text = None

    if not entries:
        warnings.append("TorchLens returned no layers; check model code or TorchLens config.")
        entries.append(
            TraceEntry(
                id="summary",
                scope="model",
                op="summary",
                inputShape=None,
                outputShape=None,
                dtype=None,
                nodeIds=[],
            )
        )

    return TraceResponse(entries=entries, warnings=warnings, svgBase64=svg_b64, summaryText=summary_text)
