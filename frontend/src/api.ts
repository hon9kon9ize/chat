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
  | { type: "reasoning"; text: string }
  | { type: "tool_use"; tool_use_id: string; name: string | null; input: unknown }
  | { type: "tool_result"; tool_use_id: string | null; status: string | null; content: unknown }
  | { type: "done" }
  | { type: "error"; message: string }

export interface StreamChatCallbacks {
  onDelta: (text: string) => void
  onReasoning?: (text: string) => void
  onToolUse?: (toolUseId: string, name: string | null, input: unknown) => void
  onToolResult?: (toolUseId: string | null, status: string | null, content: unknown) => void
  onDone: () => void
  onError: (msg: string) => void
  onLimitUpdate?: (remaining: number, limit: number) => void
}

export function streamChat(
  agentId: string,
  messages: Message[],
  signal: AbortSignal,
  callbacks: StreamChatCallbacks
): void {
  const { onDelta, onReasoning, onToolUse, onToolResult, onDone, onError, onLimitUpdate } = callbacks

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
            else if (evt.type === "reasoning") onReasoning?.(evt.text)
            else if (evt.type === "tool_use") onToolUse?.(evt.tool_use_id, evt.name, evt.input)
            else if (evt.type === "tool_result") onToolResult?.(evt.tool_use_id, evt.status, evt.content)
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
