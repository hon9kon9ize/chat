const SUGGESTIONS = [
  "用廣東話講個笑話 😄",
  "解釋下量子電腦係咩 🔬",
  "幫我寫一首廣東話歌詞 🎵",
  "用Python寫個Fibonacci 💻",
]

export function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-4 select-none">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-indigo-900/30">
        粵
      </div>
      <div>
        <h1 className="text-xl font-semibold text-gray-200 mb-1">廣東話 AI 助手</h1>
        <p className="text-sm text-gray-500 max-w-xs">由 CantoneseLLM v2 驅動 — 全球第一個以廣東話推理嘅 AI 模型</p>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2 max-w-sm w-full">
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            onClick={() => onPick(text)}
            className="text-left rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-800 px-3 py-2.5 text-xs text-gray-400 transition-colors select-none"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
