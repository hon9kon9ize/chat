export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null

  return (
    <div className="mx-4 mt-3 flex-shrink-0">
      <div className="flex items-center gap-2 rounded-lg bg-amber-900/30 border border-amber-700/50 px-4 py-3 text-sm text-amber-300">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <span>{message}</span>
      </div>
    </div>
  )
}
