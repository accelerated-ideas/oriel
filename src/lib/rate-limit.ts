import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Window = `${number} s` | `${number} m`;

const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const limiters = new Map<string, Ratelimit>();
const memory = new Map<string, number[]>();

function windowMs(window: Window) {
  const [value, unit] = window.split(" ");
  return Number(value) * (unit === "m" ? 60_000 : 1000);
}

// Sliding-window limit. Uses Upstash when configured, otherwise per-instance memory.
export async function rateLimit(identifier: string, limit: number, window: Window) {
  if (upstash) {
    const key = `${limit}:${window}`;
    let limiter = limiters.get(key);
    if (!limiter) {
      limiter = new Ratelimit({ redis: upstash, limiter: Ratelimit.slidingWindow(limit, window), prefix: "rl" });
      limiters.set(key, limiter);
    }
    const { success } = await limiter.limit(identifier);
    return success;
  }

  const now = Date.now();
  const span = windowMs(window);
  const hits = (memory.get(identifier) ?? []).filter((time) => now - time < span);
  if (hits.length >= limit) {
    memory.set(identifier, hits);
    return false;
  }
  hits.push(now);
  memory.set(identifier, hits);
  if (memory.size > 10_000) memory.clear();
  return true;
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
