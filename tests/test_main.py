from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from backend.main import app
import backend.ratelimit as ratelimit_module


@pytest.fixture
def isolated_client(tmp_path, monkeypatch):
    # Set up an isolated SQLite database for rate limiting
    db_file = tmp_path / "test_main_usage.db"
    monkeypatch.setattr(ratelimit_module, "_db_conn", None)
    monkeypatch.setattr(ratelimit_module.settings, "db_path", str(db_file))
    monkeypatch.setattr(ratelimit_module.settings, "daily_limit", 5)

    with TestClient(app) as client:
        yield client


def test_healthz_endpoint(isolated_client):
    response = isolated_client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "default" in data["agents"]


def test_list_agents_endpoint(isolated_client):
    response = isolated_client.get("/api/agents")
    assert response.status_code == 200
    agents = response.json()
    assert isinstance(agents, list)
    assert any(a["id"] == "default" for a in agents)
    default_agent = next(a for a in agents if a["id"] == "default")
    assert "name" in default_agent
    assert "description" in default_agent


def test_limit_info_endpoint(isolated_client):
    response = isolated_client.get(
        "/api/limit",
        headers={"CF-Connecting-IP": "203.0.113.10"},
    )
    assert response.status_code == 200
    assert response.headers.get("x-ratelimit-limit") == "5"
    assert response.headers.get("x-ratelimit-remaining") == "5"
    data = response.json()
    assert data["limit"] == 5
    assert data["remaining"] == 5
    assert data["reset_at"] == "00:00 HKT"


def test_ping_endpoint_success(isolated_client):
    headers = {"CF-Connecting-IP": "203.0.113.77"}

    # Test GET /api/ping
    res1 = isolated_client.get("/api/ping", headers=headers)
    assert res1.status_code == 200
    assert res1.headers.get("x-ratelimit-limit") == "5"
    assert res1.headers.get("x-ratelimit-remaining") == "4"
    assert res1.json() == {"status": "pong", "remaining": 4}

    # Test POST /api/ping
    res2 = isolated_client.post("/api/ping", headers=headers)
    assert res2.status_code == 200
    assert res2.headers.get("x-ratelimit-remaining") == "3"
    assert res2.json() == {"status": "pong", "remaining": 3}


def test_ping_endpoint_50_times_rate_limit(isolated_client, monkeypatch):
    # Set daily_limit to 50
    monkeypatch.setattr(ratelimit_module.settings, "daily_limit", 50)
    headers = {"CF-Connecting-IP": "198.51.100.99"}

    # Make 50 requests to /api/ping
    for i in range(50):
        res = isolated_client.get("/api/ping", headers=headers)
        assert res.status_code == 200
        expected_remaining = 50 - (i + 1)
        assert res.headers.get("x-ratelimit-remaining") == str(expected_remaining)
        assert res.json() == {"status": "pong", "remaining": expected_remaining}

    # Verify /api/limit reports 0 remaining
    limit_res = isolated_client.get("/api/limit", headers=headers)
    assert limit_res.status_code == 200
    assert limit_res.json()["remaining"] == 0

    # 51st request must return HTTP 429
    res51 = isolated_client.get("/api/ping", headers=headers)
    assert res51.status_code == 429
    assert res51.headers.get("x-ratelimit-remaining") == "0"
    data = res51.json()
    assert data["detail"]["error"] == "daily_limit_reached"
    assert data["detail"]["limit"] == 50



