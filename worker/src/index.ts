import { Container } from "@cloudflare/containers";

export interface Env {
  HKCHAT: DurableObjectNamespace;
  // Secrets — set with: wrangler secret put <NAME>
  UPSTREAM_BASE_URL: string;
  UPSTREAM_API_KEY: string;
  MODEL_ID: string;
  // Vars — defined in wrangler.toml [vars]
  MAX_TOKENS: string;
  DAILY_LIMIT: string;
  RATE_LIMIT_TZ: string;
}

export class HKChatContainer extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "5m";
  requiredPorts = [8000];

  constructor(ctx: DurableObjectState<unknown>, env: Env) {
    super(ctx as DurableObjectState<{}>, env);
    // Inject secrets + config into the container process at startup.
    // CF-Connecting-IP is set by Cloudflare so TRUST_FORWARDED_FOR stays false.
    this.envVars = {
      UPSTREAM_BASE_URL: env.UPSTREAM_BASE_URL,
      UPSTREAM_API_KEY: env.UPSTREAM_API_KEY ?? "none",
      MODEL_ID: env.MODEL_ID,
      MAX_TOKENS: env.MAX_TOKENS ?? "8192",
      DAILY_LIMIT: env.DAILY_LIMIT ?? "20",
      RATE_LIMIT_TZ: env.RATE_LIMIT_TZ ?? "Asia/Hong_Kong",
      TRUST_FORWARDED_FOR: "false",
      DB_PATH: "/tmp/usage.db",
      AGENTS_DIR: "/app/agents",
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Single named instance so all requests share one SQLite rate-limit DB.
    const container = env.HKCHAT.getByName("main");
    return container.fetch(request);
  },
};
