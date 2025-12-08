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
