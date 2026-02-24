/**
 * @module lib/api-middleware
 * @description Next.js API middleware enforcing tiered rate limiting: 20 requests/day for anonymous users, 100 AI analyses/day for authenticated users, with localhost bypass for development
 *
 * PURPOSE:
 * - Gates non-AI endpoints with 20/day limit for unauthenticated users while bypassing authenticated users completely
 * - Enforces strict authentication requirement and 100/day quota for AI-powered analysis endpoints
 * - Returns structured 429 responses with quota details, reset timestamps, and upgrade prompts when limits exceeded
 * - Injects X-RateLimit-* headers into responses showing limit, remaining count, and Unix timestamp for reset
 *
 * DEPENDENCIES:
 * - ./auth - Provides getSession() to retrieve current user session with userId for quota tracking
 * - ./rate-limit - Supplies generateFingerprint() for device identification, checkUnauthRateLimit() for anonymous user tracking, and checkAuthAIQuota() for per-user AI usage enforcement
 * - next/server - NextRequest/NextResponse types for middleware request/response handling
 *
 * EXPORTS:
 * - requireUnauthRateLimit (function) - Returns { allowed, response?, session } after checking if unauthenticated user has exceeded 20 requests/day, returns 429 with upgrade CTA if blocked
 * - requireAuthAndAIQuota (function) - Returns { allowed, response?, session } requiring authentication and enforcing 100 AI analyses/day, returns 401 if unauthenticated or 429 if quota exhausted
 * - addRateLimitHeaders (function) - Mutates NextResponse by setting X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset headers from provided numeric values
 *
 * PATTERNS:
 * - In non-AI route handlers: `const check = await requireUnauthRateLimit(request); if (!check.allowed) return check.response;`
 * - In AI-powered endpoints: `const check = await requireAuthAndAIQuota(request); if (!check.allowed) return check.response; // check.session guaranteed non-null`
 * - After successful operation: `return addRateLimitHeaders(NextResponse.json(data), limit, remaining, resetAt);`
 * - Localhost/127.0.0.1 requests bypass all rate limiting for backfill scripts and local development
 *
 * CLAUDE NOTES:
 * - Authenticated users face ZERO rate limiting on non-AI endpoints but strict 100/day quota on AI endpoints - encourages signup while protecting expensive operations
 * - Error responses include requiresAuth flag and marketing copy ('Sign up for free to get 100 AI analyses') to drive conversion
 * - Uses device fingerprinting for anonymous users but userId for authenticated - switches tracking strategy based on session presence
 * - Localhost bypass applies only to requireUnauthRateLimit, not requireAuthAndAIQuota - AI endpoints always enforce authentication even in development
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './auth';
import {
  generateFingerprint,
  checkUnauthRateLimit,
  checkAuthAIQuota,
} from './rate-limit';

/**
 * Middleware for non-AI endpoints
 * - If authenticated: Allow (no rate limit)
 * - If unauthenticated: Apply 20 requests/day limit
 */
export async function requireUnauthRateLimit(request: NextRequest): Promise<{
  allowed: boolean;
  response?: NextResponse;
  session: any;
}> {
  const session = await getSession();

  // Localhost bypass for backfill scripts
  const host = request.headers.get('host') || '';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return { allowed: true, session };
  }

  // Authenticated users bypass rate limits for non-AI endpoints
  if (session) {
    return { allowed: true, session };
  }

  // Unauthenticated users: check rate limit
  const fingerprint = generateFingerprint(request);
  const rateLimit = checkUnauthRateLimit(fingerprint);

  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetAt);
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'Daily limit reached',
          message: `You've reached your daily limit of ${rateLimit.limit} requests. Sign up for free to get 100 AI analyses per day!`,
          limit: rateLimit.limit,
          remaining: 0,
          resetAt: resetDate.toISOString(),
          requiresAuth: true,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimit.resetAt),
          },
        }
      ),
      session: null,
    };
  }

  // Add rate limit headers to successful response
  return {
    allowed: true,
    session: null,
  };
}

/**
 * Middleware for AI endpoints
 * - Requires authentication
 * - Applies 100 AI analyses/day quota
 */
export async function requireAuthAndAIQuota(request: NextRequest): Promise<{
  allowed: boolean;
  response?: NextResponse;
  session: any;
}> {
  const session = await getSession();

  // Must be authenticated for AI endpoints
  if (!session) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'Authentication required',
          message: 'Sign up for free to access AI-powered filing analysis. Get 100 analyses per day!',
          requiresAuth: true,
        },
        { status: 401 }
      ),
      session: null,
    };
  }

  // Check AI quota
  const quota = checkAuthAIQuota(session.userId);

  if (!quota.allowed) {
    const resetDate = new Date(quota.resetAt);
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'Daily quota exceeded',
          message: `You've used all ${quota.limit} AI analyses for today. Resets at midnight.`,
          limit: quota.limit,
          remaining: 0,
          resetAt: resetDate.toISOString(),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(quota.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(quota.resetAt),
          },
        }
      ),
      session,
    };
  }

  return {
    allowed: true,
    session,
  };
}

/**
 * Add rate limit headers to a response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  limit: number,
  remaining: number,
  resetAt: number
): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-RateLimit-Reset', String(resetAt));
  return response;
}
