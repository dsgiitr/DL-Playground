import type { TraceRequest, TraceResponse } from "../types/trace";

/**
 * Call backend TorchLens endpoint (POST /api/torchlens returning TraceResponse).
 * Falls back to a mock payload when the request fails (so UI stays usable without backend).
 */
const BASE_URL = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";

export async function runTorchLensTrace(body: TraceRequest): Promise<TraceResponse> {
    try {
        const res = await fetch(`${BASE_URL}/api/torchlens`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Trace request failed: ${res.statusText}`);
        return (await res.json()) as TraceResponse;
    } catch (err) {
        console.warn("Trace request failed, using mock response", err);
        return {
            entries: [
                {
                    id: "mock-1",
                    scope: "model.conv1",
                    op: "Conv2d",
                    inputShape: "[1,3,224,224]",
                    outputShape: "[1,64,112,112]",
                    dtype: "float32",
                    nodeIds: [],
                },
                {
                    id: "mock-2",
                    scope: "model.relu1",
                    op: "ReLU",
                    inputShape: "[1,64,112,112]",
                    outputShape: "[1,64,112,112]",
                    dtype: "float32",
                    nodeIds: [],
                },
            ],
            warnings: ["Mock trace shown (backend unavailable)"],
        };
    }
}
