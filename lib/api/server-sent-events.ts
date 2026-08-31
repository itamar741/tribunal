import type { ModelProgressEvent } from "../tribunal";

const encoder = new TextEncoder();

export function acceptsEventStream(request: Request): boolean {
  return request.headers.get("accept")?.includes("text/event-stream") ?? false;
}

export function streamExecution(
  execute: (emitProgress: (event: ModelProgressEvent) => void) => Promise<{
    status: number;
    body: unknown;
  }>,
): Response {
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          open = false;
        }
      };

      void execute((progress) => send("model-progress", progress))
        .then(({ status, body }) => send("execution-complete", { status, body }))
        .catch(() =>
          send("execution-complete", {
            status: 500,
            body: { ok: false, error: "The Tribunal could not be completed." },
          }),
        )
        .finally(() => {
          if (!open) return;
          open = false;
          controller.close();
        });
    },
    cancel() {
      // Client disconnects must not interrupt a durable Tribunal execution.
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
