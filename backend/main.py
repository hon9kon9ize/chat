import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .agent import build_agent, to_strands_messages
from .agents_registry import AgentSpec, discover_agents
from .config import settings
from .ratelimit import check_and_increment, get_client_ip, get_remaining
from .schemas import AgentInfo, ChatRequest, LimitInfo

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

registry: dict[str, AgentSpec] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global registry
    registry = discover_agents(settings.agents_dir)
    logger.info("Agents loaded: %s", list(registry.keys()))
    yield


app = FastAPI(title="CantoChat", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://chat.hon9kon9ize.com"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
# Compresses static assets (dist/app.js, dist/styles.css, index.html) at the
# source, independent of any CDN/edge compression in front of this service.
# Starlette excludes text/event-stream by default, so /api/chat's SSE stream
# is unaffected — this only touches the static frontend bundle.
app.add_middleware(GZipMiddleware, minimum_size=1000)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "agents": list(registry.keys())}


@app.get("/api/agents", response_model=list[AgentInfo])
async def list_agents():
    return [
        AgentInfo(id=s.id, name=s.name, description=s.description)
        for s in registry.values()
    ]


@app.get("/api/limit", response_model=LimitInfo)
async def limit_info(request: Request, response: Response):
    ip = get_client_ip(request)
    remaining, limit = get_remaining(ip)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    return LimitInfo(limit=limit, remaining=remaining, reset_at="00:00 HKT")


@app.api_route("/api/ping", methods=["GET", "POST"])
async def ping(request: Request, response: Response):
    ip = get_client_ip(request)
    remaining = check_and_increment(ip)
    response.headers["X-RateLimit-Limit"] = str(settings.daily_limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    return {"status": "pong", "remaining": remaining}


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    spec = registry.get(req.agent)
    if spec is None:
        raise HTTPException(400, detail={"error": "unknown_agent"})

    ip = get_client_ip(request)
    remaining = check_and_increment(ip)

    agent = build_agent(spec)
    strands_messages = to_strands_messages(req.messages)

    async def generate():
        started = False
        try:
            async for event in agent.stream_async(strands_messages):
                text = event.get("data")
                if text:
                    # The model's content stream picks up right where its reasoning
                    # left off, and often starts with a stray leading newline from
                    # that boundary — trim it so the visible reply doesn't open with
                    # a blank line. The same transition also tells the frontend the
                    # reasoning panel is done streaming (see `onDone` on the first
                    # "delta" in api.ts).
                    if not started:
                        text = text.lstrip("\n")
                        if not text:
                            continue
                        started = True
                    yield _sse({"type": "delta", "text": text})
                    continue

                if event.get("reasoning") and event.get("reasoningText"):
                    yield _sse({"type": "reasoning", "text": event["reasoningText"]})
                    continue

                current_tool_use = event.get("current_tool_use")
                if current_tool_use and current_tool_use.get("toolUseId"):
                    yield _sse({
                        "type": "tool_use",
                        "tool_use_id": current_tool_use["toolUseId"],
                        "name": current_tool_use.get("name"),
                        "input": current_tool_use.get("input"),
                    })
                    continue

                if event.get("type") == "tool_result":
                    tool_result = event.get("tool_result") or {}
                    yield _sse({
                        "type": "tool_result",
                        "tool_use_id": tool_result.get("toolUseId"),
                        "status": tool_result.get("status"),
                        "content": tool_result.get("content"),
                    })
            yield _sse({"type": "done"})
        except Exception as exc:
            # If the model hits max tokens, strands raises MaxTokensReachedException
            # but partial content was already streamed. Just send done.
            if exc.__class__.__name__ == "MaxTokensReachedException":
                yield _sse({"type": "done"})
                return
            logger.error("Stream error for agent=%s ip=%s: %s", req.agent, ip, exc)
            yield _sse({"type": "error", "message": "回應出現錯誤，請稍後再試。"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-RateLimit-Limit": str(settings.daily_limit),
            "X-RateLimit-Remaining": str(remaining),
        },
    )


# Serve the compiled frontend. Must come last.
_frontend = Path(__file__).parent.parent / "frontend"
if _frontend.exists():
    app.mount("/", StaticFiles(directory=str(_frontend), html=True), name="static")
