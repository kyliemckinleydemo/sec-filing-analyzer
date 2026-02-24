/**
 * @module app/api/auth/signout/route
 * @description Next.js API route handling user sign-out by clearing session cookies and returning confirmation
 *
 * PURPOSE:
 * - Accepts POST requests to /api/auth/signout endpoint
 * - Clears authentication session cookie via clearSessionCookie utility
 * - Returns JSON success response with confirmation message
 * - Handles errors with 500 status and error message
 *
 * DEPENDENCIES:
 * - next/server - Provides NextResponse for JSON API responses
 * - @/lib/auth - Provides clearSessionCookie function to remove session cookies
 *
 * EXPORTS:
 * - POST (function) - Async handler clearing session cookie and returning success/error JSON
 *
 * PATTERNS:
 * - Call via fetch('/api/auth/signout', { method: 'POST' })
 * - Success returns { success: true, message: 'Signed out successfully' }
 * - Errors return { error: 'Failed to sign out' } with status 500
 *
 * CLAUDE NOTES:
 * - Does not accept or validate any request body - sign-out is immediate on POST
 * - Session clearing happens server-side via clearSessionCookie - no client-side token deletion needed
 * - Logs errors to console for debugging but returns generic error message to client
 */
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export async function POST() {
  try {
    await clearSessionCookie();

    return NextResponse.json({
      success: true,
      message: 'Signed out successfully',
    });
  } catch (error) {
    console.error('Error signing out:', error);
    return NextResponse.json(
      { error: 'Failed to sign out' },
      { status: 500 }
    );
  }
}
