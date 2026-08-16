/**
 * @module lib/rate-limit
 * @description Daily rate limiting for unauthenticated requests (20/day) and authenticated AI
 * analyses (100/day), plus a magic-link send throttle. Backed by a durable REST Redis store
 * (Vercel KV / Upstash) when configured, so limits hold across serverless instances; falls back
 * to an in-memory Map when no store is configured (local dev / before KV is provisioned).
 *
 * EXPORTS (all counter checks are ASYNC — callers must await):
 * - generateFingerprint(request) -> sha256(ip|ua|accept-language) for anonymous identification
 * - checkUnauthRateLimit(fingerprint) -> { allowed, remaining, resetAt, limit }  (20/day)
 * - checkAuthAIQuota(userId) -> { allowed, remaining, resetAt, limit }  (100/day)
 * - checkMagicLinkThrottle(ip, email) -> { allowed, reason? }  (5/hr per email, 15/hr per ip)
 * - cleanupExpiredEntries() -> prunes the in-memory fallback store
 * - rateLimitBackend -> 'redis' | 'memory' (which store is active)
 *
 * CLAUDE NOTES:
 * - Provisioning: create a Vercel KV (or Upstash Redis) store and connect it to the project. It
 *   injects KV_REST_API_URL/KV_REST_API_TOKEN (Vercel) or UPSTASH_REDIS_REST_URL/_TOKEN (Upstash);
 *   both namings are supported. No env => in-memory fallback (per-instance, non-durable).
 * - Keys embed the date/hour, so windows reset naturally; a TTL backstops cleanup.
 */
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

// ---- Durable store (Vercel KV / Upstash) with graceful in-memory fallback ------------------
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;
export const rateLimitBackend: 'redis' | 'memory' = redis ? 'redis' : 'memory';

interface MemEntry { count: number; resetAt: number }
const mem = new Map<string, MemEntry>();

/**
 * Atomic increment of a windowed counter. Returns the post-increment count.
 * Redis path: INCR + set TTL on first hit. Memory path: Map with resetAt.
 */
async function incrWindow(key: string, ttlSeconds: number, resetAt: number): Promise<number> {
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, ttlSeconds);
      return count;
    } catch (e) {
      // Fail OPEN on store errors (don't block real users on a transient KV outage), but log.
      console.error('[rate-limit] redis error, allowing request:', e);
      return 1;
    }
  }
  const now = Date.now();
  const existing = mem.get(key);
  if (!existing || now > existing.resetAt) {
    mem.set(key, { count: 1, resetAt });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

function endOfDayMs(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
const dayStamp = () => new Date().toISOString().slice(0, 10);       // YYYY-MM-DD
const hourStamp = () => new Date().toISOString().slice(0, 13);      // YYYY-MM-DDTHH

/** SHA-256 fingerprint from IP + User-Agent + Accept-Language (privacy-preserving, stable). */
export function generateFingerprint(request: NextRequest): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const userAgent = request.headers.get('user-agent') || '';
  const acceptLang = request.headers.get('accept-language') || '';
  return crypto.createHash('sha256').update(`${ip}|${userAgent}|${acceptLang}`).digest('hex');
}

interface LimitResult { allowed: boolean; remaining: number; resetAt: number; limit: number }

/** Unauthenticated daily limit (20/day) for non-AI public endpoints. */
export async function checkUnauthRateLimit(fingerprint: string): Promise<LimitResult> {
  const limit = 20;
  const resetAt = endOfDayMs();
  const count = await incrWindow(`rl:unauth:${dayStamp()}:${fingerprint}`, 90000, resetAt);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt, limit };
}

/** Authenticated AI-analysis quota (100/day) per user. */
export async function checkAuthAIQuota(userId: string): Promise<LimitResult> {
  const limit = 100;
  const resetAt = endOfDayMs();
  const count = await incrWindow(`rl:ai:${dayStamp()}:${userId}`, 90000, resetAt);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt, limit };
}

/** Magic-link send throttle: 5/hour per email + 15/hour per IP (anti email-bomb / enumeration). */
export async function checkMagicLinkThrottle(
  ip: string,
  email: string
): Promise<{ allowed: boolean; reason?: 'email' | 'ip' }> {
  const resetAt = Date.now() + 3600_000;
  const emailKey = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  const emailCount = await incrWindow(`ml:email:${hourStamp()}:${emailKey}`, 3700, resetAt);
  if (emailCount > 5) return { allowed: false, reason: 'email' };
  const ipCount = await incrWindow(`ml:ip:${hourStamp()}:${ip}`, 3700, resetAt);
  if (ipCount > 15) return { allowed: false, reason: 'ip' };
  return { allowed: true };
}

/** Prune expired entries from the in-memory fallback store (no-op for the Redis backend). */
export function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, value] of mem.entries()) {
    if (now > value.resetAt) mem.delete(key);
  }
}

// Hourly cleanup of the in-memory fallback (only relevant when no Redis store is configured).
if (typeof window === 'undefined' && !redis) {
  setInterval(cleanupExpiredEntries, 60 * 60 * 1000);
}
