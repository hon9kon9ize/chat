import { fetchAgents, streamChat, type AgentInfo, type Message } from "./api"

// ── State ────────────────────────────────────────────────────────────────────

let messages: Message[] = []
let streaming = false
let abortController: AbortController | null = null
let selectedAgentId = "default"

// ── DOM refs ─────────────────────────────────────────────────────────────────

const agentSelect = document.getElementById("agent-select") as HTMLSelectElement
const conversationEl = document.getElementById("conversation") as HTMLDivElement
const inputEl = document.getElementById("chat-input") as HTMLTextAreaElement
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement
const newChatBtn = document.getElementById("new-chat-btn") as HTMLButtonElement
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement
const errorBanner = document.getElementById("error-banner") as HTMLDivElement
const errorText = document.getElementById("error-text") as HTMLSpanElement

// ── Agents ───────────────────────────────────────────────────────────────────

async function loadAgents(): Promise<void> {
  try {
    const agents = await fetchAgents()
    agentSelect.innerHTML = ""
    agents.forEach((a: AgentInfo) => {
      const opt = document.createElement("option")
      opt.value = a.id
      opt.textContent = a.name
      opt.title = a.description
      agentSelect.appendChild(opt)
    })
    // Default to "default" if present
    const hasDefault = agents.some((a) => a.id === "default")
    selectedAgentId = hasDefault ? "default" : (agents[0]?.id ?? "default")
    agentSelect.value = selectedAgentId
  } catch {
    // Fallback — keep the static default option
  }
}

agentSelect.addEventListener("change", () => {
  const newId = agentSelect.value
  if (newId !== selectedAgentId && messages.length > 0) {
    newChat()
  }
  selectedAgentId = newId
})

// ── Chat bubbles ──────────────────────────────────────────────────────────────

function addUserBubble(text: string): void {
  const el = document.createElement("div")
  el.className = "flex justify-end mb-4"
  el.innerHTML = `
    <div class="max-w-[75%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-3 text-sm text-white whitespace-pre-wrap break-words">
      ${escapeHtml(text)}
    </div>`
  conversationEl.appendChild(el)
  scrollToBottom()
}

function addAssistantBubble(): { update: (t: string) => void; finalize: () => void } {
  const wrapper = document.createElement("div")
  wrapper.className = "flex justify-start mb-4"
  wrapper.innerHTML = `
    <div class="flex items-start gap-3 max-w-[85%]">
      <div class="mt-1 flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">粵</div>
      <div class="assistant-content rounded-2xl rounded-tl-sm bg-gray-800 px-4 py-3 text-sm text-gray-100 whitespace-pre-wrap break-words min-w-[2rem]">
        <span class="typing-cursor inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle"></span>
      </div>
    </div>`
  conversationEl.appendChild(wrapper)
  scrollToBottom()

  const contentEl = wrapper.querySelector(".assistant-content") as HTMLDivElement
  let accumulated = ""

  return {
    update(chunk: string) {
      accumulated += chunk
      const cursor = contentEl.querySelector(".typing-cursor")
      contentEl.textContent = accumulated
      if (cursor) contentEl.appendChild(cursor)
      scrollToBottom()
    },
    finalize() {
      const cursor = contentEl.querySelector(".typing-cursor")
      if (cursor) cursor.remove()
      contentEl.textContent = accumulated
    },
  }
}

function addErrorBubble(msg: string): void {
  const el = document.createElement("div")
  el.className = "flex justify-start mb-4"
  el.innerHTML = `
    <div class="rounded-2xl rounded-tl-sm bg-red-900/40 border border-red-700/50 px-4 py-3 text-sm text-red-300">
      ⚠️ ${escapeHtml(msg)}
    </div>`
  conversationEl.appendChild(el)
  scrollToBottom()
}

// ── Send / Stop / New chat ────────────────────────────────────────────────────

function setStreaming(active: boolean): void {
  streaming = active
  sendBtn.disabled = active
  inputEl.disabled = active
  stopBtn.classList.toggle("hidden", !active)
  if (!active) {
    inputEl.focus()
  }
}

function send(): void {
  const text = inputEl.value.trim()
  if (!text || streaming) return

  hideErrorBanner()
  inputEl.value = ""
  resizeInput()

  const userMsg: Message = { role: "user", content: text }
  messages.push(userMsg)
  addUserBubble(text)

  setStreaming(true)

  const bubble = addAssistantBubble()
  let assistantText = ""

  abortController = new AbortController()

  streamChat(
    selectedAgentId,
    messages,
    abortController.signal,
    (chunk) => {
      assistantText += chunk
      bubble.update(chunk)
    },
    () => {
      bubble.finalize()
      if (assistantText) {
        messages.push({ role: "assistant", content: assistantText })
      }
      setStreaming(false)
      abortController = null
    },
    (errMsg) => {
      bubble.finalize()
      addErrorBubble(errMsg)
    }
  )
}

function stopGenerating(): void {
  abortController?.abort()
  setStreaming(false)
}

function newChat(): void {
  messages = []
  conversationEl.innerHTML = ""
  hideErrorBanner()
  inputEl.value = ""
  resizeInput()
  setStreaming(false)
  abortController?.abort()
  abortController = null
  inputEl.focus()
}

// ── Error banner ──────────────────────────────────────────────────────────────

function showErrorBanner(msg: string): void {
  errorText.textContent = msg
  errorBanner.classList.remove("hidden")
}

function hideErrorBanner(): void {
  errorBanner.classList.add("hidden")
}

// ── Input auto-resize ─────────────────────────────────────────────────────────

function resizeInput(): void {
  inputEl.style.height = "auto"
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px"
}

inputEl.addEventListener("input", resizeInput)

inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    send()
  }
})

// ── Scroll ────────────────────────────────────────────────────────────────────

function scrollToBottom(): void {
  conversationEl.scrollTop = conversationEl.scrollHeight
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// ── Event listeners ───────────────────────────────────────────────────────────

sendBtn.addEventListener("click", send)
stopBtn.addEventListener("click", stopGenerating)
newChatBtn.addEventListener("click", newChat)

// ── Init ──────────────────────────────────────────────────────────────────────

loadAgents()
inputEl.focus()
