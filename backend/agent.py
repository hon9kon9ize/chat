import logging
from typing import Any
from strands import Agent, AgentSkills
from strands.models.openai import OpenAIModel

from .agents_registry import AgentSpec
from .config import settings

logger = logging.getLogger(__name__)


class CompatibleOpenAIModel(OpenAIModel):
    """OpenAIModel with compatibility fixes for vLLM / OpenAI-compatible servers.

    - vLLM and several other inference servers reject empty `tools: []` payloads with HTTP 400.
    - Non-standard OpenAI sampling parameters (such as `top_k`, `min_p`, `repetition_penalty`)
      must be packaged under `extra_body` for the OpenAI python SDK client.
    """

    STANDARD_OPENAI_PARAMS = {
        "messages",
        "model",
        "stream",
        "tools",
        "tool_choice",
        "frequency_penalty",
        "logit_bias",
        "logprobs",
        "top_logprobs",
        "max_tokens",
        "max_completion_tokens",
        "n",
        "presence_penalty",
        "response_format",
        "seed",
        "service_tier",
        "stop",
        "stream_options",
        "temperature",
        "top_p",
        "user",
        "store",
        "metadata",
        "reasoning_effort",
    }

    def format_request(
        self,
        messages: Any,
        tool_specs: Any = None,
        system_prompt: Any = None,
        tool_choice: Any = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        req = super().format_request(
            messages,
            tool_specs=tool_specs,
            system_prompt=system_prompt,
            tool_choice=tool_choice,
            **kwargs,
        )
        if "tools" in req and not req["tools"]:
            del req["tools"]

        extra_body = dict(req.get("extra_body") or {})
        keys_to_move = [
            k for k in req.keys()
            if k not in self.STANDARD_OPENAI_PARAMS and k != "extra_body"
        ]
        for k in keys_to_move:
            extra_body[k] = req.pop(k)
        if extra_body:
            req["extra_body"] = extra_body

        return req


def build_agent(spec: AgentSpec) -> Agent:
    params: dict[str, Any] = {
        "max_tokens": spec.model_overrides.get("max_tokens", settings.max_tokens),
        "temperature": spec.model_overrides.get("temperature", 1.0),
        "top_p": spec.model_overrides.get("top_p", 0.95),
        "top_k": spec.model_overrides.get("top_k", 20),
        "min_p": spec.model_overrides.get("min_p", 0.0),
        "presence_penalty": spec.model_overrides.get("presence_penalty", 0.0),
        "repetition_penalty": spec.model_overrides.get("repetition_penalty", 1.0),
    }
    # Allow any additional custom model overrides from agent.json
    for key, val in spec.model_overrides.items():
        if key not in ("model_id",):
            params[key] = val

    model = CompatibleOpenAIModel(
        client_args={
            "api_key": settings.upstream_api_key,
            "base_url": settings.upstream_base_url,
        },
        model_id=spec.model_overrides.get("model_id", settings.model_id),
        params=params,
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
