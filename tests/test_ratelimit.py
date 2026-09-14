import tempfile
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException

from backend.config import Settings
from backend.ratelimit import (
    normalize_ip,
    get_client_ip,
    check_and_increment,
    get_remaining,
    _get_db,
)
import backend.ratelimit as ratelimit_module


def test_normalize_ip_ipv4():
    assert normalize_ip("203.0.113.195") == "203.0.113.195"
    assert normalize_ip(" 127.0.0.1 ") == "127.0.0.1"


def test_normalize_ip_ipv6_64_mask():
    ip1 = "2400:cb00:2048:1::c629:d7a2"
    ip2 = "2400:cb00:2048:1:dead:beef:cafe:0001"
    ip_other_subnet = "2400:cb00:2048:2::1"

    # Both IPs within the same /64 must resolve to the exact same masked network address
    assert normalize_ip(ip1) == "2400:cb00:2048:1::"
    assert normalize_ip(ip2) == "2400:cb00:2048:1::"
    assert normalize_ip(ip1) == normalize_ip(ip2)

    # Different /64 prefix must resolve to a different network
    assert normalize_ip(ip1) != normalize_ip(ip_other_subnet)


def test_normalize_ip_unknown_or_invalid():
    assert normalize_ip("unknown") == "unknown"
    assert normalize_ip("") == "unknown"
    assert normalize_ip("not-an-ip") == "not-an-ip"


def test_get_client_ip_from_cloudflare_header():
    req = MagicMock()
    req.headers = {"CF-Connecting-IP": "2400:cb00:2048:1::abcd"}
    req.client.host = "10.0.0.1"

    ip = get_client_ip(req)
    # Should prefer CF-Connecting-IP and apply /64 mask
    assert ip == "2400:cb00:2048:1::"


def test_get_client_ip_fallback():
    req = MagicMock()
    req.headers = {}
    req.client.host = "192.168.1.100"

    ip = get_client_ip(req)
    assert ip == "192.168.1.100"


def test_check_and_increment_and_limits(monkeypatch, tmp_path):
    # Use temporary DB for test isolation
    db_file = tmp_path / "test_usage.db"
    monkeypatch.setattr(ratelimit_module, "_db_conn", None)
    monkeypatch.setattr(ratelimit_module.settings, "db_path", str(db_file))
    monkeypatch.setattr(ratelimit_module.settings, "daily_limit", 3)

    test_ip = "198.51.100.5"

    rem, limit = get_remaining(test_ip)
    assert limit == 3
    assert rem == 3

    # Request 1
    rem1 = check_and_increment(test_ip)
    assert rem1 == 2

    # Request 2
    rem2 = check_and_increment(test_ip)
    assert rem2 == 1

    # Request 3
    rem3 = check_and_increment(test_ip)
    assert rem3 == 0

    rem, limit = get_remaining(test_ip)
    assert rem == 0

    # Request 4 -> should raise 429
    with pytest.raises(HTTPException) as exc_info:
        check_and_increment(test_ip)

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["error"] == "daily_limit_reached"
    assert "00:00" in exc_info.value.detail["message"]


def test_get_client_ip_xff_when_trusted(monkeypatch):
    monkeypatch.setattr(ratelimit_module.settings, "trust_forwarded_for", True)

    # Single IP in XFF
    req = MagicMock()
    req.headers = {"X-Forwarded-For": "203.0.113.50"}
    req.client.host = "10.0.0.1"
    assert get_client_ip(req) == "203.0.113.50"

    # Multi-hop XFF: leftmost should be picked
    req.headers = {"X-Forwarded-For": "203.0.113.99, 10.0.0.1, 10.0.0.2"}
    assert get_client_ip(req) == "203.0.113.99"

    # IPv6 in XFF should also be normalized to /64
    req.headers = {"X-Forwarded-For": "2400:cb00:2048:1::5678, 10.0.0.1"}
    assert get_client_ip(req) == "2400:cb00:2048:1::"


def test_get_client_ip_xff_ignored_when_not_trusted(monkeypatch):
    monkeypatch.setattr(ratelimit_module.settings, "trust_forwarded_for", False)

    req = MagicMock()
    req.headers = {"X-Forwarded-For": "203.0.113.50"}
    req.client.host = "192.168.1.100"
    assert get_client_ip(req) == "192.168.1.100"


def test_get_client_ip_no_client():
    req = MagicMock()
    req.headers = {}
    req.client = None
    assert get_client_ip(req) == "unknown"


def test_today_timezone(monkeypatch):
    monkeypatch.setattr(ratelimit_module.settings, "rate_limit_tz", "UTC")
    d1 = ratelimit_module._today()
    assert len(d1) == 10
    assert d1.count("-") == 2


def test_db_creation_and_reconnection(monkeypatch, tmp_path):
    db_file = tmp_path / "test_init.db"
    monkeypatch.setattr(ratelimit_module, "_db_conn", None)
    monkeypatch.setattr(ratelimit_module.settings, "db_path", str(db_file))

    conn1 = _get_db()
    # Check table exists
    cursor = conn1.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='usage'")
    assert cursor.fetchone() is not None

    # Calling _get_db again should return the same connection object
    conn2 = _get_db()
    assert conn1 is conn2

