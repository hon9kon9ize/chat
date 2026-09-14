import type { AgentInfo } from "../api"

export function TopNav({
  agents,
  selectedAgentId,
  onSelectAgent,
  remaining,
  limit,
}: {
  agents: AgentInfo[]
  selectedAgentId: string
  onSelectAgent: (id: string) => void
  remaining: number | null
  limit: number | null
}) {
  const dotClass = remaining === 0 ? "bg-red-500" : remaining !== null && remaining <= 10 ? "bg-amber-400" : "bg-emerald-400"

  return (
    <nav className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white select-none">
          粵
        </div>
        <span className="font-semibold text-gray-100 text-sm tracking-tight">CantoChat</span>
        <span className="hidden sm:inline text-gray-500 text-xs">· CantoneseLLM v2</span>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-gray-300 select-none"
          title="每日額度於 00:00 HKT 重設"
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
          <span className="text-gray-400 hidden sm:inline">額度:</span>
          <span className="font-medium text-gray-200">
            {remaining === null || limit === null ? "-- / --" : `${remaining} / ${limit}`}
          </span>
        </div>
        <select
          value={selectedAgentId}
          onChange={(e) => onSelectAgent(e.target.value)}
          className="text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer hover:bg-gray-750 transition-colors"
        >
          {agents.length === 0 ? (
            <option value="default">廣東話助手</option>
          ) : (
            agents.map((a) => (
              <option key={a.id} value={a.id} title={a.description}>
                {a.name}
              </option>
            ))
          )}
        </select>
      </div>
    </nav>
  )
}
