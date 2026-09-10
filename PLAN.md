# HKChat — OpenAI-like Chat Interface for CantoneseLLM v2

A minimal ChatGPT-style web app for **CantoneseLLM v2**, deployed at
**`chat.hon9kon9ize.com`**. The browser talks only to our own backend; the backend runs
**Strands Agents** wired to the upstream CantoneseLLM OpenAI-compatible endpoint. Requests
are rate-limited to **20 per IP per day**.

Agents are **file-defined and auto-discovered**: each agent is a folder under `agents/`
(e.g. `agents/default/`) containing its own `AGENTS.md`, `skills/`, and `mcp.json`. The
backend scans `agents/` at startup and the UI dropdown is populated from whatever it finds —
so adding a new agent is just dropping a new folder, no code changes. A **"Default"** agent
(`agents/default/`) always ships.

---

## 1. Goals & Constraints

- Public URL: **`chat.hon9kon9ize.com`** (single origin — one deployable service).
- ChatGPT-like UI: top nav + conversation area, streaming responses.
- Text input and text output **only** (no images/audio/files/tools-in-UI).
- Agent dropdown in the top-right, **populated by discovery** from the `agents/` folder.
  Ships with **"Default"**; more agents appear automatically when their folders are added.
- Above the input: **"New Chat"** button, and **"Stop Generating"** button shown *only*
  while a response is streaming.
