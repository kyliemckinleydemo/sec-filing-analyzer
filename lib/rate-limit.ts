/**
 * @module lib/rate-limit
 * @description Implements daily rate limiting for unauthenticated requests (20/day) and authenticated AI analyses (100/day) using browser fingerprinting and in-memory storage with midnight UTC reset
 *
 * PURPOSE:
 * - Generate SHA-256 hashed fingerprints from IP, User-Agent, and Accept-Language headers for anonymous user tracking
 * - Enforce 20 requests per day limit for unauthenticated users using fingerprint-based identification
 * - Enforce 100 AI analyses per day quota for authenticated users tracked by userId
 * - Automatically reset counters at end of day (23:59:59.999) and cleanup expired entries hourly
 *
 * DEPENDENCIES:
 * - next/server - Provides NextRequest type for accessing HTTP headers in middleware and API routes
 * - crypto - Uses createHash for SHA-256 fingerprint generation from concatenated header values
 *
 * EXPORTS:
 * - generateFingerprint (function) - Returns SHA-256 hash of IP, User-Agent, and Accept-Language headers for anonymous user identification
 * - checkUnauthRateLimit (function) - Returns { allowed, remaining, resetAt, limit } object after checking/incrementing unauthenticated user's daily request count
 * - checkAuthAIQuota (function) - Returns { allowed, remaining, resetAt, limit } object after checking/incrementing authenticated user's AI analysis quota
 * - cleanupExpiredEntries (function) - Removes entries from both stores where current time exceeds resetAt timestamp
 *
 * PATTERNS:
 * - Call generateFingerprint(request) in middleware, then checkUnauthRateLimit(fingerprint) before processing public API requests
 * - For authenticated AI routes: extract userId from JWT/session, call checkAuthAIQuota(userId), return 429 if allowed=false
 * - Check response.allowed before processing; use response.remaining and response.resetAt for X-RateLimit-* headers
 * - Run cleanupExpiredEntries() manually on server initialization if needed, or rely on automatic hourly cleanup
 *
 * CLAUDE NOTES:
 * - Uses in-memory Map storage - data lost on server restart; production needs Vercel KV or Redis for persistence across serverless function instances
 * - Reset time calculated as end of current day (23:59:59.999) means limits reset at midnight local server time, not per-user timezone
 * - Fingerprinting combines 3 headers but IP from x-forwarded-for can be spoofed; consider adding more entropy or moving to proper session tokens
 * - Automatic cleanup runs every hour only in server context (typeof window check) but won't run in serverless environments without persistent process
 */
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
