/**
 * @module rate-limit.test
 * @description Unit tests for rate limiting and quota management functionality
 * 
 * PURPOSE:
 * Tests the rate limiting mechanisms that protect API endpoints from abuse by:
 * - Validating fingerprint generation from request headers (IP, user-agent, etc.)
 * - Verifying unauthenticated request rate limits (20 requests per window)
 * - Verifying authenticated user AI quota limits (100 requests per window)
 * - Ensuring proper request counting, remaining quota tracking, and blocking behavior
 * 
 * EXPORTS:
 * - N/A (test suite only)
 * 
 * CLAUDE NOTES:
 * - Uses Vitest testing framework with describe/it/expect/beforeEach
 * - Tests generateFingerprint for deterministic SHA-256 hex output and collision resistance
 * - Tests checkUnauthRateLimit with unique fingerprints per test to avoid state pollution
 * - Tests checkAuthAIQuota with unique user IDs per test for isolation
 * - Validates both allow/block behavior and accurate remaining count decrements
 * - Rate limits: 20/window for unauth, 100/window for auth AI requests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateFingerprint,
  checkUnauthRateLimit,
  checkAuthAIQuota,
} from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  return new NextRequest('http://localhost:3000/api/test', { headers: h });
}

describe('generateFingerprint', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const req = makeRequest({
      'x-forwarded-for': '1.2.3.4',
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'en-US',
    });
    const fp = generateFingerprint(req);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same fingerprint for identical headers', () => {
    const headers = {
      'x-forwarded-for': '1.2.3.4',
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'en-US',
    };
    const fp1 = generateFingerprint(makeRequest(headers));
    const fp2 = generateFingerprint(makeRequest(headers));
    expect(fp1).toBe(fp2);
  });

  it('produces different fingerprints for different IPs', () => {
    const fp1 = generateFingerprint(makeRequest({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'Bot' }));
    const fp2 = generateFingerprint(makeRequest({ 'x-forwarded-for': '5.6.7.8', 'user-agent': 'Bot' }));
    expect(fp1).not.toBe(fp2);
  });
});

describe('checkUnauthRateLimit', () => {
  // Use a unique fingerprint per test to avoid cross-test contamination
  let fingerprint: string;
  beforeEach(() => {
    fingerprint = `test-fp-${Date.now()}-${Math.random()}`;
  });

  it('allows the first request', async () => {
    const result = await checkUnauthRateLimit(fingerprint);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
    expect(result.limit).toBe(20);
  });

  it('allows 20 requests then blocks the 21st', async () => {
    for (let i = 0; i < 20; i++) {
      const result = await checkUnauthRateLimit(fingerprint);
      expect(result.allowed).toBe(true);
    }
    const result = await checkUnauthRateLimit(fingerprint);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('decrements remaining count on each request', async () => {
    const r1 = await checkUnauthRateLimit(fingerprint);
    expect(r1.remaining).toBe(19);
    const r2 = await checkUnauthRateLimit(fingerprint);
    expect(r2.remaining).toBe(18);
  });
});

describe('checkAuthAIQuota', () => {
  let userId: string;
  beforeEach(() => {
    userId = `user-${Date.now()}-${Math.random()}`;
  });

  it('allows the first request', async () => {
    const result = await checkAuthAIQuota(userId);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
    expect(result.limit).toBe(100);
  });

  it('allows 100 requests then blocks the 101st', async () => {
    for (let i = 0; i < 100; i++) {
      const result = await checkAuthAIQuota(userId);
      expect(result.allowed).toBe(true);
    }
    const result = await checkAuthAIQuota(userId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
