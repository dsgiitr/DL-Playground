import type { TraceRequest, TraceResponse } from "../types/trace";

/**
 * Call backend TorchLens endpoint (POST /api/torchlens returning TraceResponse).
 * On failure, surface the backend error so the user can fix shapes/code and retry.
 */
const BASE_URL = "https://dlplayground.dsgiitr.in";

export async function runTorchLensTrace(body: TraceRequest): Promise<TraceResponse> {
    try {
        const res = await fetch(`${BASE_URL}/api/torchlens`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `Trace request failed: ${res.status} ${res.statusText}`);
        }
        return (await res.json()) as TraceResponse;
    } catch (err) {
        console.warn("Trace request failed", err);
        const message =
            err instanceof Error && err.message
                ? err.message
                : "TorchLens trace failed: check backend logs and model shapes.";
        return {
            entries: [],
            warnings: [
                message,
                "Fix model params / shapes and retry TorchLens trace. See backend logs for the stack trace.",
            ],
        };
    }
}
