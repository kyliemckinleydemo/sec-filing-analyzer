import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function testResend() {
  console.log('\n=== Testing Resend API ===\n');

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY not found in environment');
    return;
  }

  console.log('✅ RESEND_API_KEY found');
  console.log('API Key (first 10 chars):', process.env.RESEND_API_KEY.substring(0, 10) + '...');

  try {
    console.log('\n--- Sending test email ---');
    const result = await resend.emails.send({
      from: 'StockHuntr <noreply@stockhuntr.net>',
      to: 'john@greatfallsventures.com',
      subject: 'Test Email from StockHuntr',
      html: '<h1>Test Email</h1><p>If you received this, Resend is working!</p>',
    });

    console.log('✅ Email sent successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('❌ Failed to send email');
    console.error('Error:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));

    if (error.message?.includes('domain')) {
      console.log('\n⚠️  Domain Issue Detected!');
      console.log('The domain "stockhuntr.com" needs to be verified in Resend.');
      console.log('\nOptions:');
      console.log('1. Verify stockhuntr.com domain in Resend dashboard');
      console.log('2. Use a verified sender email (e.g., from your personal domain)');
      console.log('3. Use Resend\'s sandbox domain (noreply@stockhuntr.net) for testing');
    }
  }
}

testResend().catch(console.error);
