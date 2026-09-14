# CantoneseLLM Chat

廣東話 AI 聊天介面，由 [CantoneseLLM v2](https://hon9kon9ize.com/posts/2026-09-10-cantonesellm-v2-tech-report-en) 驅動 — 全球第一個以廣東話推理的大型語言模型。

**Live:** [chat.hon9kon9ize.com](https://chat.hon9kon9ize.com)

---

## Architecture

```
Browser → Cloudflare Worker → CantoChatContainer (Durable Object)
                                      ↓ Docker container (FastAPI + Strands)
                                      ↓ agents/<name>/  (AGENTS.md, skills/, mcp.json)
                                      ↓ CantoneseLLM v2 API (OpenAI-compatible)
```

- **Worker** routes all requests to a single named container instance
- **FastAPI backend** streams SSE responses via Strands Agents
- **Agent discovery** — drop a folder in `agents/` to add a new agent to the dropdown; no code changes needed
- **Rate limiting** — 20 requests / IP / day, backed by SQLite, Cloudflare `CF-Connecting-IP`-aware

## Project Layout

```
CantoChat/
├── agents/                  # Agent definitions (auto-discovered)
│   └── default/
│       ├── AGENTS.md        # System instructions
│       ├── agent.json       # Display name, description
│       ├── skills/          # Strands skills
│       └── mcp.json         # MCP server config
├── backend/                 # FastAPI app
│   ├── main.py
│   ├── agents_registry.py
│   ├── agent.py
│   ├── config.py
│   ├── ratelimit.py
│   └── schemas.py
├── frontend/                # Chat UI (Tailwind + esbuild)
│   ├── index.html
│   └── src/
│       ├── app.ts
│       └── api.ts
├── worker/                  # Cloudflare Worker + Container class
│   └── src/index.ts
├── docker/Dockerfile        # Multi-stage build (Node → Python, linux/amd64)
└── wrangler.toml            # Cloudflare Containers config
```

## Local Development

**Prerequisites:** Python 3.11+, Node.js 20+

```bash
# 1. Copy and fill in secrets
cp .env.example .env
# Edit .env — set UPSTREAM_BASE_URL and MODEL_ID

# 2. Build frontend
cd frontend && npm install && npm run build && cd ..

# 3. Run backend
pip install fastapi uvicorn pydantic pydantic-settings strands-agents strands-agents-tools
uvicorn backend.main:app --reload
```

Open [http://localhost:8000](http://localhost:8000).

## Deploy to Cloudflare

**Prerequisites:** Docker running, [Wrangler](https://developers.cloudflare.com/workers/wrangler/) authenticated (`wrangler login`)

### 1. Set secrets

```bash
cd worker
wrangler secret put UPSTREAM_BASE_URL   # https://your-endpoint/v1
wrangler secret put UPSTREAM_API_KEY    # none  (or your key)
wrangler secret put MODEL_ID            # your-model-id
```

### 2. Build the frontend

```bash
cd frontend && npm install && npm run build && cd ..
```

### 3. Deploy

```bash
cd worker && npm install && npx wrangler deploy
```

Wrangler will build and push the Docker image, deploy the Worker, and update container instances. Allow a few minutes for the first deployment to provision.

### Check deployment

```bash
npx wrangler containers list
```

## Adding a New Agent

1. Create `agents/<name>/AGENTS.md` with system instructions
2. Optionally add `agent.json` (display name/description), `skills/`, `mcp.json`
3. Redeploy — the agent appears in the dropdown automatically

## Configuration

| Variable | Default | Description |
|---|---|---|
| `UPSTREAM_BASE_URL` | *(required)* | OpenAI-compatible API base URL |
| `UPSTREAM_API_KEY` | `none` | API key (`none` if unauthenticated) |
| `MODEL_ID` | *(required)* | Model identifier |
| `MAX_TOKENS` | `8192` | Max output tokens (model max: 32768) |
| `DAILY_LIMIT` | `20` | Requests per IP per day |
| `RATE_LIMIT_TZ` | `Asia/Hong_Kong` | Timezone for daily reset |
| `AGENTS_DIR` | `./agents` | Path to agent definitions |
| `DB_PATH` | `/tmp/usage.db` | SQLite rate-limit store |

## Chat Datastore (Cloudflare D1)

Chat interactions (user inputs, assistant responses, thinking traces, agent IDs, and response latencies) are logged asynchronously to **Cloudflare D1** (`hkchat-db`) via Worker stream tapping (`ctx.waitUntil`).

### Querying Logs via Wrangler CLI

```bash
# Query the latest 10 chat logs
npx --prefix worker wrangler d1 execute hkchat-db --config wrangler.toml --remote \
  --command="SELECT created_at, agent, user_input, response, duration_ms FROM chat_logs ORDER BY created_at DESC LIMIT 10;"

# Count interactions by agent
npx --prefix worker wrangler d1 execute hkchat-db --config wrangler.toml --remote \
  --command="SELECT agent, count(*) as total_requests FROM chat_logs GROUP BY agent;"
```

You can also browse and query logs in the Cloudflare Dashboard under **Workers & Pages > D1 > hkchat-db > Tables > chat_logs**.


## Community

| | |
|---|---|
| Discord | [discord.gg/qnZH5yXUh](https://discord.gg/qnZH5yXUh) |
| GitHub | [github.com/hon9kon9ize](https://github.com/hon9kon9ize) |
| Website | [hon9kon9ize.com](https://hon9kon9ize.com) |
| Hugging Face | [huggingface.co/hon9kon9ize](https://huggingface.co/hon9kon9ize) |
