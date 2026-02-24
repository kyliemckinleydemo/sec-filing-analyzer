/**
 * @module app/api/auth/me/route
 * @description Next.js API route handler that retrieves and returns the currently authenticated user's profile data from the database
 *
 * PURPOSE:
 * - Validates session cookie using getSession() from auth library
 * - Queries database for user profile fields (id, email, name, tier, createdAt) matching session userId
 * - Returns JSON response with user object or null if unauthenticated/not found
 *
 * DEPENDENCIES:
 * - @/lib/auth - Provides getSession() function to extract userId from HTTP-only session cookie
 * - @/lib/prisma - Database client for querying User table with findUnique method
 *
 * EXPORTS:
 * - GET (function) - Async handler returning NextResponse with {user: UserProfile | null} or error response
 *
 * PATTERNS:
 * - Call via fetch('/api/auth/me') or useSWR hook to get current user state
 * - Returns 200 with {user: null} for unauthenticated requests (not 401)
 * - Returns 500 with {error: string} if database query fails
 *
 * CLAUDE NOTES:
 * - Uses select to limit queried fields - does not expose sensitive data like password hashes
 * - Returns null user for both missing session and missing database record - client cannot distinguish between cases
 * - Session exists but user deleted from DB returns null without error - handles edge case of deleted accounts with active sessions
 * - No caching headers set - client should implement SWR/React Query with revalidation strategy
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ user: null });
    }

    // Fetch full user data from database
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error getting current user:', error);
    return NextResponse.json(
      { error: 'Failed to get user data' },
      { status: 500 }
    );
  }
}
