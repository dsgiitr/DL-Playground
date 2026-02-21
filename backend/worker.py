"""
Reads a JSON TraceRequest from an input file, and writes a JSON TraceResponse to an output file.
"""
import logging
import sys
import json
import base64
import inspect
import tempfile
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import torch
import torch.nn as nn
import torchlens as tl
from graphviz import Source
from pydantic import BaseModel

class _MultiInputUnsupported(Exception):
    pass

def _build_tl_kwargs(tmpdir: str, enable_input_flags: bool, input_count: int) -> Dict[str, object]:
    kwargs: Dict[str, object] = {
        "vis_opt": "unrolled",
        "layers_to_save": "all",
        "vis_save_only": True,
        "vis_fileformat": "svg",
        "vis_outpath": str(Path(tmpdir) / "torchlens_graph"),
    }
    sig = inspect.signature(tl.log_forward_pass)
    param_names = set(sig.parameters)
    input_flag_names = (
        "save_input_tensors", "save_inputs", "save_input_args", "save_args",
        "save_function_args", "save_input_activations", "save_activations",
    )
    if enable_input_flags:
        for name in input_flag_names:
            if name in param_names:
                kwargs[name] = True
    if "input_arg_names" in param_names:
        kwargs["input_arg_names"] = [f"x{i}" for i in range(max(1, input_count))]
    return kwargs

class MultiInputIdentity(torch.nn.Module):
    def forward(self, *inputs: Any) -> Any: 
        if len(inputs) == 1:
            return inputs[0]
        return inputs

class GraphModel(torch.nn.Module):
    def __init__(self, nodes: List[dict], edges: List[dict]):
        super().__init__()
        self.nodes = nodes
        self.edges = edges
        self.layers = torch.nn.ModuleDict()
        for node in nodes:
            self.layers[node["id"]] = MultiInputIdentity()

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
    if not code or not code.strip():
        raise ValueError("No code provided to compile.")
    scope: Dict[str, object] = {"torch": torch, "nn": nn}
    try:
        exec(code, scope)  
    except Exception as exc: 
        snippet = "\n".join(code.splitlines()[:20])
        raise ValueError(f"Code compilation failed: {exc}. Snippet:\n{snippet}") from exc
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
    if code:
        try:
            return compile_model_from_code(code)
        except Exception as exc: 
            logging.exception("Code compilation failed; falling back to GraphModel stub")
            raise ValueError(str(exc)) from exc

    nodes = graph_ir.get("nodes", [])
    edges = graph_ir.get("edges", [])
    if not nodes:
        try:
            import torchvision
            return torchvision.models.alexnet()
        except Exception:
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

