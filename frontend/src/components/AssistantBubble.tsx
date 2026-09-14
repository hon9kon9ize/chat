import { Streamdown } from "streamdown"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "../ai-elements/reasoning"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "../ai-elements/tool"
import type { UIMessage } from "../types"

export function AssistantBubble({ message, isStreaming }: { message: UIMessage; isStreaming: boolean }) {
  return (
    <div className="chat-message flex items-start gap-2 mb-4">
      <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white select-none shadow-sm">
        粵
      </div>
      <div className="max-w-[75%] sm:max-w-md md:max-w-2xl min-w-[2rem]">
        {message.reasoningText && (
          <Reasoning isStreaming={!!message.reasoningStreaming} className="mb-2">
            <ReasoningTrigger />
            <ReasoningContent>{message.reasoningText}</ReasoningContent>
          </Reasoning>
        )}

        {message.toolCalls?.map((call) => (
          <Tool key={call.toolUseId} className="bg-gray-900 border-gray-800">
            <ToolHeader type="dynamic-tool" state={call.status} toolName={call.name} />
            <ToolContent>
              <ToolInput input={call.input} />
              <ToolOutput output={call.output as never} errorText={call.errorText} />
            </ToolContent>
          </Tool>
        ))}

        {(message.content || !message.reasoningText) && (
          <div className="rounded-b-2xl rounded-tr-2xl bg-gray-800 px-4 py-3 text-sm text-gray-100 break-words leading-relaxed shadow-sm">
            <Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{message.content}</Streamdown>
            {isStreaming && (
              <span className="typing-cursor inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
