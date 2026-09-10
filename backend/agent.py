import logging
from strands import Agent, AgentSkills
from strands.models.openai import OpenAIModel

from .agents_registry import AgentSpec
from .config import settings

logger = logging.getLogger(__name__)


def build_agent(spec: AgentSpec) -> Agent:
    model = OpenAIModel(
        client_args={
            "api_key": settings.upstream_api_key,
            "base_url": settings.upstream_base_url,
        },
        model_id=spec.model_overrides.get("model_id", settings.model_id),
        params={
            "max_tokens": spec.model_overrides.get("max_tokens", settings.max_tokens),
            "temperature": spec.model_overrides.get("temperature", 0.7),
        },
    )

    plugins = []
    skills_dir = spec.skills_dir
    if skills_dir.exists() and any(
        p for p in skills_dir.iterdir() if p.name != ".gitkeep"
    ):
        plugins.append(AgentSkills(skills=str(skills_dir)))
        logger.info("Agent %s: loaded skills from %s", spec.id, skills_dir)

    return Agent(
        model=model,
        system_prompt=spec.system_prompt,
        plugins=plugins if plugins else None,
        callback_handler=None,
    )


def to_strands_messages(messages: list) -> list:
    """Convert simple role/content messages to Strands Message format."""
    return [
        {"role": m.role, "content": [{"text": m.content}]}
        for m in messages
        if m.role in ("user", "assistant")
    ]
