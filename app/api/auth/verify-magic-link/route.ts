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
