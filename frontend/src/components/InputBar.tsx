import { useEffect, useRef, useState } from "react"

export function InputBar({
  streaming,
  remaining,
  onSend,
  onStop,
  onNewChat,
}: {
  streaming: boolean
  remaining: number | null
  onSend: (text: string) => void
  onStop: () => void
  onNewChat: () => void
}) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [value])

  useEffect(() => {
    if (!streaming) textareaRef.current?.focus()
  }, [streaming])

  const submit = () => {
    const text = value.trim()
    if (!text || streaming) return
    setValue("")
    onSend(text)
  }

  return (
    <div className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-4 pt-3 pb-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新對話
          </button>
          {streaming && (
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              停止生成
            </button>
          )}
        </div>
        <div className="text-xs text-gray-500 select-none" title="每日額度於 00:00 HKT 重設">
          今日剩餘：<span className="font-medium text-gray-300">{remaining === null ? "--" : remaining}</span> 次
        </div>
      </div>

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={streaming}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="用廣東話傾計…（Enter 發送，Shift+Enter 換行）"
          className="flex-1 resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors overflow-hidden"
          style={{ minHeight: 48, maxHeight: 160 }}
        />
        <button
          onClick={submit}
          disabled={streaming}
          aria-label="發送"
          className="flex-shrink-0 w-12 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none"
            strokeLinecap="round" strokeLinejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M10 14l11 -11" />
            <path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
