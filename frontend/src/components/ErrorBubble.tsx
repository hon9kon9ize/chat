export function ErrorBubble({ text }: { text: string }) {
  return (
    <div className="chat-message flex items-start gap-2 mb-4">
      <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-red-900/40 flex items-center justify-center text-xs select-none">
        ⚠️
      </div>
      <div className="max-w-[75%] sm:max-w-md md:max-w-2xl rounded-b-2xl rounded-tr-2xl bg-red-900/40 border border-red-700/50 px-4 py-3 text-sm text-red-300">
        {text}
      </div>
    </div>
  )
}
