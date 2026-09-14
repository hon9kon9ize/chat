import { useEffect, useRef } from "react"
import type { UIMessage } from "../types"
import { AssistantBubble } from "./AssistantBubble"
import { ErrorBubble } from "./ErrorBubble"
import { UserBubble } from "./UserBubble"
import { Welcome } from "./Welcome"

export function Conversation({
  messages,
  streaming,
  onPickSuggestion,
}: {
  messages: UIMessage[]
  streaming: boolean
  onPickSuggestion: (text: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 ? (
        <Welcome onPick={onPickSuggestion} />
      ) : (
        messages.map((m, i) => {
          const isLast = i === messages.length - 1
          if (m.role === "user") return <UserBubble key={m.id} text={m.content} />
          if (m.role === "error") return <ErrorBubble key={m.id} text={m.content} />
          return <AssistantBubble key={m.id} message={m} isStreaming={streaming && isLast} />
        })
      )}
    </div>
  )
}
