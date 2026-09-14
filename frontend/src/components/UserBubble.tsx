export function UserBubble({ text }: { text: string }) {
  return (
    <div className="chat-message flex flex-row-reverse items-start gap-2 mb-4">
      <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-200 select-none">
        你
      </div>
      <div className="max-w-[75%] sm:max-w-md md:max-w-2xl rounded-b-2xl rounded-tl-2xl bg-indigo-600 px-4 py-3 text-sm text-white whitespace-pre-wrap break-words leading-relaxed shadow-sm">
        {text}
      </div>
    </div>
  )
}
