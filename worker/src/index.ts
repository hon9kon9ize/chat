import { Container, getContainer } from "@cloudflare/containers";

// Defined before Env to break the circular reference.
// envVars are injected from the Worker env bindings in the constructor.
export class HKChatContainer extends Container {
  defaultPort = 8000;
  sleepAfter = "5m";
  requiredPorts = [8000];

  constructor(ctx: DurableObjectState<unknown>, env: Env) {
    const envVars = {
      UPSTREAM_BASE_URL: env.UPSTREAM_BASE_URL,
      UPSTREAM_API_KEY: env.UPSTREAM_API_KEY ?? "none",
      MODEL_ID: env.MODEL_ID,
      MAX_TOKENS: env.MAX_TOKENS ?? "8192",
      DAILY_LIMIT: env.DAILY_LIMIT ?? "50",
      RATE_LIMIT_TZ: env.RATE_LIMIT_TZ ?? "Asia/Hong_Kong",
      TRUST_FORWARDED_FOR: "false",
      DB_PATH: "/tmp/usage.db",
      AGENTS_DIR: "/app/agents",
    };
    super(ctx as DurableObjectState<{}>, env, {
      defaultPort: 8000,
      sleepAfter: "5m",
      envVars,
    });
    this.defaultPort = 8000;
    this.requiredPorts = [8000];
    this.sleepAfter = "5m";
    this.envVars = envVars;

    // Initialize persistent rate limit table in Durable Object SQLite
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ip_usage (
        ip   TEXT NOT NULL,
        day  TEXT NOT NULL,
        cnt  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (ip, day)
      )
    `);
  }

  checkRateLimit(ip: string, limit: number, day: string): { allowed: boolean; remaining: number; count: number } {
    const rows = [...this.ctx.storage.sql.exec(
      "SELECT cnt FROM ip_usage WHERE ip = ? AND day = ?",
      ip,
      day
    )];
    const count = rows.length > 0 ? (rows[0].cnt as number) : 0;
    if (count >= limit) {
      return { allowed: false, remaining: 0, count };
    }
    const newCount = count + 1;
    this.ctx.storage.sql.exec(
      `INSERT INTO ip_usage (ip, day, cnt) VALUES (?, ?, 1)
       ON CONFLICT(ip, day) DO UPDATE SET cnt = cnt + 1`,
      ip,
      day
    );
    return { allowed: true, remaining: Math.max(0, limit - newCount), count: newCount };
  }

  getRateLimit(ip: string, limit: number, day: string): { remaining: number; limit: number } {
    const rows = [...this.ctx.storage.sql.exec(
      "SELECT cnt FROM ip_usage WHERE ip = ? AND day = ?",
      ip,
      day
    )];
    const count = rows.length > 0 ? (rows[0].cnt as number) : 0;
    return { remaining: Math.max(0, limit - count), limit };
  }
}

export interface Env {
  HKCHAT: DurableObjectNamespace<HKChatContainer>;
  // Secrets — set with: wrangler secret put <NAME>
  UPSTREAM_BASE_URL: string;
  UPSTREAM_API_KEY: string;
  MODEL_ID: string;
  // Vars — defined in wrangler.toml [vars]
  MAX_TOKENS: string;
  DAILY_LIMIT: string;
  RATE_LIMIT_TZ: string;
}

function normalizeIp(rawIp: string): string {
  if (!rawIp || rawIp === "unknown") return "unknown";
  const trimmed = rawIp.trim();
  // Check if IPv6 (contains colons)
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    // Take the first 4 hextets to represent the /64 prefix
    const prefix = parts.slice(0, 4).join(":");
    return `${prefix}::/64`;
  }
  return trimmed;
}

function getToday(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const limit = parseInt(env.DAILY_LIMIT ?? "50", 10);
      const tz = env.RATE_LIMIT_TZ ?? "Asia/Hong_Kong";
      const day = getToday(tz);

      const rawIp = request.headers.get("CF-Connecting-IP") || "unknown";
      const ip = normalizeIp(rawIp);

      const containerStub = getContainer(env.HKCHAT);

      if (url.pathname === "/api/limit" && request.method === "GET") {
        const info = await containerStub.getRateLimit(ip, limit, day);
        return new Response(
          JSON.stringify({
            limit: info.limit,
            remaining: info.remaining,
            reset_at: "00:00 HKT",
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "X-RateLimit-Limit": String(info.limit),
              "X-RateLimit-Remaining": String(info.remaining),
            },
          }
        );
      }

      if (url.pathname === "/api/chat" && request.method === "POST") {
        const check = await containerStub.checkRateLimit(ip, limit, day);
        if (!check.allowed) {
          return new Response(
            JSON.stringify({
              detail: {
                error: "daily_limit_reached",
                limit,
                message: "今日嘅使用額度已用完，請聽日再試（額度於每日 00:00 重設）。",
              },
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "X-RateLimit-Limit": String(limit),
                "X-RateLimit-Remaining": "0",
                "Retry-After": "86400",
              },
            }
          );
        }

        const res = await containerStub.fetch(request);
        const headers = new Headers(res.headers);
        headers.set("X-RateLimit-Limit", String(limit));
        headers.set("X-RateLimit-Remaining", String(check.remaining));
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      }

      return await containerStub.fetch(request);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      console.error("hkchat worker error:", msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