def test_chat_unknown_agent(isolated_client):
    response = isolated_client.post(
        "/api/chat",
        json={
            "agent": "unknown_agent_id",
            "messages": [{"role": "user", "content": "hello"}],
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "unknown_agent"


def test_chat_validation_error_empty_messages(isolated_client):
    response = isolated_client.post(
        "/api/chat",
        json={
            "agent": "default",
            "messages": [],
        },
    )
    assert response.status_code == 422


def test_chat_validation_error_too_many_messages(isolated_client):
    too_many = [{"role": "user", "content": f"msg {i}"} for i in range(31)]
    response = isolated_client.post(
        "/api/chat",
        json={
            "agent": "default",
            "messages": too_many,
        },
    )
    assert response.status_code == 422


def test_chat_rate_limit_exceeded(isolated_client, monkeypatch):
    monkeypatch.setattr(ratelimit_module.settings, "daily_limit", 2)
    headers = {"CF-Connecting-IP": "198.51.100.22"}

    async def fake_stream(msgs):
        yield {"data": "ok"}

    mock_agent = MagicMock()
    mock_agent.stream_async = fake_stream

    with patch("backend.main.build_agent", return_value=mock_agent):
        # 1st request
        r1 = isolated_client.post(
            "/api/chat",
            json={"agent": "default", "messages": [{"role": "user", "content": "1"}]},
            headers=headers,
        )
        assert r1.status_code == 200

        # 2nd request
        r2 = isolated_client.post(
            "/api/chat",
            json={"agent": "default", "messages": [{"role": "user", "content": "2"}]},
            headers=headers,
        )
        assert r2.status_code == 200

        # 3rd request -> rate limit exceeded (HTTP 429)
        r3 = isolated_client.post(
            "/api/chat",
            json={"agent": "default", "messages": [{"role": "user", "content": "3"}]},
            headers=headers,
        )
        assert r3.status_code == 429
        data = r3.json()
        assert data["detail"]["error"] == "daily_limit_reached"


def test_chat_successful_streaming(isolated_client):
    async def fake_stream(msgs):
        yield {"data": "你好！"}
        yield {"data": "有咩可以幫到你？"}

    mock_agent = MagicMock()
    mock_agent.stream_async = fake_stream

    headers = {"CF-Connecting-IP": "203.0.113.88"}

    with patch("backend.main.build_agent", return_value=mock_agent):
        response = isolated_client.post(
            "/api/chat",
            json={
                "agent": "default",
                "messages": [{"role": "user", "content": "哈囉"}],
            },
            headers=headers,
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        assert response.headers.get("x-ratelimit-limit") == "5"
        assert response.headers.get("x-ratelimit-remaining") == "4"

        lines = response.text.split("\n\n")
        assert 'data: {"type": "delta", "text": "你好！"}' in lines
        assert 'data: {"type": "delta", "text": "有咩可以幫到你？"}' in lines
        assert 'data: {"type": "done"}' in lines


def test_chat_streaming_max_tokens_reached(isolated_client):
    class MaxTokensReachedException(Exception):
        pass

    async def fake_stream_max_tokens(msgs):
        yield {"data": "長篇大論未講完..."}
        raise MaxTokensReachedException("length")

    mock_agent = MagicMock()
    mock_agent.stream_async = fake_stream_max_tokens

    with patch("backend.main.build_agent", return_value=mock_agent):
        response = isolated_client.post(
            "/api/chat",
            json={
                "agent": "default",
                "messages": [{"role": "user", "content": "講故事"}],
            },
        )
        assert response.status_code == 200
        lines = response.text.split("\n\n")
        assert 'data: {"type": "delta", "text": "長篇大論未講完..."}' in lines
        assert 'data: {"type": "done"}' in lines


def test_chat_streaming_general_error(isolated_client):
    async def fake_stream_error(msgs):
        yield {"data": "正在開始..."}
        raise RuntimeError("Network disconnected")

    mock_agent = MagicMock()
    mock_agent.stream_async = fake_stream_error

    with patch("backend.main.build_agent", return_value=mock_agent):
        response = isolated_client.post(
            "/api/chat",
            json={
                "agent": "default",
                "messages": [{"role": "user", "content": "問題"}],
            },
        )
        assert response.status_code == 200
        lines = response.text.split("\n\n")
        assert 'data: {"type": "delta", "text": "正在開始..."}' in lines
        assert any('"type": "error"' in line for line in lines)

