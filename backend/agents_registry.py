import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class AgentSpec:
    id: str
    name: str
    description: str
    system_prompt: str
    skills_dir: Path
    mcp_config: dict = field(default_factory=dict)
    model_overrides: dict = field(default_factory=dict)


def discover_agents(agents_dir: Path) -> dict[str, AgentSpec]:
    if not agents_dir.exists():
        raise RuntimeError(f"Agents directory not found: {agents_dir}")

    registry: dict[str, AgentSpec] = {}

    for folder in sorted(p for p in agents_dir.iterdir() if p.is_dir()):
        agents_md = folder / "AGENTS.md"
        if not agents_md.exists():
            logger.warning("Skipping %s: no AGENTS.md found", folder.name)
            continue

        meta: dict = {}
        agent_json = folder / "agent.json"
        if agent_json.exists():
            try:
                meta = json.loads(agent_json.read_text("utf-8"))
            except Exception as exc:
                logger.warning("Bad agent.json in %s, ignoring: %s", folder.name, exc)

        mcp: dict = {}
        mcp_json = folder / "mcp.json"
        if mcp_json.exists():
            try:
                mcp = json.loads(mcp_json.read_text("utf-8"))
            except Exception as exc:
                logger.warning("Bad mcp.json in %s, ignoring: %s", folder.name, exc)

        display_name = meta.get("name", folder.name.replace("-", " ").title())
        registry[folder.name] = AgentSpec(
            id=folder.name,
            name=display_name,
            description=meta.get("description", ""),
            system_prompt=agents_md.read_text("utf-8"),
            skills_dir=folder / "skills",
            mcp_config=mcp,
            model_overrides=meta.get("model", {}),
        )
        logger.info("Loaded agent: %s (%s)", folder.name, display_name)

    if "default" not in registry:
        raise RuntimeError(
            "agents/default/ with AGENTS.md is required but was not found. "
            "Create agents/default/AGENTS.md to continue."
        )

    return registry
