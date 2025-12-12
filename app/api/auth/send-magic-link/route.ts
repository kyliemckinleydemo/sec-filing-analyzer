import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMagicLinkToken } from '@/lib/auth';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email address is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Generate token
    const token = generateMagicLinkToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Store token in database
    await prisma.magicLinkToken.create({
      data: {
        email: normalizedEmail,
        token,
        expiresAt,
        userId: existingUser?.id,
      },
    });

    // Build magic link URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                    'http://localhost:3000';
    const magicLink = `${baseUrl}/api/auth/verify-magic-link?token=${token}`;

    // Send email via Resend
    // Note: Using onboarding@resend.dev for testing. Replace with verified domain in production.
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    await resend.emails.send({
      from: fromEmail,
      to: normalizedEmail,
      subject: 'Sign in to StockHuntr',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Welcome to StockHuntr</h1>
          <p style="font-size: 16px; color: #333;">Click the button below to sign in to your account. This link will expire in 15 minutes.</p>

          <div style="margin: 30px 0;">
            <a href="${magicLink}"
               style="background: linear-gradient(to right, #2563eb, #7c3aed);
                      color: white;
                      padding: 14px 28px;
                      text-decoration: none;
                      border-radius: 8px;
                      font-size: 16px;
                      display: inline-block;">
              Sign In to StockHuntr
            </a>
          </div>

          <p style="font-size: 14px; color: #666;">
            If you didn't request this email, you can safely ignore it.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

          <p style="font-size: 12px; color: #999;">
            This is an automated message from StockHuntr. Please do not reply to this email.
          </p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: 'Magic link sent! Check your email.',
    });
  } catch (error: any) {
    console.error('Error sending magic link:', error);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
    return NextResponse.json(
      {
        error: 'Failed to send magic link. Please try again.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
