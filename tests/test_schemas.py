import pytest
from pydantic import ValidationError
from backend.schemas import ChatRequest, Message


def test_valid_chat_request():
    req = ChatRequest(
        agent="default",
        messages=[
            Message(role="user", content="你好"),
            Message(role="assistant", content="你好！有咩可以幫到你？"),
        ],
    )
    assert req.agent == "default"
    assert len(req.messages) == 2


def test_empty_messages_rejected():
    with pytest.raises(ValidationError) as exc_info:
        ChatRequest(agent="default", messages=[])
    assert "messages cannot be empty" in str(exc_info.value)


def test_max_30_messages_enforced():
    # 30 messages should pass
    valid_msgs = [Message(role="user", content=f"msg {i}") for i in range(30)]
    req = ChatRequest(agent="default", messages=valid_msgs)
    assert len(req.messages) == 30

    # 31 messages should be rejected
    too_many = [Message(role="user", content=f"msg {i}") for i in range(31)]
    with pytest.raises(ValidationError) as exc_info:
        ChatRequest(agent="default", messages=too_many)
    assert "too many messages (max 30)" in str(exc_info.value)


def test_max_4000_chars_per_message_enforced():
    # 4000 chars should pass
    req = ChatRequest(
        agent="default",
        messages=[Message(role="user", content="a" * 4000)],
    )
    assert len(req.messages[0].content) == 4000

    # 4001 chars should fail
    with pytest.raises(ValidationError) as exc_info:
        ChatRequest(
            agent="default",
            messages=[Message(role="user", content="a" * 4001)],
        )
    assert "message too long (max 4000 chars)" in str(exc_info.value)


def test_agent_validation():
    valid_msgs = [Message(role="user", content="hi")]

    # Empty agent
    with pytest.raises(ValidationError) as exc_info:
        ChatRequest(agent="", messages=valid_msgs)
    assert "invalid agent id" in str(exc_info.value)

    # > 64 characters agent id
    with pytest.raises(ValidationError) as exc_info:
        ChatRequest(agent="a" * 65, messages=valid_msgs)
    assert "invalid agent id" in str(exc_info.value)

    # Valid agent id
    req = ChatRequest(agent="cantonese-expert", messages=valid_msgs)
    assert req.agent == "cantonese-expert"


def test_message_roles():
    # Valid roles
    for role in ["user", "assistant", "system"]:
        msg = Message(role=role, content="test")
        assert msg.role == role

    # Invalid role
    with pytest.raises(ValidationError):
        Message(role="invalid_role", content="test")


def test_agent_info_schema():
    from backend.schemas import AgentInfo

    info = AgentInfo(id="agent-1", name="Agent One")
    assert info.id == "agent-1"
    assert info.name == "Agent One"
    assert info.description == ""

    info2 = AgentInfo(id="agent-2", name="Agent Two", description="Custom description")
    assert info2.description == "Custom description"
    data = info2.model_dump()
    assert data["id"] == "agent-2"
    assert data["name"] == "Agent Two"
    assert data["description"] == "Custom description"


def test_limit_info_schema():
    from backend.schemas import LimitInfo

    limit = LimitInfo(limit=20, remaining=15, reset_at="00:00 HKT")
    assert limit.limit == 20
    assert limit.remaining == 15
    assert limit.reset_at == "00:00 HKT"
    data = limit.model_dump()
    assert data == {"limit": 20, "remaining": 15, "reset_at": "00:00 HKT"}

