import { useCallback, useEffect, useState } from "react"
import { fetchAgents, fetchLimit, type AgentInfo } from "./api"
import { Conversation } from "./components/Conversation"
import { ErrorBanner } from "./components/ErrorBanner"
import { Footer } from "./components/Footer"
import { InputBar } from "./components/InputBar"
import { TopNav } from "./components/TopNav"
import { useChatStream } from "./useChatStream"

const QUOTA_EXHAUSTED_MSG = "今日嘅使用額度已用完，請聽日再試（額度於每日 00:00 重設）。"

export function App() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState("default")
  const [remaining, setRemaining] = useState<number | null>(null)
  const [limit, setLimit] = useState<number | null>(null)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  const onLimitUpdate = useCallback((rem: number, lim: number) => {
    setRemaining(rem)
    setLimit(lim)
  }, [])
  const onQuotaExhausted = useCallback(() => setErrorBanner(QUOTA_EXHAUSTED_MSG), [])

  const { messages, streaming, send, stop, newChat } = useChatStream(onLimitUpdate, onQuotaExhausted)

  useEffect(() => {
    fetchAgents()
      .then((list) => {
        setAgents(list)
        const hasDefault = list.some((a) => a.id === "default")
        setSelectedAgentId(hasDefault ? "default" : list[0]?.id ?? "default")
      })
      .catch(() => {
        // Fallback — keep the static "default" option
      })

    fetchLimit()
      .then((info) => {
        setRemaining(info.remaining)
        setLimit(info.limit)
        if (info.remaining === 0) setErrorBanner(QUOTA_EXHAUSTED_MSG)
      })
      .catch(() => {
        // Fallback: keep placeholders if fetch fails
      })
  }, [])

  const handleNewChat = useCallback(() => {
    newChat()
    setErrorBanner(null)
  }, [newChat])

  const handleSelectAgent = (id: string) => {
    if (id !== selectedAgentId && messages.length > 0) handleNewChat()
    setSelectedAgentId(id)
  }

  const handleSend = (text: string) => {
    if (remaining !== null && remaining <= 0) {
      setErrorBanner(QUOTA_EXHAUSTED_MSG)
      return
    }
    setErrorBanner(null)
    send(selectedAgentId, text)
  }

  return (
    <div className="h-full bg-gray-950 text-gray-100 flex flex-col">
      <TopNav
        agents={agents}
        selectedAgentId={selectedAgentId}
        onSelectAgent={handleSelectAgent}
        remaining={remaining}
        limit={limit}
      />
      <ErrorBanner message={errorBanner} />
      <Conversation messages={messages} streaming={streaming} onPickSuggestion={handleSend} />
      <InputBar streaming={streaming} remaining={remaining} onSend={handleSend} onStop={stop} onNewChat={handleNewChat} />
      <Footer />
    </div>
  )
}
