from pathlib import Path
from unittest.mock import patch
import pytest

from backend.agent import CompatibleOpenAIModel, build_agent, to_strands_messages
from backend.agents_registry import AgentSpec
from backend.schemas import Message


def test_compatible_openai_model_removes_empty_tools():
    model = CompatibleOpenAIModel(
        client_args={"api_key": "test-key", "base_url": "http://localhost:8000/v1"},
        model_id="test-model",
    )
    # When tool_specs is None or empty list, 'tools' key should be deleted from request
    req = model.format_request([{"role": "user", "content": [{"text": "hello"}]}], tool_specs=[])
    assert "tools" not in req


def test_compatible_openai_model_preserves_non_empty_tools():
    model = CompatibleOpenAIModel(
        client_args={"api_key": "test-key", "base_url": "http://localhost:8000/v1"},
        model_id="test-model",
    )
    tools = [{
        "name": "search_db",
        "description": "Searches the database",
        "inputSchema": {"json": {"type": "object", "properties": {"q": {"type": "string"}}}},
    }]
    req = model.format_request([{"role": "user", "content": [{"text": "hello"}]}], tool_specs=tools)
    assert "tools" in req
    assert len(req["tools"]) == 1
    assert req["tools"][0]["function"]["name"] == "search_db"


def test_compatible_openai_model_moves_non_standard_params_to_extra_body():
    model = CompatibleOpenAIModel(
        client_args={"api_key": "test-key", "base_url": "http://localhost:8000/v1"},
        model_id="test-model",
        params={
            "temperature": 0.8,
            "max_tokens": 1024,
            "top_k": 40,
            "min_p": 0.05,
            "repetition_penalty": 1.15,
            "custom_server_param": "abc",
        },
    )
    req = model.format_request([{"role": "user", "content": [{"text": "hello"}]}])

    # Standard OpenAI params stay in root request
    assert req["temperature"] == 0.8
    assert req["max_tokens"] == 1024

    # Non-standard params are removed from root request
    assert "top_k" not in req
    assert "min_p" not in req
    assert "repetition_penalty" not in req
    assert "custom_server_param" not in req

    # Non-standard params are placed under extra_body
    assert "extra_body" in req
    assert req["extra_body"]["top_k"] == 40
    assert req["extra_body"]["min_p"] == 0.05
    assert req["extra_body"]["repetition_penalty"] == 1.15
    assert req["extra_body"]["custom_server_param"] == "abc"


def test_compatible_openai_model_merges_with_existing_extra_body():
    model = CompatibleOpenAIModel(
        client_args={"api_key": "test-key", "base_url": "http://localhost:8000/v1"},
        model_id="test-model",
        params={
            "extra_body": {"existing_key": 123},
            "top_k": 50,
        },
    )
    req = model.format_request([{"role": "user", "content": [{"text": "hello"}]}])
    assert req["extra_body"]["existing_key"] == 123
    assert req["extra_body"]["top_k"] == 50


def test_to_strands_messages():
    messages = [
        Message(role="user", content="Hello world"),
        Message(role="assistant", content="Hello! How can I help?"),
        Message(role="system", content="System instruction should be ignored"),
    ]

    strands_msgs = to_strands_messages(messages)
    assert len(strands_msgs) == 2
    assert strands_msgs[0] == {"role": "user", "content": [{"text": "Hello world"}]}
    assert strands_msgs[1] == {"role": "assistant", "content": [{"text": "Hello! How can I help?"}]}


def test_build_agent_without_skills(tmp_path):
    skills_dir = tmp_path / "skills"
    skills_dir.mkdir()
    (skills_dir / ".gitkeep").touch()

    spec = AgentSpec(
        id="default",
        name="Default",
        description="Default agent",
        system_prompt="You are a helpful assistant.",
        skills_dir=skills_dir,
        model_overrides={"temperature": 0.3, "top_k": 30},
    )

    agent = build_agent(spec)
    assert agent.system_prompt == "You are a helpful assistant."
    assert agent.tool_names == []
    assert isinstance(agent.model, CompatibleOpenAIModel)
    assert agent.model.config["params"]["temperature"] == 0.3
    assert agent.model.config["params"]["top_k"] == 30


def test_build_agent_with_skills(tmp_path):
    skills_dir = tmp_path / "skills"
    sample_skill = skills_dir / "calculator"
    sample_skill.mkdir(parents=True)
    (sample_skill / "SKILL.md").write_text(
        "---\nname: calculator\ndescription: math calculations\n---\n# Calculator",
        encoding="utf-8",
    )

    spec = AgentSpec(
        id="math-agent",
        name="Math Agent",
        description="Solves math",
        system_prompt="You are a math helper.",
        skills_dir=skills_dir,
    )

    agent = build_agent(spec)
    assert "skills" in agent.tool_names

