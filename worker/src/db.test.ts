import test from "node:test";
import assert from "node:assert/strict";
import {
  interceptAndLogStream,
  saveChatLog,
  type ChatLogEntry,
  type D1DatabaseLike,
  type ExecutionContextLike,
} from "./db.ts";

test("saveChatLog prepares and binds correct parameters", async () => {
  let executedQuery = "";
  let boundValues: unknown[] = [];

  const mockDb: D1DatabaseLike = {
    prepare(query: string) {
      executedQuery = query;
      return {
        bind(...values: unknown[]) {
          boundValues = values;
          return {
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };

  const entry: ChatLogEntry = {
    id: "test-uuid-1",
    createdAt: "2026-09-14T15:00:00.000Z",
    ip: "127.0.0.1",
    agent: "default",
    userInput: "Hello Cantonese LLM",
    response: "你好！我係廣東話助手。",
    reasoning: "User said hello.",
    messagesJson: JSON.stringify([{ role: "user", content: "Hello Cantonese LLM" }]),
    status: "completed",
    durationMs: 120,
  };

  await saveChatLog(mockDb, entry);

  assert.match(executedQuery, /INSERT INTO chat_logs/);
  assert.equal(boundValues[0], "test-uuid-1");
  assert.equal(boundValues[1], "2026-09-14T15:00:00.000Z");
  assert.equal(boundValues[2], "127.0.0.1");
  assert.equal(boundValues[3], "default");
  assert.equal(boundValues[4], "Hello Cantonese LLM");
  assert.equal(boundValues[5], "你好！我係廣東話助手。");
  assert.equal(boundValues[6], "User said hello.");
  assert.equal(boundValues[8], "completed");
  assert.equal(boundValues[9], null);
  assert.equal(boundValues[10], 120);
});

test("interceptAndLogStream passes stream chunks through and records completion in D1", async () => {
  let savedEntry: ChatLogEntry | null = null;
  const mockDb: D1DatabaseLike = {
    prepare() {
      return {
        bind(...values: unknown[]) {
          savedEntry = {
            id: values[0] as string,
            createdAt: values[1] as string,
            ip: values[2] as string,
            agent: values[3] as string,
            userInput: values[4] as string,
            response: values[5] as string,
            reasoning: (values[6] as string) ?? undefined,
            messagesJson: values[7] as string,
            status: values[8] as string,
            errorMessage: (values[9] as string) ?? undefined,
            durationMs: values[10] as number,
          };
          return {
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };

  const waitTasks: Promise<unknown>[] = [];
  const mockCtx: ExecutionContextLike = {
    waitUntil(promise: Promise<unknown>) {
      waitTasks.push(promise);
    },
  };

  const encoder = new TextEncoder();
  const sseEvents = [
    'data: {"type":"reasoning","text":"Thinking..."}\n\n',
    'data: {"type":"delta","text":"你好"}\n\n',
    'data: {"type":"delta","text":"呀！"}\n\n',
    'data: {"type":"done"}\n\n',
  ];

  const sourceStream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of sseEvents) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });

  const intercepted = interceptAndLogStream(sourceStream, {
    db: mockDb,
    ctx: mockCtx,
    ip: "1.2.3.4",
    agent: "cantonese-agent",
    userInput: "你好嗎",
    messagesJson: JSON.stringify([{ role: "user", content: "你好嗎" }]),
    startTime: Date.now() - 50,
  });

  // Read all chunks from intercepted stream (mimics client receiving response)
  const reader = intercepted.getReader();
  const decoder = new TextDecoder();
  let receivedText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedText += decoder.decode(value, { stream: true });
  }

  // Verify stream output matches original SSE exactly
  assert.equal(receivedText, sseEvents.join(""));

  // Wait for background tasks to settle
  await Promise.all(waitTasks);

  // Verify recorded log in D1
  assert.ok(savedEntry);
  assert.equal((savedEntry as ChatLogEntry).userInput, "你好嗎");
  assert.equal((savedEntry as ChatLogEntry).response, "你好呀！");
  assert.equal((savedEntry as ChatLogEntry).reasoning, "Thinking...");
  assert.equal((savedEntry as ChatLogEntry).agent, "cantonese-agent");
  assert.equal((savedEntry as ChatLogEntry).status, "completed");
  assert.equal((savedEntry as ChatLogEntry).ip, "1.2.3.4");
});

test("interceptAndLogStream handles client cancellation", async () => {
  let savedEntry: ChatLogEntry | null = null;
  const mockDb: D1DatabaseLike = {
    prepare() {
      return {
        bind(...values: unknown[]) {
          savedEntry = {
            id: values[0] as string,
            createdAt: values[1] as string,
            ip: values[2] as string,
            agent: values[3] as string,
            userInput: values[4] as string,
            response: values[5] as string,
            reasoning: (values[6] as string) ?? undefined,
            messagesJson: values[7] as string,
            status: values[8] as string,
            errorMessage: (values[9] as string) ?? undefined,
            durationMs: values[10] as number,
          };
          return {
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };

  const waitTasks: Promise<unknown>[] = [];
  const mockCtx: ExecutionContextLike = {
    waitUntil(promise: Promise<unknown>) {
      waitTasks.push(promise);
    },
  };

  const encoder = new TextEncoder();
  const sourceStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"delta","text":"Partial answer"}\n\n'));
    },
  });

  const intercepted = interceptAndLogStream(sourceStream, {
    db: mockDb,
    ctx: mockCtx,
    ip: "1.2.3.4",
    agent: "default",
    userInput: "Tell me something",
    messagesJson: "[]",
    startTime: Date.now() - 30,
  });

  const reader = intercepted.getReader();
  await reader.read();
  await reader.cancel("user stopped generating");

  await Promise.all(waitTasks);

  assert.ok(savedEntry);
  assert.equal((savedEntry as ChatLogEntry).status, "aborted");
  assert.equal((savedEntry as ChatLogEntry).response, "Partial answer");
  assert.equal((savedEntry as ChatLogEntry).errorMessage, "user stopped generating");
});
