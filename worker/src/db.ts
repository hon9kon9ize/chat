export interface ChatLogEntry {
  id: string;
  createdAt: string;
  ip: string;
  agent: string;
  userInput: string;
  response: string;
  reasoning?: string;
  messagesJson: string;
  status: string;
  errorMessage?: string;
  durationMs: number;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): {
    run(): Promise<unknown>;
  };
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export async function saveChatLog(db: D1DatabaseLike, entry: ChatLogEntry): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO chat_logs (
          id, created_at, ip, agent, user_input, response, reasoning, messages_json, status, error_message, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        entry.id,
        entry.createdAt,
        entry.ip,
        entry.agent,
        entry.userInput,
        entry.response,
        entry.reasoning ?? null,
        entry.messagesJson,
        entry.status,
        entry.errorMessage ?? null,
        entry.durationMs
      )
      .run();
  } catch (err) {
    console.error("Failed to write to D1 chat_logs:", err);
  }
}

export function interceptAndLogStream(
  bodyStream: ReadableStream<Uint8Array>,
  metadata: {
    db?: D1DatabaseLike;
    ctx: ExecutionContextLike;
    ip: string;
    agent: string;
    userInput: string;
    messagesJson: string;
    startTime: number;
  }
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let fullResponse = "";
  let fullReasoning = "";
  let streamStatus = "completed";
  let errorMessage: string | null = null;
  let saved = false;

  const finishLog = () => {
    if (saved || !metadata.db) return;
    saved = true;
    const durationMs = Date.now() - metadata.startTime;
    metadata.ctx.waitUntil(
      saveChatLog(metadata.db, {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ip: metadata.ip,
        agent: metadata.agent,
        userInput: metadata.userInput,
        response: fullResponse,
        reasoning: fullReasoning || undefined,
        messagesJson: metadata.messagesJson,
        status: streamStatus,
        errorMessage: errorMessage || undefined,
        durationMs,
      })
    );
  };

  const processChunk = (chunkText: string) => {
    sseBuffer += chunkText;
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const evt = JSON.parse(raw);
        if (evt.type === "delta" && typeof evt.text === "string") {
          fullResponse += evt.text;
        } else if (evt.type === "reasoning" && typeof evt.text === "string") {
          fullReasoning += evt.text;
        } else if (evt.type === "error" && typeof evt.message === "string") {
          streamStatus = "error";
          errorMessage = evt.message;
        }
      } catch {
        // ignore malformed SSE line
      }
    }
  };

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      try {
        processChunk(decoder.decode(chunk, { stream: true }));
      } catch (e) {
        console.error("Error processing stream chunk for log:", e);
      }
    },
    flush() {
      try {
        if (sseBuffer) {
          processChunk(decoder.decode());
        }
      } finally {
        finishLog();
      }
    },
    cancel(reason) {
      streamStatus = "aborted";
      errorMessage = typeof reason === "string" ? reason : "client_aborted";
      finishLog();
    },
  });

  return bodyStream.pipeThrough(transformStream);
}
