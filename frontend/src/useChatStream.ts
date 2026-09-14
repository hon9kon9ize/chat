import { useCallback, useRef, useState } from "react"
import { streamChat, type Message } from "./api"
import type { ToolCallState, UIMessage } from "./types"

let nextId = 0
const uid = () => `m${++nextId}`

export interface UseChatStreamResult {
  messages: UIMessage[]
  streaming: boolean
  send: (agentId: string, text: string) => void
  stop: () => void
  newChat: () => void
}

export function useChatStream(
  onLimitUpdate: (remaining: number, limit: number) => void,
  onQuotaExhausted: () => void
): UseChatStreamResult {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // Full role/content history sent to the backend on every turn — kept
  // separate from the richer UIMessage[] used for rendering (reasoning/tool
  // state never gets sent back upstream).
  const historyRef = useRef<Message[]>([])

  const updateMessage = useCallback((id: string, patch: Partial<UIMessage> | ((m: UIMessage) => Partial<UIMessage>)) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m))
    )
  }, [])

  const send = useCallback(
    (agentId: string, text: string) => {
      if (!text.trim() || streaming) return

      const userMsg: UIMessage = { id: uid(), role: "user", content: text }
      historyRef.current = [...historyRef.current, { role: "user", content: text }]
      const assistantId = uid()
      const assistantMsg: UIMessage = { id: assistantId, role: "assistant", content: "" }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreaming(true)

      let assistantText = ""
      const toolCalls = new Map<string, ToolCallState>()
      const syncToolCalls = () => updateMessage(assistantId, { toolCalls: Array.from(toolCalls.values()) })

      const controller = new AbortController()
      abortRef.current = controller

      streamChat(agentId, historyRef.current, controller.signal, {
        onDelta: (chunk) => {
          assistantText += chunk
          updateMessage(assistantId, { content: assistantText, reasoningStreaming: false })
        },
        onReasoning: (chunk) => {
          updateMessage(assistantId, (m) => ({
            reasoningText: (m.reasoningText ?? "") + chunk,
            reasoningStreaming: true,
          }))
        },
        onToolUse: (toolUseId, name, input) => {
          const existing = toolCalls.get(toolUseId)
          toolCalls.set(toolUseId, {
            toolUseId,
            name: name ?? existing?.name ?? "tool",
            input,
            status: existing?.status ?? "input-streaming",
          })
          syncToolCalls()
        },
        onToolResult: (toolUseId, status, content) => {
          if (!toolUseId) return
          const existing = toolCalls.get(toolUseId)
          if (!existing) return
          const ok = status === "success"
          toolCalls.set(toolUseId, {
            ...existing,
            status: ok ? "output-available" : "output-error",
            output: ok ? content : undefined,
            errorText: ok ? undefined : typeof content === "string" ? content : JSON.stringify(content),
          })
          syncToolCalls()
        },
        onDone: () => {
          if (assistantText) {
            historyRef.current = [...historyRef.current, { role: "assistant", content: assistantText }]
          }
          setStreaming(false)
          abortRef.current = null
        },
        onError: (msg) => {
          setMessages((prev) => [...prev, { id: uid(), role: "error", content: msg }])
        },
        onLimitUpdate: (remaining, limit) => {
          onLimitUpdate(remaining, limit)
          if (remaining === 0) onQuotaExhausted()
        },
      })
    },
    [streaming, updateMessage, onLimitUpdate, onQuotaExhausted]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }, [])

  const newChat = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    historyRef.current = []
    setMessages([])
    setStreaming(false)
  }, [])

  return { messages, streaming, send, stop, newChat }
}
