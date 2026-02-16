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

  it('allows the first request', () => {
    const result = checkUnauthRateLimit(fingerprint);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
    expect(result.limit).toBe(20);
  });

  it('allows 20 requests then blocks the 21st', () => {
    for (let i = 0; i < 20; i++) {
      const result = checkUnauthRateLimit(fingerprint);
      expect(result.allowed).toBe(true);
    }
    const result = checkUnauthRateLimit(fingerprint);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('decrements remaining count on each request', () => {
    const r1 = checkUnauthRateLimit(fingerprint);
    expect(r1.remaining).toBe(19);
    const r2 = checkUnauthRateLimit(fingerprint);
    expect(r2.remaining).toBe(18);
  });
});

describe('checkAuthAIQuota', () => {
  let userId: string;
  beforeEach(() => {
    userId = `user-${Date.now()}-${Math.random()}`;
  });

  it('allows the first request', () => {
    const result = checkAuthAIQuota(userId);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
    expect(result.limit).toBe(100);
  });

  it('allows 100 requests then blocks the 101st', () => {
    for (let i = 0; i < 100; i++) {
      const result = checkAuthAIQuota(userId);
      expect(result.allowed).toBe(true);
    }
    const result = checkAuthAIQuota(userId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
