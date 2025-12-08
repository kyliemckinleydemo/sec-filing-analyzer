import { NextRequest } from 'next/server';
import crypto from 'crypto';

/**
 * Rate limiting system for unauthenticated and authenticated users
 *
 * Limits:
 * - Unauthenticated: 20 requests/day for non-AI endpoints
 * - Authenticated: 100 AI analyses/day
 *
 * Uses browser fingerprinting (IP + User-Agent + Accept-Language)
 */

interface RateLimitStore {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

// In-memory storage (in production, use Vercel KV or Redis)
const unauthStore = new Map<string, RateLimitStore>();
const authStore = new Map<string, RateLimitStore>();

/**
 * Generate a fingerprint from request headers
 * Combines IP, User-Agent, and Accept-Language for uniqueness
 */
export function generateFingerprint(request: NextRequest): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const userAgent = request.headers.get('user-agent') || '';
  const acceptLang = request.headers.get('accept-language') || '';

  const fingerprint = `${ip}|${userAgent}|${acceptLang}`;

  // Hash for privacy and storage efficiency
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
}

/**
 * Check if an unauthenticated user has exceeded their daily limit
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkUnauthRateLimit(fingerprint: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
} {
  const DAILY_LIMIT = 20;
  const now = Date.now();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const resetAt = endOfDay.getTime();

  const existing = unauthStore.get(fingerprint);

  if (!existing || now > existing.resetAt) {
    // New day or first request
    const newEntry: RateLimitStore = {
      count: 1,
      resetAt,
    };
    unauthStore.set(fingerprint, newEntry);
    return {
      allowed: true,
      remaining: DAILY_LIMIT - 1,
      resetAt,
      limit: DAILY_LIMIT,
    };
  }

  // Check if limit exceeded
  if (existing.count >= DAILY_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      limit: DAILY_LIMIT,
    };
  }

  // Increment count
  existing.count += 1;
  unauthStore.set(fingerprint, existing);

  return {
    allowed: true,
    remaining: DAILY_LIMIT - existing.count,
    resetAt: existing.resetAt,
    limit: DAILY_LIMIT,
  };
}

/**
 * Check if an authenticated user has exceeded their AI analysis quota
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkAuthAIQuota(userId: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
} {
  const DAILY_LIMIT = 100;
  const now = Date.now();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const resetAt = endOfDay.getTime();

  const existing = authStore.get(userId);

  if (!existing || now > existing.resetAt) {
    // New day or first request
    const newEntry: RateLimitStore = {
      count: 1,
      resetAt,
    };
    authStore.set(userId, newEntry);
    return {
      allowed: true,
      remaining: DAILY_LIMIT - 1,
      resetAt,
      limit: DAILY_LIMIT,
    };
  }

  // Check if limit exceeded
  if (existing.count >= DAILY_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      limit: DAILY_LIMIT,
    };
  }

  // Increment count
  existing.count += 1;
  authStore.set(userId, existing);

  return {
    allowed: true,
    remaining: DAILY_LIMIT - existing.count,
    resetAt: existing.resetAt,
    limit: DAILY_LIMIT,
  };
}

/**
 * Clean up expired entries periodically (run on server start or cron)
 */
export function cleanupExpiredEntries() {
  const now = Date.now();

  // Clean unauth store
  for (const [key, value] of unauthStore.entries()) {
    if (now > value.resetAt) {
      unauthStore.delete(key);
    }
  }

  // Clean auth store
  for (const [key, value] of authStore.entries()) {
    if (now > value.resetAt) {
      authStore.delete(key);
    }
  }
}

// Cleanup expired entries every hour
if (typeof window === 'undefined') {
  setInterval(cleanupExpiredEntries, 60 * 60 * 1000);
}
