export interface AgentInfo {
  id: string
  name: string
  description: string
}

export interface Message {
  role: "user" | "assistant"
  content: string
}

export async function fetchAgents(): Promise<AgentInfo[]> {
  const res = await fetch("/api/agents")
  if (!res.ok) throw new Error("Failed to load agents")
  return res.json()
}

export type SSEEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }

export function streamChat(
  agentId: string,
  messages: Message[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): void {
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: agentId, messages }),
    signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 429) {
          onError("今日已達到每日限額（20次），請明日再試。")
        } else if (body?.detail?.error === "unknown_agent") {
          onError("未知助手，請重新整理頁面。")
        } else {
          onError("出現錯誤，請稍後再試。")
        }
        onDone()
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const evt = JSON.parse(raw) as SSEEvent
            if (evt.type === "delta") onDelta(evt.text)
            else if (evt.type === "done") onDone()
            else if (evt.type === "error") { onError(evt.message); onDone() }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    })
    .catch((err: Error) => {
      if (err.name !== "AbortError") {
        onError("連接出現問題，請稍後再試。")
        onDone()
      }
    })
}
