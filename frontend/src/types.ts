export type ToolCallStatus = "input-streaming" | "input-available" | "output-available" | "output-error"

export interface ToolCallState {
  toolUseId: string
  name: string
  input: unknown
  status: ToolCallStatus
  output?: unknown
  errorText?: string
}

export interface UIMessage {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  reasoningText?: string
  reasoningStreaming?: boolean
  toolCalls?: ToolCallState[]
}
