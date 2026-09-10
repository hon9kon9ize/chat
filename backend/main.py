import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
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


app = FastAPI(title="HKChat", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://chat.hon9kon9ize.com"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


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
async def limit_info(request: Request):
    ip = get_client_ip(request)
    remaining, limit = get_remaining(ip)
    return LimitInfo(limit=limit, remaining=remaining, reset_at="00:00 HKT")


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
        try:
            async for event in agent.stream_async(strands_messages):
                text = event.get("data")
                if text:
                    yield _sse({"type": "delta", "text": text})
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
