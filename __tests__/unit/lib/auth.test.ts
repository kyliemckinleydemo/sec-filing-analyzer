import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken, generateMagicLinkToken } from '@/lib/auth';

describe('createSessionToken + verifySessionToken', () => {
  const sessionData = {
    userId: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    tier: 'free',
  };

  it('round-trips session data correctly', () => {
    const token = createSessionToken(sessionData);
    const decoded = verifySessionToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(sessionData.userId);
    expect(decoded!.email).toBe(sessionData.email);
    expect(decoded!.name).toBe(sessionData.name);
    expect(decoded!.tier).toBe(sessionData.tier);
  });

  it('returns null for an invalid token', () => {
    const decoded = verifySessionToken('not-a-valid-jwt-token');
    expect(decoded).toBeNull();
  });

  it('returns null for a tampered token', () => {
    const token = createSessionToken(sessionData);
    // Tamper with the payload portion (middle segment)
    const parts = token.split('.');
    parts[1] = parts[1] + 'tampered';
    const tamperedToken = parts.join('.');
    const decoded = verifySessionToken(tamperedToken);
    expect(decoded).toBeNull();
  });

  it('returns a string token', () => {
    const token = createSessionToken(sessionData);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
  });
});

describe('generateMagicLinkToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateMagicLinkToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique tokens on each call', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateMagicLinkToken()));
    expect(tokens.size).toBe(10);
  });
});
