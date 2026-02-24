/**
 * @module lib/auth
 * @description JWT-based session management module handling token creation, verification, and secure cookie operations for user authentication in Next.js
 *
 * PURPOSE:
 * - Create signed JWT tokens containing user session data with 30-day expiration
 * - Verify JWT signatures and decode session payloads using JWT_SECRET environment variable
 * - Manage httpOnly session cookies with secure settings for production environments
 * - Generate cryptographically secure 64-character hex tokens for magic link authentication
 *
 * DEPENDENCIES:
 * - jsonwebtoken - Signs and verifies JWT tokens with HS256 algorithm
 * - next/headers - Provides async cookies() API for server-side cookie operations
 * - crypto (Node.js built-in) - Generates random bytes for magic link tokens
 *
 * EXPORTS:
 * - SessionData (interface) - Shape containing userId, email, optional name, and tier string for JWT payload
 * - createSessionToken (function) - Returns signed JWT string from SessionData with 30-day expiration
 * - verifySessionToken (function) - Returns decoded SessionData or null if token invalid/expired
 * - setSessionCookie (function) - Async function setting httpOnly cookie with 30-day maxAge and sameSite lax
 * - getSession (function) - Async function returning SessionData from cookie or null if missing/invalid
 * - clearSessionCookie (function) - Async function deleting session cookie from browser
 * - generateMagicLinkToken (function) - Returns 64-character random hex string for one-time login links
 *
 * PATTERNS:
 * - After login: call createSessionToken(userData), then await setSessionCookie(token) to establish session
 * - In server components/actions: await getSession() returns SessionData or null for authentication checks
 * - On logout: await clearSessionCookie() to remove session and redirect to login
 * - For passwordless auth: generateMagicLinkToken() creates unique token to store with user email and expiration
 *
 * CLAUDE NOTES:
 * - JWT_SECRET defaults to unsafe fallback string - must set environment variable in production or tokens can be forged
 * - Cookie settings automatically adjust secure flag based on NODE_ENV, but sameSite 'lax' allows CSRF in some cross-site scenarios
 * - verifySessionToken silently returns null on any error including expiration - no distinction between expired vs tampered tokens
 * - Magic link tokens use crypto.randomBytes which is cryptographically secure but requires() inline rather than import for Node.js compatibility
 */
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
