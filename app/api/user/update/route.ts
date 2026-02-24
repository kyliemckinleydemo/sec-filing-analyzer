/**
 * @module app/api/user/update/route
 * @description Next.js API route handler that updates authenticated user's profile name in the database
 *
 * PURPOSE:
 * - Validates user authentication via session before allowing updates
 * - Updates user's name field in database using Prisma ORM
 * - Returns updated user object with id, email, name, tier, and createdAt fields
 * - Returns 401 for unauthenticated requests and 500 for database errors
 *
 * DEPENDENCIES:
 * - @/lib/auth - Provides getSession() to retrieve authenticated user's session with userId
 * - @/lib/prisma - Exports Prisma client instance for database operations on user table
 *
 * EXPORTS:
 * - PATCH (function) - Async handler accepting NextRequest and returning JSON with updated user or error response
 *
 * PATTERNS:
 * - Send PATCH request to /api/user/update with JSON body containing { name: string }
 * - Include authentication credentials in request (session cookie expected by getSession)
 * - Expect 200 response with { user: UserObject } on success or { error: string } with 401/500 status on failure
 *
 * CLAUDE NOTES:
 * - Only the name field can be updated - email, tier, and other fields are immutable through this endpoint
 * - Uses Prisma's select clause to explicitly control which fields are returned, excluding sensitive data
 * - No validation on name input (length, format, profanity) - accepts any string value
 * - Session userId is trusted without additional verification once getSession() succeeds
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { name } = await request.json();

    // Update user
    const user = await prisma.user.update({
      where: { id: session.userId },
      data: { name },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
