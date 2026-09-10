import sqlite3
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Request, HTTPException

from .config import settings

_lock = threading.Lock()
_db_conn: sqlite3.Connection | None = None


def _get_db() -> sqlite3.Connection:
    global _db_conn
    if _db_conn is None:
        conn = sqlite3.connect(settings.db_path, check_same_thread=False)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usage (
                ip   TEXT NOT NULL,
                day  TEXT NOT NULL,
                cnt  INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (ip, day)
            )
        """)
        conn.commit()
        _db_conn = conn
    return _db_conn


def _today() -> str:
    return datetime.now(ZoneInfo(settings.rate_limit_tz)).strftime("%Y-%m-%d")


def get_client_ip(request: Request) -> str:
    # Cloudflare sets this with the real visitor IP — prefer it.
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()

    if settings.trust_forwarded_for:
        xff = request.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()

    return request.client.host if request.client else "unknown"


def check_and_increment(ip: str) -> int:
    """Increment the counter; return remaining quota. Raises HTTP 429 if exhausted."""
    day = _today()
    limit = settings.daily_limit

    with _lock:
        db = _get_db()
        row = db.execute(
            "SELECT cnt FROM usage WHERE ip=? AND day=?", (ip, day)
        ).fetchone()
        count = row[0] if row else 0

        if count >= limit:
            raise HTTPException(
                status_code=429,
                detail={"error": "daily_limit_reached", "limit": limit},
                headers={
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": "86400",
                    "Content-Type": "application/json",
                },
            )

        db.execute(
            "INSERT INTO usage (ip, day, cnt) VALUES (?, ?, 1) "
            "ON CONFLICT(ip, day) DO UPDATE SET cnt = cnt + 1",
            (ip, day),
        )
        db.commit()
        return limit - (count + 1)


def get_remaining(ip: str) -> tuple[int, int]:
    """Return (remaining, limit) without incrementing."""
    day = _today()
    limit = settings.daily_limit
    with _lock:
        db = _get_db()
        row = db.execute(
            "SELECT cnt FROM usage WHERE ip=? AND day=?", (ip, day)
        ).fetchone()
        count = row[0] if row else 0
        return max(0, limit - count), limit
