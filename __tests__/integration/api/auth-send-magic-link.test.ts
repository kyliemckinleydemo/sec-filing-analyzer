import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../mocks/prisma';

vi.mock('@/lib/auth', () => ({
  generateMagicLinkToken: vi.fn().mockReturnValue('a'.repeat(64)),
}));

vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      emails = {
        send: vi.fn().mockResolvedValue({ id: 'email-123' }),
      };
    },
  };
});

import { POST } from '@/app/api/auth/send-magic-link/route';
import { NextRequest } from 'next/server';

function makeRequest(body: any) {
  return new NextRequest('http://localhost:3000/api/auth/send-magic-link', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/auth/send-magic-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid email with 400', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it('rejects missing email with 400', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('creates token in DB and returns success for valid email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.magicLinkToken.create.mockResolvedValue({ id: 'token-1' });

    const res = await POST(makeRequest({ email: 'test@example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(prismaMock.magicLinkToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'test@example.com',
          token: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      })
    );
  });

  it('normalizes email to lowercase', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.magicLinkToken.create.mockResolvedValue({ id: 'token-1' });

    await POST(makeRequest({ email: 'Test@EXAMPLE.COM' }));

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'test@example.com' },
      })
    );

    expect(prismaMock.magicLinkToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'test@example.com',
        }),
      })
    );
  });
});
