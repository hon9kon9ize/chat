import { Container, getContainer } from "@cloudflare/containers";

// Defined before Env to break the circular reference.
// envVars are injected from the Worker env bindings in the constructor.
export class HKChatContainer extends Container {
  defaultPort = 8000;
  sleepAfter = "5m";
  requiredPorts = [8000];

  constructor(ctx: DurableObjectState<unknown>, env: Env) {
    super(ctx as DurableObjectState<{}>, env);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return getContainer(env.HKCHAT).fetch(request);
  },
};