- Backend proxies the model. **The upstream API URL/key is never exposed to the browser.**
- Rate limit: **max 20 requests/IP/day**, enforced server-side.
- Every agent is defined entirely by files in `agents/[agent_name]/`: an **AGENTS.md**
  instruction file, a **skills/** folder, and an **mcp.json** — the Strands features that
  power the agent, added or edited without touching backend code.

## 2. Upstream Model (verified)

- Base URL: `https://cantonesellm.votee.dev/v1` (OpenAI-compatible, served by vLLM).
- Auth: none (`api_key="none"`).
- Model id: `CantoneseLLM`
  (root: `jed351/cantonese_llm_v2_chat_nemo_GRPO_Qwen3-30B-A3B-Think-2507`, `max_model_len=32768`).
- **Reasoning model.** Responses split content and thinking:
  - non-stream: `choices[0].message.content` (answer) + `choices[0].message.reasoning` (chain-of-thought).
  - stream: `delta.content` + `delta.reasoning` in separate fields.
  - **UI shows `content` only**; `reasoning` is dropped by default (optionally rendered in a
    collapsible "Thinking…" panel — see 6.5).
- Observed `finish_reason:"length"` at low `max_tokens` → default `max_tokens` should be generous (e.g. 1024–2048).

### About CantoneseLLM v2 (from the [tech report](https://hon9kon9ize.com/posts/2026-09-10-cantonesellm-v2-tech-report-en))

- Built on **Qwen3**, released in **8B** and **30B-A3B (Mixture-of-Experts)** sizes; the served
  endpoint is the **30B-A3B "Think"** variant. Described as the first systematic attempt to make
  a model **reason in Cantonese** (not Simplified Chinese) — this is why the `reasoning` stream matters.
- Training pipeline (5 stages): continuous pre-training (784M-token corpus, 568K rows, incl. ~5.4%
  Common Crawl Cantonese from 13 years of snapshots) → chat-vector merging → SFT → DPO →
  **RLVR** with a multiplicative language-and-script reward that enforces Cantonese reasoning.
- Strengths: Cantonese chain-of-thought, written-Chinese↔Cantonese translation, math, code, STEM,
  structured output (JSON/YAML), and rule-based instruction following (traditional-script purity,
  colloquial classifiers, sentence-final particles). Context length **32,768** tokens.
- **Known limitations (surface in UX copy / expectations):** reasoning traces were
  machine-translated (no native Cantonese CoT data exists); a measurable cross-language gap remains
  (math pass rate −0.247, code −0.105 when problems shift from English to Cantonese). Scores
  **73.16 on HKCanto-Eval** (−4.13% vs the official chat model) — the trade-off for reasoning in Cantonese.
- **Implication for HKChat:** the product is Cantonese-first. `AGENTS.md` should instruct the agent
  to answer in Traditional-script Cantonese, and default prompts/placeholder copy should be Cantonese.

> ⚠️ This endpoint lives **only in backend config**. Never ship it to the frontend bundle.

## 3. Architecture

```
┌─────────────────────┐  HTTPS (our API only) ┌────────────────────────────┐  OpenAI API  ┌────────────────────────┐
│  Browser            │ ────────────────────▶ │  FastAPI backend           │ ───────────▶ │ cantonesellm.votee.dev │
│  chat.hon9kon9ize.com │  POST /api/chat (SSE) │  + Strands agent (per req) │ (server-side)│ /v1  (CantoneseLLM)    │
│  (LangUI)           │ ◀──────────────────── │  + agent discovery         │ ◀─────────── │                        │
│                     │  text/event-stream    │  + IP rate limiter         │              │                        │
└─────────────────────┘                       └─────────────┬──────────────┘              └────────────────────────┘
                                                            │ scans at startup
                                                            ▼
                                                   agents/<name>/  (AGENTS.md, skills/, mcp.json)
```

- **Single deployable service** at `chat.hon9kon9ize.com`. FastAPI serves both the JSON/SSE API
  and the static frontend, so there is one origin (no CORS headaches) and one thing to deploy.
- **Agent discovery:** on startup the backend scans `agents/` for agent folders and builds a
  registry; `/api/agents` exposes it to the dropdown. The selected agent is built per request.

## 4. Tech Stack

**Backend**
- Python 3.11+
- [Strands Agents SDK](https://strandsagents.com/) (`strands-agents`, `strands-agents-tools`)
- Model provider: `strands.models.openai.OpenAIModel` pointed at the CantoneseLLM base URL
- FastAPI + Uvicorn, SSE via `StreamingResponse`
- `slowapi` (or a small custom limiter) for per-IP/day limiting, backed by in-memory or SQLite
- `pydantic-settings` for config via env vars

**Frontend**
- Static HTML + vanilla TS/JS (kept simple — matches the "just nav + conversation" scope)
- Tailwind CSS + [LangUI](https://github.com/CommandCodeAI/langui) copy-paste components
  (chat bubbles, prompt textarea, buttons, dropdown)
- Dev: Tailwind Play CDN for speed; **Production: Tailwind CLI build** to a static `styles.css`
- Streaming read via `fetch` + `ReadableStream`; cancel via `AbortController`

## 5. Repository Layout

```
hkchat/
├─ PLAN.md
├─ README.md
├─ .env.example
├─ pyproject.toml            # or requirements.txt
├─ agents/                   # ← agent definitions, auto-discovered (one folder = one agent)
│  └─ default/               # the "Default" agent (always ships)
│     ├─ AGENTS.md           # system instructions for this agent
│     ├─ agent.json          # (optional) display name, description, model overrides
│     ├─ skills/             # Strands SKILL.md skills (progressive disclosure)
│     │  └─ .gitkeep
│     └─ mcp.json            # optional MCP server config for this agent
│  # add agents/<name>/ folders here → they appear in the dropdown automatically
├─ backend/
│  ├─ main.py                # FastAPI app, routes, static mount
│  ├─ agents_registry.py     # discovers agents/, loads AGENTS.md/skills/mcp.json per folder
│  ├─ agent.py               # Strands agent factory (builds an Agent from a discovered spec)
│  ├─ config.py              # env-driven settings (upstream URL/key, limits, agents dir)
│  ├─ ratelimit.py           # per-IP/day limiter
│  └─ schemas.py             # request/response pydantic models
├─ frontend/
│  ├─ index.html             # nav + conversation + input (LangUI components)
│  ├─ src/app.ts             # chat state, streaming, stop/new-chat
│  ├─ src/api.ts             # thin client for /api/*
│  └─ tailwind.config.js
└─ docker/
   └─ Dockerfile
```

- The `agents/` directory is the **single source of truth** for what appears in the dropdown.
- Its location is configurable via `AGENTS_DIR` (default `./agents`) so deployments can mount it.

## 6. Backend Design

### 6.1 Agent discovery (`agents_registry.py`)

Each subfolder of `agents/` is one agent. At startup the backend scans `AGENTS_DIR` and builds a
registry of `AgentSpec`s. A folder is a valid agent iff it contains an `AGENTS.md`.

```python
from dataclasses import dataclass
from pathlib import Path
import json

@dataclass
class AgentSpec:
    id: str                # folder name, e.g. "default" (used as the API id)
    name: str              # display name (agent.json "name" or Title-cased id)
    description: str       # for dropdown tooltip / UI (agent.json, optional)
    system_prompt: str     # contents of AGENTS.md
    skills_dir: Path       # <folder>/skills (may be empty/absent)
    mcp_config: dict       # parsed <folder>/mcp.json (may be empty)
    model_overrides: dict  # agent.json "model" block (max_tokens/temperature/model_id)

def discover_agents(agents_dir: Path) -> dict[str, AgentSpec]:
    registry: dict[str, AgentSpec] = {}
    for folder in sorted(p for p in agents_dir.iterdir() if p.is_dir()):
        agents_md = folder / "AGENTS.md"
        if not agents_md.exists():
            continue                                   # not an agent → skip
        meta = {}
        if (folder / "agent.json").exists():
            meta = json.loads((folder / "agent.json").read_text("utf-8"))
        mcp = {}
        if (folder / "mcp.json").exists():
            mcp = json.loads((folder / "mcp.json").read_text("utf-8"))
        registry[folder.name] = AgentSpec(
            id=folder.name,
            name=meta.get("name", folder.name.replace("-", " ").title()),
            description=meta.get("description", ""),
            system_prompt=agents_md.read_text("utf-8"),
            skills_dir=folder / "skills",
            mcp_config=mcp,
            model_overrides=meta.get("model", {}),
        )
    if "default" not in registry:
        raise RuntimeError("agents/default/ is required")   # Default must always exist
    return registry
```

- Discovery runs **once at startup**; `/api/agents` serves the cached registry. (Optional: a debug
  reload endpoint or watch for dev.)
- `agent.json` is **optional** — without it, an agent still works using its folder name and `AGENTS.md`.
- Unknown/invalid folders are skipped with a warning; a broken `mcp.json`/`agent.json` fails that
  one agent, not the whole app.

### 6.2 Building an agent from a spec (`agent.py`)

```python
from strands import Agent, AgentSkills
from strands.models.openai import OpenAIModel

def build_agent(spec: AgentSpec) -> Agent:
    model = OpenAIModel(
        client_args={
            "api_key": settings.upstream_api_key,   # "none"
            "base_url": settings.upstream_base_url,  # https://cantonesellm.votee.dev/v1
        },
        model_id=spec.model_overrides.get("model_id", settings.model_id),   # "CantoneseLLM"
        params={
            "max_tokens": spec.model_overrides.get("max_tokens", settings.max_tokens),
            "temperature": spec.model_overrides.get("temperature", 0.7),
        },
    )

    plugins = []
    if spec.skills_dir.exists():
        plugins.append(AgentSkills(skills=str(spec.skills_dir)))   # progressive-disclosure skills

    return Agent(
        model=model,
        system_prompt=spec.system_prompt,   # AGENTS.md drives behavior
        plugins=plugins,
        # mcp clients built from spec.mcp_config attached here (see 6.6)
        callback_handler=None,              # we consume events via stream_async
    )
```

- **AGENTS.md** → the agent's `system_prompt` (per-agent instructions).
- **skills/** → `AgentSkills(skills=<folder>/skills)`; each skill is a subfolder with `SKILL.md`.
- **mcp.json** → MCP clients built from the per-agent config and passed to the `Agent` (see 6.6).
- Build the agent **per request** from the requested spec, so conversation state doesn't leak across
  users; keep the discovered specs and (optionally) the `model` object reusable.

### 6.3 API endpoints

| Method | Path            | Purpose                                                             |
|--------|-----------------|---------------------------------------------------------------------|
| GET    | `/api/agents`   | **discovered** agents — populates the dropdown (see below)           |
| POST   | `/api/chat`     | Streaming chat (SSE). Body: `{agent:"default", messages:[...]}`      |
| GET    | `/api/limit`    | (optional) remaining quota for this IP today                        |
| GET    | `/healthz`      | health check                                                        |
| GET    | `/`             | serves `frontend/index.html` + static assets                        |

`GET /api/agents` returns the discovered registry (never any upstream URL/key), e.g.:
```json
[ { "id": "default", "name": "Default", "description": "廣東話助手" } ]
```
The order is stable (sorted by folder name); the frontend selects `default` on load.

`POST /api/chat` request body — `agent` is the discovered agent `id`:
```json
{ "agent": "default", "messages": [ { "role": "user", "content": "用廣東話講個笑話" } ] }
```
- Validate `agent` against the registry; **unknown id → HTTP 400** `{"error":"unknown_agent"}`.

### 6.4 Streaming (SSE)

```python
from fastapi.responses import StreamingResponse

@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    enforce_rate_limit(client_ip(request))          # raises 429 if over 20/day
    spec = registry.get(req.agent)                  # req.agent = discovered id
    if spec is None:
        raise HTTPException(400, "unknown_agent")
    agent = build_agent(spec)

    async def gen():
        async for event in agent.stream_async(to_prompt(req.messages)):
            if "data" in event:                      # final answer text delta
                yield sse({"type": "delta", "text": event["data"]})
            # optional: forward reasoning deltas as {"type":"thinking", ...}
        yield sse({"type": "done"})

    return StreamingResponse(gen(), media_type="text/event-stream")
```

- Emit `text/event-stream`; each line `data: {json}\n\n`.
- Client cancellation (Stop Generating) closes the connection → the async generator is
  cancelled → upstream call is aborted.
- Consider a max token/time budget per request.

### 6.5 Reasoning-token handling

- Because the model emits a separate `reasoning` stream, the backend **only forwards `data`
  (the answer) by default**.
- Optional enhancement: forward reasoning as `{"type":"thinking"}` events so the UI can show a
  collapsible "Thinking…" section (collapsed by default). Decide during build.
- If Strands does not surface the nonstandard `reasoning` field, fall back to filtering any
  `<think>…</think>` blocks out of `content` before display.

### 6.6 MCP config (`agents/<name>/mcp.json`)

- **Per-agent.** Each agent's `mcp.json` defines MCP servers (stdio or streamable-HTTP) whose tool
  clients are attached when that agent is built. Empty/absent by default; documented so skills/MCP
  can be added by editing files under `agents/<name>/` without any code changes.

### 6.7 Rate limiting — 20 requests / IP / day (`ratelimit.py`)

- **Key:** client IP. Behind a proxy/CDN, read the **left-most** `X-Forwarded-For` entry (make the
  trusted-proxy behavior explicit and configurable — don't blindly trust the header).
- **Window:** calendar day (UTC or a configured TZ, e.g. Asia/Hong_Kong). Counter resets at midnight.
- **Storage:**
  - Simple/single-instance: in-memory dict `{(ip, date): count}` with periodic cleanup, **or**
  - Durable/multi-worker: SQLite table `usage(ip, day, count)` (upsert + check), or Redis `INCR`
    with `EXPIRE` to next midnight.
  - Recommend **SQLite** for a single small deployment (survives restarts, no extra service).
- **Enforcement:** increment on each `POST /api/chat`; if `count > 20` → **HTTP 429** with JSON
  `{"error":"daily_limit_reached","limit":20}` and (optionally) `Retry-After`.
- **Response headers:** `X-RateLimit-Limit: 20`, `X-RateLimit-Remaining: N`.
- Count a *request* (one send), not tokens. Decide whether a failed/cancelled generation refunds
  the count (recommend: count on accept, no refund, to prevent abuse).

### 6.8 Security

- Upstream base URL + key live only in backend env (`.env`, never committed; `.env.example` only).
- No secrets or upstream URLs in any frontend asset or `/api/agents` payload — only `id`/`name`/`description`.
- `mcp.json` per agent can launch processes/connect servers → treat `agents/` as **trusted, code-equivalent**
  input (review before deploy; don't accept agent folders from untrusted sources).
- Validate `agent` id against the registry (see 6.3); reject unknown ids.
- Validate/limit request size, message count, and per-message length.
- Basic input guardrails (reject empty/oversized prompts). CORS locked to same origin (`chat.hon9kon9ize.com`).

## 7. Frontend Design (LangUI)

### 7.1 Layout

```
┌───────────────────────────────────────────────────────────────┐
│  HKChat · CantoneseLLM v2                    [ Default ▾ ]      │  ← top nav (agent dropdown top-right)
├───────────────────────────────────────────────────────────────┤
│                                                                 │
│   user:   用廣東話講個笑話                                       │
│   assistant: 好呀！……                                            │  ← conversation (LangUI chat bubbles)
│                                                                 │
├───────────────────────────────────────────────────────────────┤
│   [ New Chat ]              [ Stop Generating ]   (while busy)  │  ← action row (Stop shown only when streaming)
│   ┌─────────────────────────────────────────────┐  [ Send ]    │
│   │ type a message…                              │              │  ← LangUI prompt textarea
│   └─────────────────────────────────────────────┘              │
├───────────────────────────────────────────────────────────────┤
│           hon9kon9ize   [] [] [] []                             │  ← footer (icon links: Discord/GitHub/Web/HF)
└───────────────────────────────────────────────────────────────┘
```

- **Top nav:** app title on the left; **agent dropdown** on the right, **populated at load from
  `GET /api/agents`** (LangUI dropdown/select component). Defaults to "Default"; if more agent
  folders exist they appear as extra options automatically. The chosen `id` is sent as `agent` in
  `POST /api/chat`.
- **Conversation:** LangUI user/assistant chat bubbles; assistant bubble fills in as tokens stream.
- **Action row (above input):**
  - **New Chat** — clears the conversation and message history, always visible.
  - **Stop Generating** — visible **only while streaming**; aborts the fetch.
- **Input:** LangUI prompt textarea + Send; Enter to send, Shift+Enter for newline.
- Auto-scroll to bottom on new tokens. Show a "daily limit reached" banner on HTTP 429.

### 7.2 Client behavior (`app.ts`)

- On **load**: `GET /api/agents` → populate the dropdown; track `selectedAgentId` (default `default`).
- Keep an in-memory `messages[]` array (role/content); send full history on each turn.
- On **Send**: push user message, open `fetch('/api/chat', { signal })` with body
  `{ agent: selectedAgentId, messages }`, read the SSE stream, append `delta.text` to the live
  assistant bubble.
- Changing the agent mid-thread: keep it simple — switching agents starts a **New Chat**
  (clear history) so instructions/skills don't mix. (Decide during build; see Open Questions.)
- On **Stop Generating**: `controller.abort()`; keep whatever text arrived so far.
- On **New Chat**: reset `messages[]`, clear UI, focus input.
- No persistence required (in-memory per tab). Optional: `localStorage` for the current thread.

### 7.3 Styling / LangUI integration

- Copy LangUI component markup (chat bubbles, textarea, buttons, dropdown) into `index.html`.
- Dev: Tailwind Play CDN. Production: Tailwind CLI build → `styles.css`, minified.

### 7.4 Footer (community links)

A slim footer under the input row with **icon links** to the hon9kon9ize community (open in a new
tab, `rel="noopener noreferrer"`, each with an `aria-label` for a11y):

| Icon        | Label       | URL                                   |
|-------------|-------------|---------------------------------------|
| Discord     | Discord     | https://discord.gg/qnZH5yXUh          |
| GitHub      | GitHub      | https://github.com/hon9kon9ize        |
| Website/Home| Website     | https://hon9kon9ize.com               |
| Hugging Face| Hugging Face| https://huggingface.co/hon9kon9ize    |

- **Icons:** inline SVG (Discord, GitHub, and 🤗 Hugging Face marks + a globe/home for the website).
  Use [Simple Icons](https://simpleicons.org/) SVGs for Discord/GitHub/Hugging Face; a Heroicons
  globe for the website. Inline them (no icon-font dependency); size ~20px, muted color, hover to accent.
- Keep it out of the scroll area (fixed under the input) so it's always visible but unobtrusive.
- Icon-only on narrow screens; may show the "hon9kon9ize" wordmark next to the icons on wider screens.

## 8. Configuration (`.env.example`)

```env
UPSTREAM_BASE_URL=https://cantonesellm.votee.dev/v1
UPSTREAM_API_KEY=none
MODEL_ID=CantoneseLLM
MAX_TOKENS=1024
DAILY_LIMIT=20
RATE_LIMIT_TZ=Asia/Hong_Kong
TRUST_FORWARDED_FOR=false        # true only behind a trusted proxy (chat.hon9kon9ize.com is behind one)
DB_PATH=./usage.db               # sqlite rate-limit store
AGENTS_DIR=./agents              # discovered agent folders (each has AGENTS.md/skills/mcp.json)
```

## 9. Milestones

1. **Scaffold** — repo layout, `pyproject.toml`, `.env.example`, FastAPI `main.py` with `/healthz`,
   and `agents/default/` (AGENTS.md + empty skills/ + empty mcp.json).
2. **Agent discovery** — `agents_registry.py` scans `agents/`; `agent.py` builds an `Agent` from a
   spec; smoke-test a non-stream reply from the Default agent.
3. **Agents API** — `GET /api/agents` returns the discovered registry (id/name/description only).
4. **Streaming API** — `POST /api/chat` (validates `agent` id) SSE via `stream_async`; verify token
   streaming with curl.
5. **Rate limiting** — per-IP/day limiter + 429 + headers; unit test the counter/reset.
6. **Frontend shell** — `index.html` with LangUI nav, dropdown populated from `/api/agents`, bubbles, input.
7. **Wire streaming** — fetch + ReadableStream, live bubble, New Chat, Stop Generating (AbortController).
8. **Reasoning handling** — drop `reasoning` by default (or optional collapsible "Thinking" panel).
9. **Author the Default agent** — write Cantonese-first `AGENTS.md`, add a sample skill folder,
   document `mcp.json`; verify a second dummy `agents/<name>/` folder shows up in the dropdown.
10. **Polish & deploy** — Tailwind production build, Dockerfile, README, single-service run at
    `chat.hon9kon9ize.com`.

## 10. Testing / Acceptance

- `GET /api/agents` lists the `agents/` folders (at minimum `{"id":"default","name":"Default"}`);
  dropping a new valid `agents/<name>/` folder makes it appear in the list/dropdown after restart,
  with **no code change**.
- Missing `agents/default/` → app refuses to start (clear error).
- `POST /api/chat` with an unknown `agent` id → HTTP 400 `unknown_agent`.
- The selected agent's `AGENTS.md` actually governs behavior (e.g. two agents with different
  instructions give visibly different responses).
- Chat streams incrementally; Cantonese in → Cantonese out.
- 21st request from same IP in a day → HTTP 429 + banner; resets next day.
- Frontend bundle/network tab contains **no** upstream URL or key.
- Stop Generating halts streaming and preserves partial text; New Chat clears state.
- Reasoning tokens are not shown as answer text.

## 11. Open Questions / Decisions

- **Reasoning UI:** hide entirely, or show a collapsible "Thinking…" panel? (default: hide)
- **Rate-limit store:** in-memory (single process) vs SQLite (recommended) vs Redis (multi-instance)?
- **Conversation persistence:** none vs `localStorage`? (default: none)
- **Deployment target** for `chat.hon9kon9ize.com` (affects proxy/`X-Forwarded-For` and store choice)?
- **Agent switching mid-thread:** force New Chat (default) vs keep history across agents?
- **Agent reload:** startup-only scan (default) vs hot-reload endpoint / file watch for editing agents live?
- **`agent.json` schema:** what belongs in it (name, description, model overrides, per-agent rate limit?).

---

### References
- CantoneseLLM v2 tech report — https://hon9kon9ize.com/posts/2026-09-10-cantonesellm-v2-tech-report-en
- Strands Agents — https://strandsagents.com/
- Strands OpenAI provider — https://strandsagents.com/docs/user-guide/concepts/model-providers/openai/
- Strands streaming (async iterators) — https://strandsagents.com/docs/user-guide/concepts/streaming/async-iterators/
- Strands Skills — https://strandsagents.com/docs/user-guide/concepts/plugins/skills/
- LangUI — https://github.com/CommandCodeAI/langui
- CantoneseLLM models — https://cantonesellm.votee.dev/v1/models
