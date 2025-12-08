import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SESSION_COOKIE_NAME = 'stockhuntr_session';

export interface SessionData {
  userId: string;
  email: string;
  name?: string;
  tier: string;
}

/**
 * Create a JWT token for the user session
 */
export function createSessionToken(data: SessionData): string {
  return jwt.sign(data, JWT_SECRET, {
    expiresIn: '30d', // 30 days
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifySessionToken(token: string): SessionData | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionData;
  } catch (error) {
    return null;
  }
}

/**
 * Set session cookie
 */
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
}

/**
 * Get session from cookie
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

/**
 * Clear session cookie
 */
export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Generate a random token for magic links
 */
export function generateMagicLinkToken(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}
