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

export interface LimitInfo {
  limit: number
  remaining: number
  reset_at: string
}

export async function fetchLimit(): Promise<LimitInfo> {
  const res = await fetch("/api/limit")
  if (!res.ok) throw new Error("Failed to load limit")
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
  onError: (msg: string) => void,
  onLimitUpdate?: (remaining: number, limit: number) => void
): void {
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: agentId, messages }),
    signal,
  })
    .then(async (res) => {
      const remHeader = res.headers.get("X-RateLimit-Remaining")
      const limitHeader = res.headers.get("X-RateLimit-Limit")
      if (remHeader !== null && limitHeader !== null && onLimitUpdate) {
        onLimitUpdate(parseInt(remHeader, 10), parseInt(limitHeader, 10))
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 429) {
          if (onLimitUpdate) {
            onLimitUpdate(0, limitHeader ? parseInt(limitHeader, 10) : 50)
          }
          const customMsg = body?.detail?.message
          onError(customMsg || "今日嘅使用額度已用完，請聽日再試（額度於每日 00:00 重設）。")
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