def run_trace(req: TraceRequest) -> TraceResponse:
    if not req.inputShapes or not isinstance(req.inputShapes, list):
        raise ValueError("inputShapes is required")
    
    model = build_model_from_graph(req.graph, req.code)
    model.eval()
    inputs = [torch.randn(*shape) for shape in req.inputShapes]

    svg_b64: Optional[str] = None
    history = None
    warnings = []
    
    if len(inputs) > 1:
        warnings.extend([
            "Multiple inputShapes provided; TorchLens will be invoked with the first input only.",
            "Limitation: TorchLens trace does not reliably support true multi-input models.",
        ])

    with tempfile.TemporaryDirectory() as tmpdir:
        with torch.no_grad():
            tl_kwargs = _build_tl_kwargs(tmpdir, enable_input_flags=True, input_count=len(inputs))

            def _call_torchlens(**kwargs: object) -> object:
                return tl.log_forward_pass(model, inputs[0], **kwargs)

            try:
                history = _call_torchlens(**tl_kwargs)
            except UnboundLocalError:
                tl_kwargs = _build_tl_kwargs(tmpdir, enable_input_flags=False, input_count=len(inputs))
                history = _call_torchlens(**tl_kwargs)

        dot_graph = getattr(history, "dot_graph", None) or getattr(getattr(history, "graph", None), "dot_graph", None)
        if dot_graph:
            svg_bytes = Source(dot_graph).pipe(format="svg")
            svg_b64 = base64.b64encode(svg_bytes).decode("utf-8")
        if not svg_b64:
            svg_path = next(iter(Path(tmpdir).glob("*.svg")), None)
            if svg_path and svg_path.exists():
                svg_b64 = base64.b64encode(svg_path.read_bytes()).decode("utf-8")

    entries: List[TraceEntry] = []
    
    def tensor_shape_to_str(val: object) -> Optional[str]:
        if val is None: return None
        try:
            if isinstance(val, torch.Tensor): return str(tuple(val.shape))
        except Exception: pass
        if hasattr(val, "shape"):
            try: return str(tuple(val.shape))
            except Exception: pass
        if isinstance(val, (list, tuple)):
            shapes = []
            for item in val:
                try:
                    if isinstance(item, torch.Tensor):
                        shapes.append(str(tuple(item.shape)))
                        continue
                except Exception: pass
                if hasattr(item, "shape"):
                    try:
                        shapes.append(str(tuple(item.shape)))
                        continue
                    except Exception:
                        shapes.append(str(item))
                        continue
                shapes.append(str(item))
            if shapes: return shapes[0] if len(shapes) == 1 else "[" + ", ".join(shapes) + "]"
            return None
        return str(val)

    def tensor_dtype_to_str(val: object) -> Optional[str]:
        try:
            if isinstance(val, torch.Tensor): return str(val.dtype)
        except Exception: pass
        if isinstance(val, (list, tuple)) and val:
            for item in val:
                dt = tensor_dtype_to_str(item)
                if dt: return dt
        return None

    def prefer_nonempty(primary: object, fallback: object) -> object:
        if primary is None or (isinstance(primary, (list, tuple)) and not primary):
            return fallback
        return primary

    def parent_shapes_from_layer(layer: object) -> Optional[str]:
        parent_layers = getattr(layer, "parent_layers", None)
        if not parent_layers: return None
        shapes: List[str] = []
        for parent in parent_layers:
            try: parent_layer = history[parent]
            except Exception: continue
            parent_shape = tensor_shape_to_str(getattr(parent_layer, "tensor_shape", None))
            if parent_shape: shapes.append(parent_shape)
        if not shapes: return None
        return shapes[0] if len(shapes) == 1 else "[" + ", ".join(shapes) + "]"

    def _extract_entries(history_obj: object) -> List[TraceEntry]:
        extracted = []
        labels_local = getattr(history_obj, "layer_labels", None)
        layer_dict = getattr(history_obj, "layers", None)
        
        iterator = []
        if labels_local:
            iterator = [history_obj[lbl] for lbl in labels_local]
        elif layer_dict:
            iterator = layer_dict.values()

        for layer in iterator:
            scope = getattr(layer, "layer_label", getattr(layer, "layer_name", ""))
            op = getattr(layer, "layer_type", getattr(layer, "layer_hooked_type", ""))
            tensor_contents = getattr(layer, "tensor_contents", None)
            layer_input_tensors = getattr(layer, "input_tensors", None)
            input_dims = getattr(layer, "input_dims", None) or getattr(layer, "input_shapes", None) or getattr(layer, "input_shape", None)
            output_dims = getattr(layer, "output_dims", None) or getattr(layer, "output_shapes", None) or getattr(layer, "output_shape", None)
            tensor_shape = getattr(layer, "tensor_shape", None)

            preferred_input = prefer_nonempty(layer_input_tensors, input_dims)
            preferred_output = prefer_nonempty(tensor_contents, output_dims)
            if preferred_output is None and tensor_shape is not None:
                preferred_output = tensor_shape
            if preferred_input is None:
                preferred_input = parent_shapes_from_layer(layer)
            if preferred_input is None and getattr(layer, "is_input_layer", False) and req.inputShapes:
                preferred_input = [tuple(req.inputShapes[0])]

            dtype_val = (
                getattr(layer, "input_dtype", None) or getattr(layer, "dtype", None)
                or tensor_dtype_to_str(tensor_contents) or tensor_dtype_to_str(layer_input_tensors)
            )
            extracted.append(
                TraceEntry(
                    id=str(scope), scope=str(scope), op=str(op),
                    inputShape=tensor_shape_to_str(preferred_input),
                    outputShape=tensor_shape_to_str(preferred_output),
                    dtype=str(dtype_val) if dtype_val is not None else None, nodeIds=[]
                )
            )
        return extracted

    if history:
        entries = _extract_entries(history)

    warnings = warnings + (list(getattr(history, "warnings", [])) if history else [])
    if not svg_b64: warnings.append("TorchLens did not return a graph SVG; check DOT generation or vis options.")
    
    summary_text = str(history) if history else None

    if not entries:
        warnings.append("TorchLens returned no layers; check model code or TorchLens config.")
        entries.append(TraceEntry(id="summary", scope="model", op="summary", inputShape=None, outputShape=None, dtype=None, nodeIds=[]))

    return TraceResponse(entries=entries, warnings=warnings, svgBase64=svg_b64, summaryText=summary_text)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python worker.py <input.json> <output.json>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    try:
        with open(input_file, 'r') as f:
            req_data = json.load(f)
        
        req = TraceRequest(**req_data)
        response = run_trace(req)
        
        with open(output_file, 'w') as f:
            f.write(response.model_dump_json())

    except Exception as e:
        with open(output_file, 'w') as f:
            json.dump({"error": str(e)}, f)
        sys.exit(1)
