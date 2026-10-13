const redisConfig = () => ({
  url: (process.env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/$/, ""),
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
});

export function sharedRedisConfigured(): boolean {
  const { url, token } = redisConfig();
  return Boolean(url && token);
}

export async function redisCommand<T = unknown>(command: unknown[]): Promise<T> {
  const { url, token } = redisConfig();
  if (!url || !token) throw new Error("Shared Redis is not configured.");
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:") throw new Error("Shared Redis REST URL must use HTTPS.");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Shared Redis request failed with status ${response.status}.`);
  const payload = await response.json() as { result?: T; error?: string };
  if (payload.error) throw new Error("Shared Redis command failed.");
  return payload.result as T;
}

export type QuotaResult = { count: number; resetMs: number };

const QUOTA_SCRIPT = "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; local ttl = redis.call('PTTL', KEYS[1]); return {count, ttl}";

export async function consumeDistributedQuota(key: string, windowMs: number): Promise<QuotaResult> {
  const result = await redisCommand<[number, number]>(["EVAL", QUOTA_SCRIPT, "1", key, String(windowMs)]);
  if (!Array.isArray(result) || result.length !== 2 || !Number.isFinite(Number(result[0])) || !Number.isFinite(Number(result[1]))) {
    throw new Error("Shared Redis returned an invalid quota response.");
  }
  return { count: Number(result[0]), resetMs: Math.max(0, Number(result[1])) };
}

const AUDIT_SCRIPT = "redis.call('LPUSH', KEYS[1], ARGV[1]); redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1); redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3])); return 1";

export async function persistOperationalEvent(event: Record<string, unknown>): Promise<void> {
  if (!sharedRedisConfigured()) return;
  await redisCommand(["EVAL", AUDIT_SCRIPT, "1", "aose:ops:audit:v1", JSON.stringify(event), "5000", String(30 * 24 * 60 * 60)]);
}
