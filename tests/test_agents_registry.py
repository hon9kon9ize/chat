import json
from pathlib import Path
import pytest
from backend.agents_registry import AgentSpec, discover_agents


def test_discover_agents_nonexistent_dir(tmp_path):
    missing_dir = tmp_path / "nonexistent_agents"
    with pytest.raises(RuntimeError) as exc_info:
        discover_agents(missing_dir)
    assert "Agents directory not found" in str(exc_info.value)


def test_discover_agents_missing_default(tmp_path):
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()

    # Create an agent folder that is not 'default'
    custom = agents_dir / "custom"
    custom.mkdir()
    (custom / "AGENTS.md").write_text("You are custom.", encoding="utf-8")

    with pytest.raises(RuntimeError) as exc_info:
        discover_agents(agents_dir)
    assert "agents/default/ with AGENTS.md is required" in str(exc_info.value)


def test_discover_agents_skip_dir_without_agents_md(tmp_path):
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()

    # default agent valid
    default_dir = agents_dir / "default"
    default_dir.mkdir()
    (default_dir / "AGENTS.md").write_text("Default agent prompt", encoding="utf-8")

    # invalid directory (no AGENTS.md)
    invalid_dir = agents_dir / "not_an_agent"
    invalid_dir.mkdir()

    registry = discover_agents(agents_dir)
    assert "default" in registry
    assert "not_an_agent" not in registry


def test_discover_agents_success_with_metadata(tmp_path):
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()

    # default agent without agent.json
    default_dir = agents_dir / "default"
    default_dir.mkdir()
    (default_dir / "AGENTS.md").write_text("Default prompt", encoding="utf-8")

    # second agent with agent.json and mcp.json
    helper_dir = agents_dir / "cantonese-tutor"
    helper_dir.mkdir()
    (helper_dir / "AGENTS.md").write_text("Tutor prompt", encoding="utf-8")
    (helper_dir / "agent.json").write_text(
        json.dumps({
            "name": "Cantonese Tutor Pro",
            "description": "Learn Cantonese with AI",
            "model": {"temperature": 0.5, "max_tokens": 2048},
        }),
        encoding="utf-8",
    )
    (helper_dir / "mcp.json").write_text(
        json.dumps({"mcpServers": {"test": {"command": "echo"}}}),
        encoding="utf-8",
    )

    registry = discover_agents(agents_dir)
    assert len(registry) == 2

    # Verify default agent fallback title
    default_spec = registry["default"]
    assert default_spec.id == "default"
    assert default_spec.name == "Default"
    assert default_spec.description == ""
    assert default_spec.system_prompt == "Default prompt"
    assert default_spec.mcp_config == {}
    assert default_spec.model_overrides == {}

    # Verify cantonese-tutor overrides
    tutor_spec = registry["cantonese-tutor"]
    assert tutor_spec.id == "cantonese-tutor"
    assert tutor_spec.name == "Cantonese Tutor Pro"
    assert tutor_spec.description == "Learn Cantonese with AI"
    assert tutor_spec.system_prompt == "Tutor prompt"
    assert tutor_spec.model_overrides == {"temperature": 0.5, "max_tokens": 2048}
    assert tutor_spec.mcp_config == {"mcpServers": {"test": {"command": "echo"}}}


def test_discover_agents_malformed_json_fallback(tmp_path):
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()

    default_dir = agents_dir / "default"
    default_dir.mkdir()
    (default_dir / "AGENTS.md").write_text("Default prompt", encoding="utf-8")

    # Corrupted agent.json and mcp.json
    (default_dir / "agent.json").write_text("{corrupted json", encoding="utf-8")
    (default_dir / "mcp.json").write_text("{corrupted json", encoding="utf-8")

    # Should not raise exception; falls back to defaults
    registry = discover_agents(agents_dir)
    default_spec = registry["default"]
    assert default_spec.name == "Default"
    assert default_spec.model_overrides == {}
    assert default_spec.mcp_config == {}


def test_discover_real_repo_agents():
    # Verify the real agents/ directory in the repo passes discovery
    repo_agents_dir = Path(__file__).parent.parent / "agents"
    registry = discover_agents(repo_agents_dir)
    assert "default" in registry
    assert registry["default"].system_prompt != ""

