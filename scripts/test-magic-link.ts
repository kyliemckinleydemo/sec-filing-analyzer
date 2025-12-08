import { Resend } from 'resend';
import { generateMagicLinkToken } from '../lib/auth';

const resend = new Resend(process.env.RESEND_API_KEY);

async function testMagicLink() {
  console.log('\n=== Testing Magic Link Email ===\n');

  const email = 'john@greatfallsventures.com';
  const token = generateMagicLinkToken();
  const baseUrl = 'https://stockhuntr.net';
  const magicLink = `${baseUrl}/api/auth/verify-magic-link?token=${token}`;

  console.log('Sending to:', email);
  console.log('Token:', token);
  console.log('Magic Link:', magicLink);

  try {
    const result = await resend.emails.send({
      from: 'StockHuntr <onboarding@resend.dev>',
      to: email,
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

    if (result.error) {
      console.error('\n❌ Email failed to send');
      console.error('Error:', JSON.stringify(result.error, null, 2));
    } else {
      console.log('\n✅ Email sent successfully!');
      console.log('Result:', JSON.stringify(result, null, 2));
      console.log('\nCheck your email at:', email);
    }
  } catch (error: any) {
    console.error('\n❌ Exception occurred');
    console.error('Error:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
  }
}

testMagicLink().catch(console.error);
