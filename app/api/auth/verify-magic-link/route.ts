/**
 * @module app/api/auth/verify-magic-link/route
 * @description Next.js API route handler that validates magic link tokens from email authentication and creates user sessions
 *
 * PURPOSE:
 * - Extract and validate magic link token from URL query parameter
 * - Check token expiry, usage status, and existence in database with user relationship
 * - Create new user account with 'free' tier if token exists but user doesn't
 * - Mark token as used with timestamp and associated userId to prevent reuse
 * - Generate JWT session token and set HTTP-only cookie for authenticated session
 * - Redirect to homepage with success/error query parameters based on validation outcome
 *
 * DEPENDENCIES:
 * - @/lib/prisma - Provides Prisma client for querying magicLinkToken and user tables
 * - @/lib/auth - Provides createSessionToken for JWT generation and setSessionCookie for HTTP-only cookie setup
 *
 * EXPORTS:
 * - GET (function) - Async handler processing magic link verification via token query param and establishing user session
 *
 * PATTERNS:
 * - Accessed via GET request to /api/auth/verify-magic-link?token=<token_string>
 * - Returns 302 redirects to /?auth=success on valid token or /?auth=error&message=<error_type> on failure
 * - Token validation checks: existence, expiration via expiresAt comparison, and used boolean flag
 * - Auto-creates user with email from token and 'free' tier if user record doesn't exist
 * - Single-use tokens enforced by setting used=true and usedAt timestamp after successful verification
 *
 * CLAUDE NOTES:
 * - Token marked as used AFTER user creation to ensure database consistency if user creation fails
 * - Uses Prisma include to fetch user relationship in single query, avoiding N+1 problem
 * - All error paths redirect to homepage with distinguishable error messages in query params for user feedback
 * - Session cookie set before redirect so user is authenticated when homepage loads
 * - No rate limiting implemented - vulnerable to token enumeration attacks if tokens are predictable
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSessionToken, setSessionCookie } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/?auth=error&message=invalid-token', request.url));
    }

    // Find token in database
    const magicLinkToken = await prisma.magicLinkToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!magicLinkToken) {
      return NextResponse.redirect(new URL('/?auth=error&message=invalid-token', request.url));
    }

    // Check if token has expired
    if (magicLinkToken.expiresAt < new Date()) {
      return NextResponse.redirect(new URL('/?auth=error&message=expired-token', request.url));
    }

    // Check if token has already been used
    if (magicLinkToken.used) {
      return NextResponse.redirect(new URL('/?auth=error&message=token-used', request.url));
    }

    // Find or create user
    let user = magicLinkToken.user;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: magicLinkToken.email,
          tier: 'free',
        },
      });
    }

    // Mark token as used
    await prisma.magicLinkToken.update({
      where: { id: magicLinkToken.id },
      data: {
        used: true,
        usedAt: new Date(),
        userId: user.id,
      },
    });

    // Create session
    const sessionToken = createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
      tier: user.tier,
    });

    // Set cookie
    await setSessionCookie(sessionToken);

    // Redirect to homepage with success message
    return NextResponse.redirect(new URL('/?auth=success', request.url));
  } catch (error: any) {
    console.error('Error verifying magic link:', error);
    return NextResponse.redirect(new URL('/?auth=error&message=unknown', request.url));
  }
}
